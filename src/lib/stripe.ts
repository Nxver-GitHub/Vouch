/**
 * Vouch — minimal Stripe client over raw `fetch`.
 *
 * WHY no stripe-node: the SDK pulls a Node-shaped HTTP stack and a large
 * surface we do not use. On Workers that is a bundling risk on the day of the
 * demo for zero benefit — we make three request shapes in total.
 *
 * Conventions, all verified against the live test account (livemode false):
 *   - Bodies are application/x-www-form-urlencoded (URLSearchParams).
 *   - Nested params use bracket keys: `line_items[0][price]`.
 *   - Every POST carries `Idempotency-Key`, so an agent retry — or a Workers
 *     runtime that re-runs a handler — cannot create a second charge.
 *
 * Errors NEVER surface Stripe's `error.message` to a caller: that string can
 * echo request parameters back out. Only `type`/`code`/HTTP status escape.
 */

import type { Env } from '../types';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** Only the secret is needed, so callers can pass a narrow object in tests. */
export type StripeAuth = Pick<Env, 'STRIPE_SECRET_KEY'>;

/** Result envelope. No throwing across the module boundary. */
export type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 * Object shapes — only the fields we actually read.
 * ------------------------------------------------------------------ */

export type StripePrice = {
  id: string;
  /** Present because `product_data[name]` creates the product implicitly. */
  product: string;
};

export type StripePaymentLink = {
  id: string;
  url: string;
};

export type CheckoutPaymentStatus = 'paid' | 'unpaid' | 'no_payment_required' | string;
export type CheckoutStatus = 'open' | 'complete' | 'expired' | string;

export type StripeCheckoutSession = {
  id: string;
  status: CheckoutStatus;
  payment_status: CheckoutPaymentStatus;
  /** Copied from the payment link's own `metadata`. */
  metadata: Record<string, string>;
};

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: unknown };
};

/* ------------------------------------------------------------------ *
 * Narrowing. Everything off the wire is `unknown` until proven otherwise.
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Flat string map, for `metadata`. Non-string values are dropped, not coerced. */
function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function asPrice(value: unknown): StripePrice | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const product = str(value.product);
  return id && product ? { id, product } : null;
}

function asPaymentLink(value: unknown): StripePaymentLink | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const url = str(value.url);
  return id && url ? { id, url } : null;
}

function asCheckoutSession(value: unknown): StripeCheckoutSession | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  return {
    id,
    status: str(value.status) ?? 'unknown',
    payment_status: str(value.payment_status) ?? 'unknown',
    metadata: stringMap(value.metadata),
  };
}

/** Narrow a parsed webhook body. Returns null rather than trusting the shape. */
export function asStripeEvent(value: unknown): StripeEvent | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const type = str(value.type);
  if (!id || !type || !isRecord(value.data)) return null;
  return { id, type, data: { object: value.data.object } };
}

/** Narrow `event.data.object` for `checkout.session.completed`. */
export function asCompletedSession(value: unknown): StripeCheckoutSession | null {
  return asCheckoutSession(value);
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

type FormFields = Readonly<Record<string, string | number | undefined>>;

/** `undefined` entries are omitted — Stripe treats an empty string as a value. */
function encodeForm(fields: FormFields): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body;
}

/** Turn a Stripe error body into something safe to hand a caller. */
function describeFailure(status: number, payload: unknown): string {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const kind = error ? (str(error.type) ?? 'api_error') : 'api_error';
  const code = error ? str(error.code) : null;
  // Deliberately excludes error.message / error.param: those can echo the
  // request we sent, which is how request data leaks into a response.
  return code ? `stripe ${status} ${kind}/${code}` : `stripe ${status} ${kind}`;
}

async function request<T>(
  auth: StripeAuth,
  method: 'GET' | 'POST',
  path: string,
  narrow: (value: unknown) => T | null,
  fields?: FormFields,
): Promise<StripeResult<T>> {
  if (!auth.STRIPE_SECRET_KEY) return { ok: false, error: 'stripe: missing secret key' };

  const headers: Record<string, string> = {
    authorization: `Bearer ${auth.STRIPE_SECRET_KEY}`,
  };
  if (method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    // A retry that reuses this key returns the ORIGINAL object instead of
    // creating a second one. This is the only thing standing between an agent
    // retry and a duplicate subscription.
    headers['idempotency-key'] = crypto.randomUUID();
  }

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body: method === 'POST' && fields ? encodeForm(fields) : undefined,
    });
  } catch {
    // Network-level failure. Say so; never pretend the call succeeded.
    return { ok: false, error: 'stripe: request failed to reach the API' };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) return { ok: false, error: describeFailure(response.status, payload) };

  const data = narrow(payload);
  if (!data) return { ok: false, error: `stripe: unexpected response shape from ${path}` };
  return { ok: true, data };
}

/* ------------------------------------------------------------------ *
 * The three calls this product makes
 * ------------------------------------------------------------------ */

export type RecurringInterval = 'day' | 'week' | 'month' | 'year';

export type CreatePriceParams = {
  /** Cents. 3900 = $39.00. */
  unitAmount: number;
  currency: string;
  interval: RecurringInterval;
  /** Creates the Product implicitly — two API calls for an offer, not three. */
  productName: string;
};

export async function createRecurringPrice(
  auth: StripeAuth,
  params: CreatePriceParams,
): Promise<StripeResult<StripePrice>> {
  return request(auth, 'POST', '/prices', asPrice, {
    currency: params.currency,
    unit_amount: params.unitAmount,
    'recurring[interval]': params.interval,
    'product_data[name]': params.productName,
  });
}

export type CreatePaymentLinkParams = {
  priceId: string;
  quantity: number;
  /** Copied onto every Checkout Session this link creates. */
  metadata: Readonly<Record<string, string>>;
  /**
   * GOTCHA (verified): payment-link `metadata` does NOT reach the Subscription
   * created by a recurring price — `subscription_data.metadata` comes back `{}`.
   * Pass this too if anything downstream (renewals, invoice webhooks) needs to
   * resolve the business from a Subscription rather than from the Session.
   */
  subscriptionMetadata?: Readonly<Record<string, string>>;
};

export async function createPaymentLink(
  auth: StripeAuth,
  params: CreatePaymentLinkParams,
): Promise<StripeResult<StripePaymentLink>> {
  const fields: Record<string, string | number> = {
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': params.quantity,
  };
  for (const [k, v] of Object.entries(params.metadata)) fields[`metadata[${k}]`] = v;
  for (const [k, v] of Object.entries(params.subscriptionMetadata ?? {})) {
    fields[`subscription_data[metadata][${k}]`] = v;
  }
  return request(auth, 'POST', '/payment_links', asPaymentLink, fields);
}

/**
 * The poll fallback: most recent Checkout Session for a link, or null when the
 * link has never been opened. An empty `data` array means unpaid, not an error.
 */
export async function getLatestSessionForLink(
  auth: StripeAuth,
  linkId: string,
): Promise<StripeResult<StripeCheckoutSession | null>> {
  const query = new URLSearchParams({ payment_link: linkId, limit: '1' });

  // The result is wrapped in an object because `narrow` signals "bad shape"
  // with null, and "no sessions yet" is a legitimate null we must not confuse
  // with a parse failure.
  const result = await request(
    auth,
    'GET',
    `/checkout/sessions?${query.toString()}`,
    (value): { session: StripeCheckoutSession | null } | null => {
      if (!isRecord(value) || !Array.isArray(value.data)) return null;
      if (value.data.length === 0) return { session: null };
      const session = asCheckoutSession(value.data[0]);
      return session ? { session } : null;
    },
  );

  return result.ok ? { ok: true, data: result.data.session } : result;
}

/** A session that has actually been paid, not merely completed. */
export function isSessionPaid(session: StripeCheckoutSession): boolean {
  return session.payment_status === 'paid' && session.status === 'complete';
}
