/**
 * Vouch — Slack client.
 *
 * Five agents post to one ops channel, each under its own identity via
 * `username` + `icon_emoji` on chat.postMessage (requires the
 * `chat:write.customize` scope — verified granted on this app).
 *
 * BELT AND BRACES: every message is ALSO prefixed with `*<Name>*\n` in the
 * text body itself. This is deliberate redundancy — if `chat:write.customize`
 * ever silently fails (scope revoked, token swapped, etc.) Slack falls back
 * to the app's default identity, but the five-agent transcript still reads
 * correctly because the name is baked into the text every agent posts.
 */

import type { AgentName, Env } from '../types';
import { redact } from './security';

const SLACK_API_BASE = 'https://slack.com/api';

type AgentIdentity = { readonly name: string; readonly icon_emoji: string };

const AGENT_IDENTITY: Readonly<Record<AgentName, AgentIdentity>> = {
  orchestrator: { name: 'Orchestrator', icon_emoji: ':control_knobs:' },
  auditor: { name: 'Auditor', icon_emoji: ':detective:' },
  builder: { name: 'Builder', icon_emoji: ':building_construction:' },
  revenue: { name: 'Revenue', icon_emoji: ':credit_card:' },
  outreach: { name: 'Outreach', icon_emoji: ':mailbox_with_mail:' },
};

export type SlackBlock = Record<string, unknown>;

export type SlackPostResult = { ok: boolean; error?: string; ts?: string };

/**
 * Slack's own guidance for a single channel is roughly 1 message/sec.
 * Callers driving the five-agent demo loop should await this between posts
 * so the transcript is both rate-limit-safe and readable as it streams in.
 */
export const SLACK_POST_SPACING_MS = 1000;

export async function slackPostSpacingDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SLACK_POST_SPACING_MS));
}

/** POST chat.postMessage as a given agent's identity, with a text fallback prefix. */
export async function postAs(
  env: Env,
  agent: AgentName,
  text: string,
  blocks?: SlackBlock[],
): Promise<SlackPostResult> {
  const identity = AGENT_IDENTITY[agent];
  // Belt and braces: bake the name into the text too, in case customize fails.
  const prefixedText = `*${identity.name}*\n${text}`;

  const body: Record<string, unknown> = {
    channel: env.SLACK_OPS_CHANNEL,
    text: prefixedText,
    username: identity.name,
    icon_emoji: identity.icon_emoji,
  };
  if (blocks) body.blocks = blocks;

  try {
    const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { ok: boolean; error?: string; ts?: string };
    if (!json.ok) {
      // Never log the token; redact() strips it if it ever ends up embedded in an error.
      return { ok: false, error: redact(json.error ?? 'unknown_slack_error') };
    }
    return { ok: true, ts: json.ts };
  } catch (e) {
    return { ok: false, error: redact(e) };
  }
}

/**
 * Block Kit for the human-approval prompt: a primary in-Slack "Approve"
 * button (action_id 'approve', value = businessId) plus a link button to a
 * signature-free web fallback, for when the Slack round trip is unavailable.
 */
export function approveBlocks(
  businessId: string,
  token: string,
  expiresAt: number,
  draft: string,
): SlackBlock[] {
  const approveUrl =
    `https://usevouch.dev/approve?business_id=${encodeURIComponent(businessId)}` +
    `&token=${encodeURIComponent(token)}&exp=${expiresAt}`;

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: draft },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve', emoji: true },
          style: 'primary',
          action_id: 'approve',
          value: businessId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve via link', emoji: true },
          url: approveUrl,
        },
      ],
    },
  ];
}

export type SlackBlockAction = {
  action_id: string;
  value?: string;
  block_id?: string;
  type: string;
};

/**
 * Slack interaction payload for a `block_actions` callback, narrowed to the
 * fields Vouch actually reads. Slack's own type is much larger; this is
 * deliberately the small subset we trust.
 */
export type SlackBlockActionsPayload = {
  type: 'block_actions';
  actions: SlackBlockAction[];
  response_url: string;
  user: { id: string; username?: string };
  trigger_id?: string;
};

/**
 * Slack interaction requests arrive as `application/x-www-form-urlencoded`
 * with a single `payload` field holding a JSON-encoded interaction object.
 * Throws if the body isn't a `block_actions` payload — callers should treat
 * that as a rejected/unsupported interaction, not silently ignore it.
 */
export function parseInteraction(rawBody: string): SlackBlockActionsPayload {
  const params = new URLSearchParams(rawBody);
  const raw = params.get('payload');
  if (!raw) throw new Error('missing payload field in Slack interaction body');

  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { type?: unknown }).type !== 'block_actions'
  ) {
    throw new Error('unsupported Slack interaction type');
  }
  return parsed as SlackBlockActionsPayload;
}

/**
 * Respond to a `response_url` from a Slack interaction, replacing the
 * original message. Note: `response_url` is short-lived — valid for
 * ~30 minutes and usable at most 5 times — so don't treat it as durable.
 */
export async function respondToInteraction(
  responseUrl: string,
  text: string,
): Promise<SlackPostResult> {
  try {
    const res = await fetch(responseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text, replace_original: true }),
    });
    if (!res.ok) {
      return { ok: false, error: redact(`response_url POST failed: ${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: redact(e) };
  }
}
