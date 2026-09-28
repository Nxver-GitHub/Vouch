/**
 * Vouch — Revenue agent.
 *
 * Owns exactly one transition: `offered` -> `paid`.
 *
 * Two independent paths report that transition and they race:
 *   1. the Stripe webhook (fast, but needs a public URL and a good signature)
 *   2. `pollLinkStatus` (slow, but works when the tunnel is down mid-demo)
 *
 * Both call `markPaid`. `markPaid` is therefore the ONLY place allowed to
 * decide that a payment is new, and it decides with a conditional UPDATE so
 * that D1 — not application logic — arbitrates the race. Whoever's UPDATE
 * reports changed rows owns the side effects (the event row, the Slack post).
 * The loser is told it changed nothing and stays quiet.
 */

import type { AgentEvent, Env } from '../types';
import { assertBudget, recordSpend, safeError, redact, verifyStripeSignature } from '../lib/security';
import {
  asCompletedSession,
  asStripeEvent,
  createPaymentLink,
  createRecurringPrice,
  getLatestSessionForLink,
  isSessionPaid,
  type StripeCheckoutSession,
} from '../lib/stripe';

/* ------------------------------------------------------------------ *
 * The offer
 * ------------------------------------------------------------------ */

/** $39/month. Deterministic money lives in code, never in a model. */
const PRICE_UNIT_AMOUNT_CENTS = 3900;
const PRICE_CURRENCY = 'usd';
const PRICE_INTERVAL = 'month' as const;
const LINE_ITEM_QUANTITY = 1;

/** Display amount for the payments ledger. Cents are the source of truth. */
const PRICE_AMOUNT_USD = PRICE_UNIT_AMOUNT_CENTS / 100;

/**
 * Stripe bills no per-request API fee — its cut (2.9% + 30¢) comes out of the
 * settled payment, not out of our run budget. So the booked cost is zero.
 *
 * We still gate on `assertBudget` before every call: a run that has halted on
 * budget must stop producing customer-visible artefacts, and the ledger should
 * show that Revenue ran. The bucket is 'decide', not 'engines' — 'engines' is
 * reserved for the fixed-cost ground-truth probes and pollutes the cost panel.
 */
const STRIPE_CALL_COST_USD = 0;
const STRIPE_COST_BUCKET = 'decide' as const;

const WEBHOOK_EVENT_PAID = 'checkout.session.completed';

/* ------------------------------------------------------------------ *
 * Events — the dashboard animates off these rows.
 * ------------------------------------------------------------------ */

/** `agent` and `ts` are stamped here so no caller can emit under another name. */
type RevenueEvent = Omit<AgentEvent, 'agent' | 'ts'>;

async function emit(env: Env, event: RevenueEvent): Promise<void> {
  const row: AgentEvent = { ...event, agent: 'revenue', ts: Date.now() };
  const { run_id, state, message, ...payload } = row;
  try {
    await env.DB.prepare(
      'INSERT INTO events (run_id, agent, state, message, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(run_id, 'revenue', state, message, JSON.stringify(payload), row.ts)
      .run();
  } catch {
    // An event row is telemetry. Losing one must never fail a payment.
  }
}

/* ------------------------------------------------------------------ *
 * createOffer
 * ------------------------------------------------------------------ */

export type OfferBusiness = {
  id: string;
  name: string;
  /** The run this offer belongs to — drives the budget ledger and the events. */
  runId: string;
};

export type Offer = {
  paymentUrl: string;
  linkId: string;
  priceId: string;
};

export type OfferResult = { ok: true; offer: Offer } | { ok: false; error: string };

/**
 * Price + payment link (two calls, not three: `product_data[name]` creates the
 * product inline), then one `payments` row at status `offered`.
 */
export async function createOffer(env: Env, business: OfferBusiness): Promise<OfferResult> {
  const { runId } = business;

  try {
    const priceBudget = await assertBudget(env.DB, runId, STRIPE_CALL_COST_USD);
    if (!priceBudget.ok) {
      await emit(env, {
        run_id: runId,
        state: 'failed',
        message: 'Offer halted: run is over budget.',
      });
      return { ok: false, error: 'budget_halted' };
    }

    await emit(env, { run_id: runId, state: 'working', message: `Pricing ${business.name}…` });

    const price = await createRecurringPrice(env, {
      unitAmount: PRICE_UNIT_AMOUNT_CENTS,
      currency: PRICE_CURRENCY,
      interval: PRICE_INTERVAL,
      productName: `Vouch — ${business.name}`,
    });
    await recordSpend(env.DB, runId, STRIPE_COST_BUCKET, STRIPE_CALL_COST_USD);

    if (!price.ok) {
      await emit(env, { run_id: runId, state: 'failed', message: `Price failed: ${price.error}` });
      return { ok: false, error: price.error };
    }

    const linkBudget = await assertBudget(env.DB, runId, STRIPE_CALL_COST_USD);
    if (!linkBudget.ok) return { ok: false, error: 'budget_halted' };

    const metadata = { business_id: business.id, run_id: runId };
    const link = await createPaymentLink(env, {
      priceId: price.data.id,
      quantity: LINE_ITEM_QUANTITY,
      metadata,
      // The verified gotcha: link metadata reaches the Checkout Session but
      // NOT the Subscription a recurring price creates. Renewal webhooks carry
      // the Subscription, so business_id has to be written there separately or
      // month two arrives with nothing to join on.
      subscriptionMetadata: metadata,
    });
    await recordSpend(env.DB, runId, STRIPE_COST_BUCKET, STRIPE_CALL_COST_USD);

    if (!link.ok) {
      await emit(env, { run_id: runId, state: 'failed', message: `Link failed: ${link.error}` });
      return { ok: false, error: link.error };
    }

    await env.DB.prepare(
      'INSERT INTO payments (id, business_id, run_id, stripe_price_id, stripe_link_id, ' +
        'payment_url, amount_usd, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        crypto.randomUUID(),
        business.id,
        runId,
        price.data.id,
        link.data.id,
        link.data.url,
        PRICE_AMOUNT_USD,
        'offered',
        Date.now(),
      )
      .run();

    await env.DB.prepare('UPDATE businesses SET status = ? WHERE id = ? AND status != ?')
      .bind('offered', business.id, 'paid')
      .run();

    await emit(env, {
      run_id: runId,
      state: 'done',
      url: link.data.url,
      message: `Offer ready — $${PRICE_AMOUNT_USD}/month.`,
    });

    return {
      ok: true,
      offer: { paymentUrl: link.data.url, linkId: link.data.id, priceId: price.data.id },
    };
  } catch (e: unknown) {
    await emit(env, { run_id: runId, state: 'failed', message: `Offer error: ${safeError(e)}` });
    return { ok: false, error: safeError(e) };
  }
}

/* ------------------------------------------------------------------ *
 * markPaid — the single idempotent transition
 * ------------------------------------------------------------------ */

export type MarkPaidResult =
  | { ok: true; transitioned: boolean }
  | { ok: false; error: string };

/**
 * Safe to call from the webhook and the poll, concurrently, any number of times.
 *
 * `WHERE status != 'paid'` makes D1 the arbiter: the statement is a single
 * atomic write, so exactly one caller can observe `changes > 0` for a given
 * row. `transitioned` is that observation — the caller that gets `true` is the
 * one that posts to Slack. Everyone else gets `false` and posts nothing.
 */
export async function markPaid(
  env: Env,
  businessId: string,
  sessionId: string,
): Promise<MarkPaidResult> {
  try {
    // The events table needs a run_id, and the payment row is where it lives.
    const payment = await env.DB.prepare(
      'SELECT run_id FROM payments WHERE business_id = ? ORDER BY created_at DESC LIMIT 1',
    )
      .bind(businessId)
      .first<{ run_id: string | null }>();

    if (!payment) {
      // A paid session for a business we never made an offer to. Loud, not silent.
      return { ok: false, error: `no payment row for business ${redact(businessId)}` };
    }

    const paidAt = Date.now();
    const update = await env.DB.prepare(
      "UPDATE payments SET status = 'paid', paid_at = ?, stripe_session_id = ? " +
        "WHERE business_id = ? AND status != 'paid'",
    )
      .bind(paidAt, sessionId, businessId)
      .run();

    const transitioned = (update.meta?.changes ?? 0) > 0;
    if (!transitioned) return { ok: true, transitioned: false };

    await env.DB.prepare('UPDATE businesses SET status = ? WHERE id = ?')
      .bind('paid', businessId)
      .run();

    if (payment.run_id) {
      await emit(env, {
        run_id: payment.run_id,
        state: 'done',
        message: `Paid — $${PRICE_AMOUNT_USD}/month.`,
      });
    }

    return { ok: true, transitioned: true };
  } catch (e: unknown) {
    return { ok: false, error: safeError(e) };
  }
}

/* ------------------------------------------------------------------ *
 * handleWebhook
 * ------------------------------------------------------------------ */

/**
 * Verify FIRST, parse second. An unverified body is attacker-controlled input
 * and must not reach JSON.parse-derived logic that touches money.
 */
export async function handleWebhook(
  env: Env,
  rawBody: string,
  sigHeader: string | undefined,
): Promise<Response> {
  const verified = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ error: 'bad_signature' }, 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: 'bad_payload' }, 400);
  }

  const event = asStripeEvent(parsed);
  if (!event) return json({ error: 'bad_payload' }, 400);

  // Anything else is acknowledged so Stripe stops retrying it.
  if (event.type !== WEBHOOK_EVENT_PAID) return json({ received: true, ignored: event.type });

  const session = asCompletedSession(event.data.object);
  if (!session) return json({ received: true, ignored: 'unreadable_session' });

  const businessId = session.metadata.business_id;
  if (!businessId) {
    // A link created outside this system. Retrying will never help, so 200.
    return json({ received: true, ignored: 'no_business_id' });
  }

  const result = await markPaid(env, businessId, session.id);
  if (!result.ok) {
    // 500 asks Stripe to retry. That is safe precisely because markPaid is
    // idempotent — a retry after a D1 blip cannot double-apply.
    return json({ error: 'mark_paid_failed' }, 500);
  }

  return json({ received: true, transitioned: result.transitioned });
}

function json(body: Readonly<Record<string, unknown>>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/* ------------------------------------------------------------------ *
 * pollLinkStatus — the fallback when the webhook never arrives
 * ------------------------------------------------------------------ */

export type PollResult =
  | { ok: true; paid: false }
  | { ok: true; paid: true; sessionId: string; businessId: string; transitioned: boolean }
  | { ok: false; error: string };

/**
 * Reads the most recent Checkout Session for a link. An empty list means the
 * link has not been opened yet — unpaid, not an error.
 */
export async function pollLinkStatus(env: Env, linkId: string): Promise<PollResult> {
  try {
    const result = await getLatestSessionForLink(env, linkId);
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.data || !isSessionPaid(result.data)) return { ok: true, paid: false };

    const session: StripeCheckoutSession = result.data;
    const businessId = session.metadata.business_id ?? (await businessIdForLink(env, linkId));
    if (!businessId) return { ok: false, error: `paid session ${session.id} has no business` };

    const marked = await markPaid(env, businessId, session.id);
    if (!marked.ok) return { ok: false, error: marked.error };

    return {
      ok: true,
      paid: true,
      sessionId: session.id,
      businessId,
      transitioned: marked.transitioned,
    };
  } catch (e: unknown) {
    return { ok: false, error: safeError(e) };
  }
}

/** Fallback join when a session somehow arrives without our metadata. */
async function businessIdForLink(env: Env, linkId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT business_id FROM payments WHERE stripe_link_id = ?')
    .bind(linkId)
    .first<{ business_id: string }>();
  return row?.business_id ?? null;
}
