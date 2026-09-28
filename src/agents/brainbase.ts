/**
 * Vouch — run the pipeline on Brainbase instead of in this Worker.
 *
 * The five agents (Orchestrator, Auditor, Builder, Revenue, Outreach) are
 * managed agents in Brainbase, wired together by the "Vouch Pipeline"
 * orchestration. This file starts the Orchestrator by id and mirrors its
 * progress into the `events` table, so the dashboard's existing
 * /api/events poll shows a Brainbase run.
 *
 * Returns the same StartRunResult shape as orchestrator.startRun, so /api/run
 * streams it with no other changes.
 *
 * Brainbase does not document its thread status values. Known ones are mapped
 * below; any other status is emitted verbatim and polling continues until the
 * deadline, so an unexpected value shows up on the dashboard, never silently.
 */

import type { Env, AgentEvent } from '../types';
import type { StartRunInput, StartRunResult, Waitable } from './orchestrator';
import { createThread, getThread, listMessages, messageText } from '../lib/brainbase';
import { safeError } from '../lib/security';

const POLL_MS = 5_000;
const RUN_DEADLINE_MS = 20 * 60_000;
const FINAL_MESSAGE_CHARS = 500;

const DONE_STATUSES = new Set(['success', 'succeeded', 'completed', 'complete', 'done', 'idle']);
const FAILED_STATUSES = new Set(['fail', 'failed', 'error', 'errored', 'cancelled', 'canceled', 'interrupted']);

/** Brainbase reports one thread, so every mirrored event is the Orchestrator's. */
async function emit(env: Env, runId: string, state: AgentEvent['state'], message: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO events (run_id, agent, state, message, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(runId, 'orchestrator', state, message, null, Date.now())
    .run();
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
      await emit(env, runId, 'failed', `Brainbase refused the run: ${created.error}`);
      return;
    }
    const threadId = created.data.thread_id;
    await emit(env, runId, 'working', `Handed to Brainbase — thread ${threadId}.`);

    const deadline = Date.now() + RUN_DEADLINE_MS;
    let lastStatus = created.data.status;
    let terminal: 'done' | 'failed' | null = null;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const thread = await getThread(env, threadId);
      if (!thread.ok) {
        // A transient read failure is not the run failing; keep polling.
        continue;
      }
      const status = thread.data.status;
      if (status !== lastStatus) {
        lastStatus = status;
        await emit(env, runId, 'working', `Brainbase status: ${status}`);
      }
      const key = status.toLowerCase();
      if (DONE_STATUSES.has(key)) terminal = 'done';
      else if (FAILED_STATUSES.has(key)) terminal = 'failed';
      if (terminal) break;
    }

    if (!terminal) {
      await emit(env, runId, 'failed', `Brainbase run still "${lastStatus}" after ${RUN_DEADLINE_MS / 60_000} min — stopped watching.`);
      return;
    }

    const messages = await listMessages(env, threadId);
    const last = messages.ok
      ? [...messages.data.items].reverse().find((m) => m.role === 'assistant' && messageText(m.content).trim())
      : undefined;
    const summary = last ? messageText(last.content).trim().slice(0, FINAL_MESSAGE_CHARS) : 'No final message.';

    await emit(env, runId, terminal, terminal === 'done' ? `Run complete on Brainbase. ${summary}` : `Brainbase run failed. ${summary}`);
    finalStatus = terminal;
  } catch (e) {
    await emit(env, runId, 'failed', `Run halted: ${safeError(e)}`).catch(() => undefined);
  } finally {
    await env.DB.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?')
      .bind(finalStatus, Date.now(), runId)
      .run()
      .catch(() => undefined);
  }
}
