/**
 * Vouch — human approval for emails drafted by the Brainbase Outreach agent.
 *
 * Outreach drafts the email, then stops and waits (task status
 * `need_more_info`). The Worker posts that draft to Slack with Approve / Reject
 * buttons and a signed fallback link. A decision is delivered back to the
 * waiting task as its next user turn ("APPROVED …" / "REJECTED …"), and only
 * then does Outreach send through Resend.
 *
 * The gate: a decision is accepted only for a task that (a) belongs to the
 * Vouch Outreach agent and (b) is still waiting. Once a decision is sent the
 * task leaves `need_more_info`, so a double-click, a Slack retry or a
 * refreshed link reports "already handled" and sends nothing.
 */

import type { Env } from '../types';
import { getThread, lastAssistantText, sendTaskInput } from '../lib/brainbase';
import { brainbaseApprovalBlocks, postAs } from '../lib/slack';
import { safeError, signApproveToken, verifyApproveToken } from '../lib/security';

/** A draft can wait a working day for a human. */
const APPROVE_TTL_S = 24 * 3600;
/** Slack section text is capped at 3,000 characters. */
const DRAFT_CHARS = 2800;
const WAITING = 'need_more_info';

export type Decision = 'approve' | 'reject';
export type DecisionResult = { ok: true; text: string } | { ok: false; text: string };

/** Slack mrkdwn only needs these three escaped; the draft is agent output. */
function slackEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function outreachAgentId(env: Env): string | null {
  try {
    const id = (JSON.parse(env.BRAINBASE_AGENT_IDS || '{}') as Record<string, unknown>).outreach;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/** Where the fallback link points. APP_BASE_URL lets a local demo link to localhost. */
function baseUrl(env: Env): string {
  return (env.APP_BASE_URL || `https://${env.PUBLIC_BASE_DOMAIN}`).replace(/\/+$/, '');
}

/** The HMAC subject is namespaced so a Brainbase task link can never approve a legacy business id, or vice versa. */
const subject = (taskId: string): string => `bb:${taskId}`;

export async function approvalLink(env: Env, taskId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + APPROVE_TTL_S;
  const token = await signApproveToken(env.SLACK_SIGNING_SECRET, subject(taskId), exp);
  return `${baseUrl(env)}/approve/brainbase?task=${encodeURIComponent(taskId)}&exp=${exp}&token=${encodeURIComponent(token)}`;
}

export async function verifyApprovalLink(env: Env, taskId: string, exp: number, token: string): Promise<boolean> {
  return verifyApproveToken(env.SLACK_SIGNING_SECRET, subject(taskId), exp, token);
}

/**
 * Post the waiting Outreach task's draft to Slack with the approval buttons.
 * Returns a line for the dashboard. Never throws: a Slack failure still hands
 * back the fallback link so the email can be approved.
 */
export async function requestApproval(env: Env, taskId: string): Promise<string> {
  if (!env.SLACK_SIGNING_SECRET || !env.SLACK_BOT_TOKEN) {
    return 'Draft ready, but approval is not set up here (SLACK_BOT_TOKEN / SLACK_SIGNING_SECRET missing). Nothing was sent.';
  }
  const link = await approvalLink(env, taskId);
  const draft = (await lastAssistantText(env, taskId)) || '(Outreach did not return a draft.)';
  const clipped = draft.length > DRAFT_CHARS ? `${draft.slice(0, DRAFT_CHARS)}…` : draft;
  const post = await postAs(
    env,
    'outreach',
    'Email draft ready — approval required before anything sends.',
    brainbaseApprovalBlocks(taskId, link, slackEscape(clipped)),
  ).catch((e: unknown) => ({ ok: false as const, error: safeError(e) }));
  return post.ok
    ? 'Draft posted to Slack — press Approve & send there.'
    : `Slack post failed (${post.error ?? 'unknown error'}). Approve here instead: ${link}`;
}

/** Deliver a human decision to the waiting Outreach task. Idempotent by task status. */
export async function decide(env: Env, taskId: string, decision: Decision, who: string): Promise<DecisionResult> {
  const expected = outreachAgentId(env);
  if (!expected) return { ok: false, text: 'Approval is not configured (BRAINBASE_AGENT_IDS.outreach).' };

  const thread = await getThread(env, taskId);
  if (!thread.ok) return { ok: false, text: `Could not read the task: ${thread.error}` };
  if (thread.data.agent_id !== expected) return { ok: false, text: 'That task is not a Vouch Outreach draft.' };
  if (thread.data.status.toLowerCase() !== WAITING) return { ok: true, text: 'Already handled — nothing more to do.' };

  const message =
    decision === 'approve'
      ? `APPROVED by ${who}. Send the email now, exactly as drafted, to the recipient in the draft. Then report the Resend message id.`
      : `REJECTED by ${who}. Do not send the email. Finish and report that it was rejected.`;
  const sent = await sendTaskInput(env, taskId, message);
  if (!sent.ok) return { ok: false, text: `Could not reach the Outreach agent: ${sent.error}` };

  return {
    ok: true,
    text: decision === 'approve' ? `✅ Approved by ${who} — Outreach is sending the email.` : `🚫 Rejected by ${who} — no email will be sent.`,
  };
}
