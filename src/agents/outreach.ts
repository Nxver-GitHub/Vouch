/**
 * Vouch — Outreach agent. Drafts the owner email, then gates it behind one
 * human approval.
 *
 * Threat model: this is the only agent that can send something OUT of the
 * system, so the recipient is never taken from a request — it is pinned to
 * `env.DEMO_OWNER_EMAIL` at draft time and re-read from the row at send time,
 * which means a forged Slack payload can at worst approve a draft, never
 * redirect it. `approveOutreach` owns a single conditional UPDATE so D1, not
 * application logic, decides whether a send is new; every other caller is told
 * it changed nothing and sends nothing. The business name and the fact line
 * come from third-party data, so the HTML body escapes every interpolation.
 */

import type { Env } from '../types';
import { escapeHtml, redact, safeError, signApproveToken } from '../lib/security';
import { approveBlocks, postAs } from '../lib/slack';
import { sendEmail } from '../lib/resend';

/** The approve link outlives the Slack round trip but not the demo. */
const APPROVE_TTL_S = 3600;
const MAX_STORED_ERROR_CHARS = 300;

export type OutreachInput = {
  runId: string;
  businessId: string;
  businessName: string;
  slug: string;
  score: number;
  grade: string;
  worstFact: string;
  pageUrl: string | null;
  paymentUrl: string | null;
};

export type OutreachDraft = {
  outreachId: string;
  to: string;
  subject: string;
  slackOk: boolean;
  slackError?: string;
};

export type ApproveResult =
  | { ok: true; transitioned: boolean; sent: boolean; to?: string; error?: string }
  | { ok: false; error: string };

type Copy = { subject: string; text: string; html: string };

type OutreachRow = {
  id: string;
  run_id: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
};

/* ------------------------------------------------------------------ *
 * Copy. Deterministic template in code — no model call, so the claims
 * cannot drift. See CLAIMS in BRIEF.md §11: we measured, we monitor.
 * Never "our page makes AI recommend you".
 * ------------------------------------------------------------------ */

/** Only http(s) links are ever rendered as links. */
function safeUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

function buildText(input: OutreachInput): string {
  const page = safeUrl(input.pageUrl);
  const pay = safeUrl(input.paymentUrl);
  const lines = [
    `Hi — this is Vouch.`,
    ``,
    `We measured what AI assistants currently say about ${input.businessName} and`,
    `scored those answers against the verified details on your business profile.`,
    ``,
    `Accuracy score: ${input.score}/100 (${input.grade})`,
    ``,
    `The clearest gap we found:`,
    input.worstFact,
  ];
  if (page) lines.push(``, `We published your verified details here: ${page}`);
  lines.push(
    ``,
    `We monitor these answers and re-check them on a schedule, so you find out`,
    `when what they say drifts from what is true. We measure and report; we make`,
    `no claim about what any assistant decides to say.`,
  );
  if (pay) lines.push(``, `Start monitoring — $39/month: ${pay}`);
  lines.push(``, `— Vouch`);
  return lines.join('\n');
}

function buildHtml(input: OutreachInput): string {
  const page = safeUrl(input.pageUrl);
  const pay = safeUrl(input.paymentUrl);
  const parts = [
    `<p>Hi — this is Vouch.</p>`,
    `<p>We measured what AI assistants currently say about <strong>${escapeHtml(input.businessName)}</strong> ` +
      `and scored those answers against the verified details on your business profile.</p>`,
    `<p><strong>Accuracy score: ${escapeHtml(input.score)}/100 (${escapeHtml(input.grade)})</strong></p>`,
    `<p>The clearest gap we found:<br><em>${escapeHtml(input.worstFact)}</em></p>`,
  ];
  if (page) {
    parts.push(`<p>We published your verified details here: <a href="${escapeHtml(page)}">${escapeHtml(page)}</a></p>`);
  }
  parts.push(
    `<p>We monitor these answers and re-check them on a schedule, so you find out when what ` +
      `they say drifts from what is true. We measure and report; we make no claim about what ` +
      `any assistant decides to say.</p>`,
  );
  if (pay) {
    parts.push(`<p><a href="${escapeHtml(pay)}">Start monitoring — $39/month</a></p>`);
  }
  parts.push(`<p>— Vouch</p>`);
  return `<!doctype html><html><body>${parts.join('')}</body></html>`;
}

function buildCopy(input: OutreachInput): Copy {
  return {
    subject: `Customers are asking AI about ${input.businessName} — here is what it says`,
    text: buildText(input),
    html: buildHtml(input),
  };
}

/* ------------------------------------------------------------------ *
 * draftOutreach
 * ------------------------------------------------------------------ */

/** Slack mrkdwn only needs these three; the preview is third-party text. */
function slackEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function previewOf(to: string, copy: Copy): string {
  const head = copy.text.split('\n').filter((l) => l.trim().length > 0).slice(0, 4).join('\n');
  return `*Subject:* ${slackEscape(copy.subject)}\n*To:* ${slackEscape(to)}\n\n${slackEscape(head)}…`;
}

/**
 * Upsert the draft. The `WHERE outreach.status != 'sent'` on the conflict
 * branch is the guard: a re-run refreshes a pending draft but can never
 * rewrite — or re-arm — a record whose email already left.
 */
async function upsertDraft(env: Env, input: OutreachInput, to: string, copy: Copy): Promise<string> {
  const id = crypto.randomUUID();
  const row = await env.DB.prepare(
    `INSERT INTO outreach
       (id, business_id, run_id, to_email, subject, body_text, body_html, status, error, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'draft', NULL, ?8)
     ON CONFLICT(business_id) DO UPDATE SET
       run_id     = excluded.run_id,
       to_email   = excluded.to_email,
       subject    = excluded.subject,
       body_text  = excluded.body_text,
       body_html  = excluded.body_html,
       status     = 'draft',
       error      = NULL,
       created_at = excluded.created_at
     WHERE outreach.status != 'sent'
     RETURNING id`,
  )
    .bind(id, input.businessId, input.runId, to, copy.subject, copy.text, copy.html, Date.now())
    .first<{ id: string }>();

  if (row?.id) return row.id;

  // No row came back: the conflict branch was skipped because it is already
  // sent. Keep the existing id so approve/idempotency still address that row.
  const existing = await env.DB.prepare('SELECT id FROM outreach WHERE business_id = ?')
    .bind(input.businessId)
    .first<{ id: string }>();
  if (!existing?.id) throw new Error('outreach: draft upsert wrote nothing');
  return existing.id;
}

/**
 * Recipient is ALWAYS `env.DEMO_OWNER_EMAIL`. This build never emails a real
 * business, so a missing value is a refusal, not a fallback.
 */
export async function draftOutreach(env: Env, input: OutreachInput): Promise<OutreachDraft> {
  const to = (env.DEMO_OWNER_EMAIL ?? '').trim();
  if (!to) throw new Error('outreach: DEMO_OWNER_EMAIL not set — refusing to draft');

  const copy = buildCopy(input);
  const outreachId = await upsertDraft(env, input, to, copy);

  const expiresAt = Math.floor(Date.now() / 1000) + APPROVE_TTL_S;
  const token = await signApproveToken(env.SLACK_SIGNING_SECRET, input.businessId, expiresAt);

  // Slack is decoration; a failed post must never lose the draft we just wrote.
  let slackOk = false;
  let slackError: string | undefined;
  try {
    const post = await postAs(
      env,
      'outreach',
      `Draft ready for *${slackEscape(input.businessName)}* — approval required before anything sends.`,
      approveBlocks(input.businessId, token, expiresAt, previewOf(to, copy)),
    );
    slackOk = post.ok;
    slackError = post.error;
  } catch (e) {
    slackError = safeError(e);
  }

  return { outreachId, to, subject: copy.subject, slackOk, slackError };
}

/* ------------------------------------------------------------------ *
 * approveOutreach — the single idempotent gate
 * ------------------------------------------------------------------ */

/** Same INSERT shape as the other agents' `emit`. Telemetry never fails a send. */
async function emitOutreach(
  env: Env,
  runId: string | null,
  state: 'done' | 'failed',
  message: string,
): Promise<void> {
  if (!runId) return;
  try {
    await env.DB.prepare(
      'INSERT INTO events (run_id, agent, state, message, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(runId, 'outreach', state, message, null, Date.now())
      .run();
  } catch {
    // An event row is telemetry. Losing one must never change the send outcome.
  }
}

/**
 * `WHERE business_id = ? AND status = 'draft'` makes D1 the arbiter: exactly
 * one caller can observe `changes > 0`, and only that caller sends. The Slack
 * button and the web link both land here, so a double-click, a Slack retry and
 * a refreshed approve URL all collapse to one email.
 *
 * `approvedBy` is a Slack user id or the literal 'link'. It is stored and never
 * interpreted — it selects no behaviour and reaches no template.
 */
export async function approveOutreach(
  env: Env,
  businessId: string,
  approvedBy: string,
): Promise<ApproveResult> {
  try {
    const gate = await env.DB.prepare(
      "UPDATE outreach SET status = 'approved', approved_by = ?, approved_at = ? " +
        "WHERE business_id = ? AND status = 'draft'",
    )
      .bind(approvedBy, Date.now(), businessId)
      .run();

    // Zero changes: already approved, already sent, failed, or no draft at all.
    if ((gate.meta?.changes ?? 0) === 0) return { ok: true, transitioned: false, sent: false };

    const row = await env.DB.prepare(
      'SELECT id, run_id, to_email, subject, body_text, body_html FROM outreach WHERE business_id = ?',
    )
      .bind(businessId)
      .first<OutreachRow>();
    if (!row) return { ok: false, error: 'outreach: approved row could not be read back' };

    const sent = await sendEmail(env, {
      to: row.to_email,
      subject: row.subject,
      text: row.body_text,
      html: row.body_html,
      idempotencyKey: row.id,
    });

    if (!sent.ok) return finishFailed(env, row, sent.error);
    return finishSent(env, row, sent.id);
  } catch (e: unknown) {
    return { ok: false, error: safeError(e) };
  }
}

async function finishSent(env: Env, row: OutreachRow, resendId: string): Promise<ApproveResult> {
  await env.DB.prepare('UPDATE outreach SET status = ?, sent_at = ?, resend_id = ? WHERE id = ?')
    .bind('sent', Date.now(), resendId, row.id)
    .run();
  await emitOutreach(env, row.run_id, 'done', `email sent to ${row.to_email}`);
  return { ok: true, transitioned: true, sent: true, to: row.to_email };
}

async function finishFailed(env: Env, row: OutreachRow, error: string): Promise<ApproveResult> {
  const detail = redact(error).slice(0, MAX_STORED_ERROR_CHARS);
  await env.DB.prepare('UPDATE outreach SET status = ?, error = ? WHERE id = ?')
    .bind('failed', detail, row.id)
    .run();
  await emitOutreach(env, row.run_id, 'failed', `email failed: ${detail}`);
  return { ok: true, transitioned: true, sent: false, to: row.to_email, error: detail };
}
