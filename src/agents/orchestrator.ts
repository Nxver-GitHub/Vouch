/**
 * Orchestrator — owns the run lifecycle and the hand-offs between agents.
 *
 * Sequential by design. Durable Objects were cut (SCOPE.md cut-line #5): the
 * Agents SDK decorator setup was the largest unverified surface on the critical
 * path, and a plain sequential Worker has none of that risk.
 *
 * D1 BUDGET — the tightest constraint in this file.
 * Free tier allows 50 queries per Worker invocation. The Auditor alone spends
 * ~40. So this file batches every write it can and buffers events, spending at
 * most 4 queries total. If the free ceiling is still breached, upgrading the
 * account to Workers Paid raises the limit to 1000 and takes effect in minutes.
 *
 * Slack and Linear failures never abort a run. Both are cut-line items; the
 * pipeline is the product, the narration is decoration.
 */

import type { Env, AgentEvent, AgentName } from '../types';
import { runAuditor, type AuditorResult } from './auditor';
import { createOffer } from './revenue';
import { runBuilder } from './builder';
import { postAs } from '../lib/slack';
import { createIssue, moveIssue } from '../lib/linear';
import { safeError } from '../lib/security';

export type StartRunInput = { name: string; city: string; neighborhood?: string };

/**
 * We only need waitUntil. Typing it structurally avoids coupling to whichever
 * ExecutionContext definition (Hono's or workers-types') wins the import.
 */
export type Waitable = { waitUntil: (p: Promise<unknown>) => void };
export type StartRunResult = { runId: string; businessName: string };

/** Buffered so a chatty pipeline costs one D1 write, not twenty. */
class EventBuffer {
  private readonly rows: AgentEvent[] = [];
  constructor(private readonly runId: string) {}

  add(agent: AgentName, state: string, message: string, extra: Partial<AgentEvent> = {}): AgentEvent {
    const ev: AgentEvent = {
      run_id: this.runId,
      ts: Date.now(),
      agent,
      state,
      message,
      ...extra,
    };
    this.rows.push(ev);
    return ev;
  }

  /** One batched D1 call regardless of how many events accumulated. */
  async flush(env: Env): Promise<void> {
    if (this.rows.length === 0) return;
    const stmt = env.DB.prepare(
      'INSERT INTO events (run_id, agent, state, message, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const batch = this.rows.map((e) =>
      stmt.bind(
        e.run_id,
        e.agent,
        e.state,
        e.message,
        JSON.stringify({
          business: e.business,
          competitors: e.competitors,
          score: e.score,
          rank: e.rank,
          url: e.url,
          facts: e.facts,
          overlap: e.overlap,
          cost: e.cost,
        }),
        e.ts,
      ),
    );
    this.rows.length = 0;
    await env.DB.batch(batch);
  }
}

/**
 * Create the run and its budget row, then hand back immediately. The pipeline
 * itself runs in the background so `/api/run` answers fast and the dashboard
 * starts polling events straight away.
 */
export async function startRun(
  env: Env,
  ctx: Waitable,
  input: StartRunInput,
): Promise<StartRunResult> {
  const runId = crypto.randomUUID();
  const cap = Number(env.RUN_BUDGET_USD) || 2;
  const now = Date.now();

  // One batch: the run and its budget must both exist before any paid call,
  // because assertBudget fails closed on a missing row.
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO runs (id, business_id, status, started_at) VALUES (?, ?, ?, ?)',
    ).bind(runId, '', 'running', now),
    env.DB.prepare(
      'INSERT INTO budgets (run_id, cap_usd, spent_usd, updated_at) VALUES (?, ?, 0, ?)',
    ).bind(runId, cap, now),
  ]);

  ctx.waitUntil(runPipeline(env, runId, input));
  return { runId, businessName: input.name };
}

async function runPipeline(env: Env, runId: string, input: StartRunInput): Promise<void> {
  const events = new EventBuffer(runId);
  const cap = Number(env.RUN_BUDGET_USD) || 2;
  let issueId: string | null = null;

  try {
    events.add('orchestrator', 'working', `Run started, cap $${cap.toFixed(2)}.`);
    await say(env, 'orchestrator', `Run started for *${input.name}*. Cap $${cap.toFixed(2)}.`);

    const issue = await createIssue(env, `Audit ${input.name}`, `City: ${input.city}`);
    if (issue.ok) issueId = issue.data.id;

    /* ---------------------------- Auditor ---------------------------- */
    events.add('auditor', 'working', 'Probing engines against Places ground truth.');
    const audit: AuditorResult = await runAuditor(env, {
      runId,
      name: input.name,
      city: input.city,
      neighborhood: input.neighborhood,
    });

    const headline = worstFact(audit);
    events.add('auditor', 'done', headline, {
      business: { slug: audit.slug, name: audit.facts.name, lit: false },
      score: audit.score,
      facts: audit.verdicts.map((v) => ({
        key: v.factKey,
        stated: v.stated,
        expected: v.expected,
        engine: v.engine,
        verdict: v.verdict,
      })),
      overlap: audit.overlap ?? undefined,
    });
    await say(env, 'auditor', `Score *${audit.score}/100* (${audit.grade}). ${headline}`);
    if (issueId) await moveIssue(env, issueId, env.LINEAR_STATE_AUDITED);

    // Flush early so the dashboard animates the audit while the Builder works.
    await events.flush(env);

    /* ---------------------------- Builder ----------------------------- */
    events.add('builder', 'working', 'Generating the answer page.');
    let pageUrl: string | null = null;
    try {
      const built = await runBuilder(env, runId, audit);
      pageUrl = built.url;
      events.add('builder', built.published ? 'done' : 'failed',
        built.published
          ? `Published — health check ${built.healthStatus ?? 'no response'}.`
          : 'Page generated but not published.',
        { url: built.url, business: { slug: audit.slug, name: audit.facts.name, lit: false } });
      await say(env, 'builder', `Live: ${built.url}`);
      if (issueId) await moveIssue(env, issueId, env.LINEAR_STATE_DEPLOYED);
    } catch (e) {
      // A failed build must not stop the offer — the audit alone still has value.
      events.add('builder', 'failed', `Build failed: ${safeError(e)}`);
    }

    /* ---------------------------- Revenue ----------------------------- */
    events.add('revenue', 'working', 'Creating the offer.');
    const offer = await createOffer(env, {
      id: audit.businessId,
      name: audit.facts.name,
      runId,
    });

    if (offer.ok) {
      events.add('revenue', 'done', `Payment link ready — $39/mo monitoring.`, {
        url: offer.offer.paymentUrl,
      });
      await say(env, 'revenue', `Offer ready: ${offer.offer.paymentUrl}`);
      if (issueId) await moveIssue(env, issueId, env.LINEAR_STATE_OFFERED);
    } else {
      events.add('revenue', 'failed', `Offer failed: ${offer.error}`);
    }

    events.add('orchestrator', 'done', 'Run complete.');
  } catch (e) {
    // Fail loudly and visibly. A silent stall on stage is worse than an error.
    const detail = safeError(e);
    events.add('orchestrator', 'failed', `Run halted: ${detail}`);
    await say(env, 'orchestrator', `:warning: Run halted — ${detail}`);
  } finally {
    await events.flush(env);
    await env.DB.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?')
      .bind('done', Date.now(), runId)
      .run();
  }
}

/** The single striking wrong fact the demo reads aloud. */
function worstFact(audit: AuditorResult): string {
  const wrong = audit.verdicts.find((v) => v.verdict === 'wrong');
  if (wrong) return `${wrong.engine} says ${wrong.factKey}: "${wrong.stated}" — it's "${wrong.expected}".`;
  const missing = audit.verdicts.find((v) => v.verdict === 'missing');
  if (missing) return `${missing.engine} has no ${missing.factKey} at all.`;
  return 'No factual errors found.';
}

/** Slack is decoration — never let it take the run down with it. */
async function say(env: Env, agent: AgentName, text: string): Promise<void> {
  try {
    await postAs(env, agent, text);
  } catch {
    /* intentionally swallowed: cut-line item, see file header */
  }
}
