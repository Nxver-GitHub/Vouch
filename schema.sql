-- Vouch — D1 schema
-- Apply:  wrangler d1 execute vouch --remote --file=./schema.sql
--
-- D1 free tier: 50 queries per Worker invocation, 100k row writes/day.
-- Keep per-run writes small; agent scratch state belongs in the Durable Object,
-- not here. Indexes cost a second write per insert — only the ones we query by.

CREATE TABLE IF NOT EXISTS businesses (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,      -- tartine-bakery -> tartine-bakery.usevouch.dev
  name            TEXT NOT NULL,
  place_id        TEXT,                      -- Google Places (New) resource id
  category        TEXT,                      -- primaryTypeDisplayName, e.g. "Bakery"
  neighborhood    TEXT,                      -- used in the "best X in Y" H1
  city            TEXT,
  address         TEXT,
  phone           TEXT,
  website         TEXT,
  rating          REAL,
  rating_count    INTEGER,
  hours_json      TEXT,                      -- weekdayDescriptions[] as JSON — GROUND TRUTH
  status          TEXT NOT NULL DEFAULT 'new',  -- new|audited|deployed|offered|paid
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running', -- running|done|failed|halted_budget
  linear_issue_id TEXT,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE IF NOT EXISTS audits (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  business_id     TEXT NOT NULL,
  engine          TEXT NOT NULL,             -- openai|gemini|claude
  engine_version  TEXT NOT NULL,             -- pin: never compare across versions
  prompts_json    TEXT NOT NULL,             -- the probe questions asked
  answers_json    TEXT NOT NULL,             -- raw stored engine answers
  citations_json  TEXT,                      -- cited source URLs, for the overlap calc
  score           INTEGER,                   -- 0-100, COMPUTED IN CODE not by an LLM
  grade           TEXT,                      -- A-F
  rank_n          INTEGER,                   -- position among local competitors
  rank_m          INTEGER,
  errors_json     TEXT,                      -- [{factKey, stated, expected, verdict}]
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- Two runs of the SAME probe, for the live non-determinism demo.
CREATE TABLE IF NOT EXISTS overlap_checks (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  engine          TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  sources_a_json  TEXT NOT NULL,
  sources_b_json  TEXT NOT NULL,
  overlap_pct     REAL,                      -- the number we say out loud on stage
  same_top_result INTEGER,                   -- 0/1
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL,
  run_id          TEXT,
  url             TEXT NOT NULL,             -- https://<slug>.usevouch.dev
  r2_key          TEXT NOT NULL,
  health_status   INTEGER,                   -- HTTP status from the post-deploy check
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  business_id        TEXT NOT NULL,
  run_id             TEXT,
  stripe_price_id    TEXT,
  stripe_link_id     TEXT,                   -- plink_...
  stripe_session_id  TEXT,                   -- cs_... from webhook or poll
  payment_url        TEXT,
  amount_usd         REAL,
  status             TEXT NOT NULL DEFAULT 'offered', -- offered|paid|failed
  paid_at            INTEGER,
  created_at         INTEGER NOT NULL
);

-- Drives both the Slack transcript and the dashboard animation.
-- Shape matches the event contract in SCOPE.md.
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL,
  agent        TEXT NOT NULL,   -- orchestrator|auditor|builder|revenue|outreach
  state        TEXT NOT NULL,   -- idle|working|done|failed
  message      TEXT NOT NULL,
  payload_json TEXT,
  ts           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  run_id      TEXT PRIMARY KEY,
  cap_usd     REAL NOT NULL DEFAULT 2.00,
  spent_usd   REAL NOT NULL DEFAULT 0,
  engines_usd REAL NOT NULL DEFAULT 0,  -- ground truth: the fixed cost
  decide_usd  REAL NOT NULL DEFAULT 0,  -- classification: near zero
  write_usd   REAL NOT NULL DEFAULT 0,  -- copy generation
  halted      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- Only the lookups the hot path actually makes.
CREATE INDEX IF NOT EXISTS idx_events_run       ON events(run_id, ts);
CREATE INDEX IF NOT EXISTS idx_audits_run       ON audits(run_id);
CREATE INDEX IF NOT EXISTS idx_payments_link    ON payments(stripe_link_id);
CREATE INDEX IF NOT EXISTS idx_runs_business    ON runs(business_id);

-- Outreach drafts. One row per business; the approve transition is the single
-- idempotent gate before any email leaves (draft -> approved -> sent|failed).
CREATE TABLE IF NOT EXISTS outreach (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL UNIQUE,
  run_id       TEXT,
  to_email     TEXT NOT NULL,             -- fixed at draft time; never taken from Slack
  subject      TEXT NOT NULL,
  body_text    TEXT NOT NULL,
  body_html    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft', -- draft|approved|sent|failed
  approved_by  TEXT,                      -- slack user id or 'link'
  approved_at  INTEGER,
  sent_at      INTEGER,
  resend_id    TEXT,
  error        TEXT,
  created_at   INTEGER NOT NULL
);
