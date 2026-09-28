/**
 * Vouch — run the pipeline on Brainbase instead of in this Worker.
 *
 * The five agents (Orchestrator, Auditor, Builder, Revenue, Outreach) are
 * managed agents in Brainbase, wired together by the "Vouch Pipeline"
 * orchestration as a CHAIN: each agent hands off to the next by starting a
 * child task, and results never flow back up. So one thread only ever shows
 * one agent's work.
 *
 * This file starts the Orchestrator, then follows the chain: every poll it
 * lists the child tasks of the task at the tip of the chain. A child on the
 * next Vouch agent becomes the new tip. Each agent gets its own events in the
 * `events` table, so the dashboard's /api/events poll lights up Auditor,
 * Builder, Revenue and Outreach on their own rows.
 *
 * Returns the same StartRunResult shape as orchestrator.startRun, so /api/run
 * streams it with no other changes.
 *
 * Brainbase does not document its task status values. Seen so far: idle (created,
 * not started), running, success, fail, need_more_info. A hand-off (a child task appearing) also
 * counts as the parent finishing: the hand-off is each agent's last step and
 * the parent's status can lag behind it.
 */

import type { Env, AgentEvent, AgentName } from '../types';
import type { StartRunInput, StartRunResult, Waitable } from './orchestrator';
import { createThread, getThread, listChildTasks, listMessages, messageText, type BrainbaseTask } from '../lib/brainbase';
import { safeError } from '../lib/security';

/** Up to two Brainbase calls per poll; 10s keeps a 30-minute run to ~360 subrequests. */
const POLL_MS = 10_000;
const RUN_DEADLINE_MS = 30 * 60_000;
/** How long a finished agent may go without handing off before the chain counts as stopped. */
const HANDOFF_GRACE_MS = 90_000;
const SUMMARY_CHARS = 280;

const CHAIN: readonly AgentName[] = ['orchestrator', 'auditor', 'builder', 'revenue', 'outreach'];

// NOT 'idle': a freshly handed-off task sits at 'idle' before it starts work.
const DONE_STATUSES = new Set(['success', 'succeeded', 'completed', 'complete', 'done']);
const FAILED_STATUSES = new Set(['fail', 'failed', 'error', 'errored', 'cancelled', 'canceled', 'interrupted']);
const WAITING_STATUSES = new Set(['need_more_info', 'waiting', 'awaiting_input']);

type Outcome = 'done' | 'failed' | 'waiting';

async function emit(env: Env, runId: string, agent: AgentName, state: AgentEvent['state'], message: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO events (run_id, agent, state, message, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(runId, agent, state, message, null, Date.now())
    .run();
}

function outcomeOf(status: string): Outcome | null {
  const key = status.toLowerCase();
  if (DONE_STATUSES.has(key)) return 'done';
  if (FAILED_STATUSES.has(key)) return 'failed';
  if (WAITING_STATUSES.has(key)) return 'waiting';
  return null;
}

/** agent_id -> Vouch role, from the BRAINBASE_AGENT_IDS var. Unknown ids are ignored. */
function roleMap(env: Env): Map<string, AgentName> {
  const map = new Map<string, AgentName>();
  try {
    const parsed = JSON.parse(env.BRAINBASE_AGENT_IDS || '{}') as Record<string, unknown>;
    for (const role of CHAIN) {
      const id = parsed[role];
      if (typeof id === 'string' && id) map.set(id, role);
    }
  } catch {
    // Malformed var: no child is ever recognised, so the run reports that the
    // chain stopped after the Orchestrator — loud, not silent.
  }
  return map;
}

/**
 * The hand-off to follow among a task's children: the next agent's task that
 * has progressed furthest. Duplicate hand-offs happen, and an unstarted copy
 * ('idle') must not be followed while a working one exists.
 */
function pickHandoff(items: readonly BrainbaseTask[], roles: Map<string, AgentName>, role: AgentName): BrainbaseTask | undefined {
  const rank = (s: string): number => {
    const k = s.toLowerCase();
    if (k === 'idle') return 0;
    if (outcomeOf(k) === null) return 1; // running
    return 2; // settled: done, failed or waiting
  };
  return items
    .filter((t) => roles.get(t.agent_id) === role)
    .sort((a, b) => rank(b.status) - rank(a.status))[0];
}

/** Last assistant message of a task, flattened and clipped, for the agent's row. */
async function summaryOf(env: Env, taskId: string): Promise<string> {
  const messages = await listMessages(env, taskId);
  if (!messages.ok) return '';
  const last = [...messages.data.items].reverse().find((m) => m.role === 'assistant' && messageText(m.content).trim());
  if (!last) return '';
  const text = messageText(last.content).replace(/\s+/g, ' ').trim();
  return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS)}…` : text;
}

export async function startBrainbaseRun(env: Env, ctx: Waitable, input: StartRunInput): Promise<StartRunResult> {
  const agentId = (env.BRAINBASE_ORCHESTRATOR_ID ?? '').trim();
  if (!agentId) throw new Error('BRAINBASE_ORCHESTRATOR_ID is not configured');

  const runId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO runs (id, business_id, status, started_at) VALUES (?, ?, ?, ?)')
    .bind(runId, '', 'running', Date.now())
    .run();

  const pipeline = runOnBrainbase(env, runId, agentId, input);
  ctx.waitUntil(pipeline);
  return { runId, businessName: input.name, pipeline };
}

async function runOnBrainbase(env: Env, runId: string, agentId: string, input: StartRunInput): Promise<void> {
  let finalStatus: 'done' | 'failed' = 'failed';
  try {
    const lines = [`name: ${input.name}`, `city: ${input.city}`];
    if (input.neighborhood) lines.push(`neighborhood: ${input.neighborhood}`);

    const created = await createThread(env, agentId, lines.join('\n'), { vouch_run_id: runId });
    if (!created.ok) {
      await emit(env, runId, 'orchestrator', 'failed', `Brainbase refused the run: ${created.error}`);
      return;
    }
    await emit(env, runId, 'orchestrator', 'working', 'Started on Brainbase.');

    const roles = roleMap(env);
    const deadline = Date.now() + RUN_DEADLINE_MS;

    // The tip is the furthest agent reached so far; every agent before it is settled.
    let tip: { taskId: string; parentId: string | null; role: AgentName; status: string } = {
      taskId: created.data.thread_id,
      parentId: null,
      role: 'orchestrator',
      status: created.data.status,
    };
    let settledAs: Outcome | null = null;
    let settledAt = 0;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const nextRole: AgentName | undefined = CHAIN[CHAIN.indexOf(tip.role) + 1];

      // 1. Did the tip hand off? A child task on the next agent moves the tip forward.
      if (nextRole) {
        const children = await listChildTasks(env, tip.taskId);
        const next = children.ok ? pickHandoff(children.data.items, roles, nextRole) : undefined;
        if (next) {
          const summary = await summaryOf(env, tip.taskId);
          await emit(env, runId, tip.role, 'done', summary || `Handed off to ${nextRole}.`);
          await emit(env, runId, nextRole, 'working', next.title || 'Started.');
          tip = { taskId: next.id, parentId: tip.taskId, role: nextRole, status: next.status };
          settledAs = null;
          continue;
        }
      }

      // 1b. An agent sometimes hands off more than once. If the copy we follow is
      // still 'idle' (never started), switch to a sibling copy that did start.
      if (tip.parentId && tip.status.toLowerCase() === 'idle') {
        const siblings = await listChildTasks(env, tip.parentId);
        const started = siblings.ok ? pickHandoff(siblings.data.items, roles, tip.role) : undefined;
        if (started && started.id !== tip.taskId && started.status.toLowerCase() !== 'idle') {
          tip = { ...tip, taskId: started.id, status: started.status };
          settledAs = null;
          continue;
        }
      }

      // 2. Otherwise, has the tip itself finished?
      const thread = await getThread(env, tip.taskId);
      if (!thread.ok) continue; // a transient read failure is not the run failing
      tip.status = thread.data.status;
      const outcome = outcomeOf(tip.status);
      if (!outcome) {
        settledAs = null;
        continue;
      }
      if (settledAs !== outcome) {
        settledAs = outcome;
        settledAt = Date.now();
      }

      // A finished middle agent gets a grace period to hand off before we give up on it.
      if (nextRole && outcome === 'done' && Date.now() - settledAt < HANDOFF_GRACE_MS) continue;

      const summary = await summaryOf(env, tip.taskId);
      await emit(env, runId, tip.role, outcome, summary || `Brainbase status: ${tip.status}`);

      if (outcome === 'failed') {
        await emit(env, runId, 'orchestrator', 'failed', `The chain stopped: ${tip.role} failed.`);
      } else if (nextRole && outcome === 'done') {
        await emit(env, runId, 'orchestrator', 'failed', `The chain stopped: ${tip.role} finished but never handed off to ${nextRole}.`);
      } else {
        // The last agent finished, or an agent is waiting on a human (e.g. outreach approval).
        finalStatus = 'done';
        await emit(env, runId, 'orchestrator', 'done', `Run complete — reached ${tip.role}.`);
      }
      return;
    }

    await emit(env, runId, tip.role, 'failed', `Still "${tip.status}" after ${RUN_DEADLINE_MS / 60_000} min — stopped watching.`);
  } catch (e) {
    await emit(env, runId, 'orchestrator', 'failed', `Run halted: ${safeError(e)}`).catch(() => undefined);
  } finally {
    await env.DB.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?')
      .bind(finalStatus, Date.now(), runId)
      .run()
      .catch(() => undefined);
  }
}
