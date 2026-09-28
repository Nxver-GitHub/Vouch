/**
 * Vouch — shared types.
 *
 * The AgentEvent shape is the contract between the pipeline and the dashboard.
 * The design track builds against it as a fixture; the Worker swaps in the real
 * feed. Do not change field names without updating design/dashboard.html.
 */

export type Env = {
  DB: D1Database;
  PROFILES: R2Bucket;
  AI: Ai;

  // vars
  PUBLIC_BASE_DOMAIN: string;
  RUN_BUDGET_USD: string;
  AGENT_STEP_LIMIT: string;
  SLACK_OPS_CHANNEL: string;
  RESEND_FROM: string;
  /** The ONLY address outreach may send to. Empty means outreach refuses to draft. */
  DEMO_OWNER_EMAIL: string;
  /** Site-wide cap on public runs per UTC day. */
  RUN_DAILY_LIMIT: string;
  /** Managed agent id of the Vouch Orchestrator in Brainbase. */
  BRAINBASE_ORCHESTRATOR_ID: string;
  LINEAR_TEAM_ID: string;
  LINEAR_STATE_TODO: string;
  LINEAR_STATE_AUDITED: string;
  LINEAR_STATE_DEPLOYED: string;
  LINEAR_STATE_OFFERED: string;
  LINEAR_STATE_PAID: string;

  // secrets
  ANTHROPIC_API_KEY: string;
  GOOGLE_PLACES_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  LINEAR_API_KEY: string;
  RESEND_API_KEY: string;
  BRAINBASE_API_KEY: string;
};

export type AgentName =
  | 'orchestrator'
  | 'auditor'
  | 'builder'
  | 'revenue'
  | 'outreach';

export type AgentState = 'idle' | 'working' | 'waiting' | 'done' | 'paid' | 'failed';

/**
 * The dashboard animates off this. design/dashboard.html consumes it via
 * `window.applyEvent(ev)` — keep field names in sync with that file.
 *
 * `state` is rendered verbatim, and anything that isn't idle/done buckets to
 * "working", so intermediate labels like 'probing' are safe to emit.
 */
export type AgentEvent = {
  run_id: string;
  ts: number;
  agent: AgentName;
  state: AgentState | string;
  business?: { slug: string; name: string; lit: boolean };
  /** "shops down the street" — lit = this competitor was cited, you weren't */
  competitors?: Array<{ name: string; lit: boolean }>;
  score?: number;
  /** Server-computed band for `score`; the dashboard renders it verbatim. */
  grade?: string;
  rank?: [number, number];
  url?: string | null;
  message: string;

  /* --- optional panels. Omitting one renders an emptier dashboard, not a broken one. --- */

  /** The wrong/missing sheet. Needs the engine per fact, not per audit. */
  facts?: Array<{
    key: FactVerdict['factKey'];
    stated: string | null;
    expected: string | null;
    engine: Engine;
    verdict: FactVerdict['verdict'];
  }>;

  /** The non-determinism panel — the money shot. % computed client-side. */
  overlap?: {
    engine: Engine;
    query: string;
    /** seconds between the two runs */
    gap: number;
    a: { ts: number; sources: string[] };
    b: { ts: number; sources: string[] };
    top_business_same: boolean;
  };

  /** Budget ledger: engines testify (fixed) · decisions (~free) · writing. */
  cost?: { engines: number; decisions: number; writing: number; cap: number };
};

/** Google Places (New) — the ground truth an audit is scored against. */
export type PlaceFacts = {
  place_id: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  rating_count: number | null;
  /** weekdayDescriptions[] — "Monday: 7:30 AM – 6:00 PM" */
  hours: string[];
};

/** One fact the engine got wrong or omitted. The Auditor's real output. */
export type FactVerdict = {
  factKey: 'hours' | 'phone' | 'address' | 'open_now' | 'reservations' | 'category';
  stated: string | null;
  expected: string | null;
  verdict: 'correct' | 'wrong' | 'missing';
  engine: Engine;
};

export type Engine = 'openai' | 'gemini' | 'claude';

/** Pin the instrument. Audits with different stamps are never compared. */
export const ENGINE_VERSION = '2026-09-28.1';
