/**
 * Vouch — Brainbase client (Universal API, v2).
 *
 * Starts a managed agent that already exists in Brainbase by `agent_id` and
 * reads its progress back. The agent's instructions, secrets and orchestration
 * edges all live in Brainbase — nothing here describes the agent inline.
 *
 * Every export resolves to a `BrainbaseResult` instead of throwing, matching
 * lib/linear.ts, so the caller decides whether a failure halts the run.
 *
 * AUTH: `Authorization: Bearer <BRAINBASE_API_KEY>`. The key must belong to the
 * Brainbase org that owns the agent, or thread creation fails.
 */

import type { Env } from '../types';
import { redact } from './security';

const BRAINBASE_API = 'https://api.brainbaselabs.com';
const REQUEST_TIMEOUT_MS = 20_000;

export type BrainbaseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type BrainbaseThread = {
  id: string;
  agent_id: string;
  status: string;
};

export type BrainbaseMessage = {
  id: string;
  task_id: string | null;
  role: string;
  content: unknown;
  created_at: string;
};

async function call<T>(env: Env, method: 'GET' | 'POST', path: string, body?: unknown): Promise<BrainbaseResult<T>> {
  if (!env.BRAINBASE_API_KEY) return { ok: false, error: 'BRAINBASE_API_KEY is not configured' };
  try {
    const res = await fetch(`${BRAINBASE_API}${path}`, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${env.BRAINBASE_API_KEY}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `brainbase HTTP ${res.status} ${redact(detail).slice(0, 200)}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e: unknown) {
    return { ok: false, error: `brainbase: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 200)}` };
  }
}

/** Create a thread on an existing managed agent and start it with `input`. */
export async function createThread(
  env: Env,
  agentId: string,
  input: string,
  metadata: Record<string, string>,
): Promise<BrainbaseResult<{ thread_id: string; agent_id: string; status: string }>> {
  return call(env, 'POST', '/v2/threads', { agent_id: agentId, input, metadata });
}

export async function getThread(env: Env, threadId: string): Promise<BrainbaseResult<BrainbaseThread>> {
  return call(env, 'GET', `/v2/threads/${encodeURIComponent(threadId)}`);
}

export type BrainbaseTask = {
  id: string;
  agent_id: string;
  parent_task_id: string | null;
  title: string;
  status: string;
  created_at: string;
};

/**
 * Tasks started by `parentTaskId` — the hand-offs it made to the next agent.
 * A task id doubles as its thread id, so getThread/listMessages accept it.
 */
export async function listChildTasks(env: Env, parentTaskId: string): Promise<BrainbaseResult<{ items: BrainbaseTask[] }>> {
  return call(env, 'GET', `/v2/tasks?parent_task_id=${encodeURIComponent(parentTaskId)}&limit=10`);
}

export async function listMessages(env: Env, threadId: string): Promise<BrainbaseResult<{ items: BrainbaseMessage[] }>> {
  return call(env, 'GET', `/v2/threads/${encodeURIComponent(threadId)}/messages`);
}

/**
 * Message `content` is not a fixed shape: a string, null, or an array of
 * `{type, text}` parts. Flatten to plain text; anything else becomes ''.
 */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : '',
    )
    .filter(Boolean)
    .join('\n');
}
