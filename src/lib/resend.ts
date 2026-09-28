/**
 * Vouch — minimal Resend client over raw `fetch`.
 *
 * Threat model: this module is the only place an API key touches an outbound
 * request and the only place a Resend error body could travel back toward a
 * log, a Slack post or an HTTP response — so the key is never echoed, the
 * response body is never returned verbatim (only status + error name), and the
 * recipient is validated against a conservative regex before a send, because a
 * malformed or attacker-shaped address must fail here rather than at the API.
 * Nothing throws across this boundary: callers get a result envelope.
 */

import type { Env } from '../types';
import { redact } from './security';

const RESEND_API_BASE = 'https://api.resend.com';
const REQUEST_TIMEOUT_MS = 10_000;

/** RFC-5321 practical ceiling. Anything longer is not a real mailbox. */
const MAX_EMAIL_CHARS = 254;

/**
 * Deliberately narrower than the RFC: no quoted local parts, no IP literals,
 * no comments. This build only ever mails one internal demo address, so a
 * conservative filter costs nothing and closes the header-injection shapes
 * (CR, LF, comma, semicolon, angle brackets) by construction.
 */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EMAIL_CHARS && EMAIL_RE.test(value);
}

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** A retry with the same key must not deliver a second message. */
  idempotencyKey: string;
};

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

/** Turn a Resend error body into something safe to hand a caller. */
function describeFailure(status: number, payload: unknown): string {
  const name =
    typeof payload === 'object' && payload !== null && typeof (payload as { name?: unknown }).name === 'string'
      ? (payload as { name: string }).name
      : 'error';
  // Deliberately excludes `message`: it can echo the request back out.
  return redact(`resend ${status} ${name}`).slice(0, 120);
}

/**
 * POST /emails. Never throws. The only string that escapes on failure is a
 * status code plus Resend's own error *name* — never the response body.
 */
export async function sendEmail(env: Env, params: SendEmailParams): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'resend: missing api key' };
  if (!env.RESEND_FROM) return { ok: false, error: 'resend: missing from address' };
  if (!isValidEmail(params.to)) return { ok: false, error: 'resend: invalid recipient address' };

  let response: Response;
  try {
    response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': params.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network-level failure or timeout. Say so; never pretend it was sent.
    return { ok: false, error: 'resend: request failed to reach the API' };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) return { ok: false, error: describeFailure(response.status, payload) };

  const id =
    typeof payload === 'object' && payload !== null && typeof (payload as { id?: unknown }).id === 'string'
      ? (payload as { id: string }).id
      : null;
  if (!id) return { ok: false, error: 'resend: unexpected response shape from /emails' };

  return { ok: true, id };
}
