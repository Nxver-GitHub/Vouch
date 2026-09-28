/**
 * Vouch — single Worker, two surfaces.
 *
 *   usevouch.dev            -> operator dashboard + API
 *   <slug>.usevouch.dev     -> that business's deployed answer page
 *
 * Why one Worker: creating a Worker per business via the API needs Admin at the
 * Workers *product* scope and three chained calls. A wildcard route needs zero
 * API calls at demo time — "provisioning" a business is one D1 insert + one R2 put.
 *
 * This file owns WIRING ONLY. Agents live in src/agents/, clients in src/lib/.
 */

import { Hono } from 'hono';
import type { Env } from './types';
import { handleWebhook } from './agents/revenue';
import { startRun } from './agents/orchestrator';
import {
  requireRunToken,
  throttle,
  verifySlackSignature,
  verifyApproveToken,
  safeError,
  escapeHtml,
} from './lib/security';
import { parseInteraction, respondToInteraction } from './lib/slack';

const app = new Hono<{ Bindings: Env }>();

/** Keeps proxies from idling out the /api/run stream during a long probe. */
const HEARTBEAT_MS = 5_000;

/* ------------------------------------------------------------------ *
 * Wildcard host routing — runs before everything else.
 * ------------------------------------------------------------------ */

app.use('*', async (c, next) => {
  const host = (c.req.header('host') ?? '').toLowerCase().split(':')[0];
  const base = c.env.PUBLIC_BASE_DOMAIN;

  const isApex =
    host === base ||
    host === `www.${base}` ||
    host.endsWith('.workers.dev') ||
    host === 'localhost';

  if (isApex) return next();

  const slug = host.endsWith(`.${base}`) ? host.slice(0, -(base.length + 1)) : null;
  if (!slug || slug.includes('.')) {
    // Two labels deep — Universal SSL covers one level only, so this is
    // unreachable over HTTPS anyway. Fail loudly rather than serve something odd.
    return c.text('Not found', 404);
  }
  return serveProfile(c.env, slug);
});

async function serveProfile(env: Env, slug: string): Promise<Response> {
  const obj = await env.PROFILES.get(`profiles/${slug}.html`);
  if (obj) {
    return new Response(obj.body, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60',
        // Crawlers must be able to read these pages — the product depends on it.
        'x-robots-tag': 'all',
      },
    });
  }

  const row = await env.DB.prepare('SELECT name, status FROM businesses WHERE slug = ?')
    .bind(slug)
    .first<{ name: string; status: string }>();
  if (!row) return new Response('No such business', { status: 404 });

  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(row.name)}</title>` +
      `<body style="font:16px/1.6 ui-sans-serif,system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">` +
      `<h1>${escapeHtml(row.name)}</h1><p>Audit in progress (${escapeHtml(row.status)}).</p>`,
    { status: 202, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/* ------------------------------------------------------------------ *
 * Dashboard + health
 * ------------------------------------------------------------------ */

app.get('/healthz', async (c) => {
  const [db, r2] = await Promise.allSettled([
    c.env.DB.prepare('SELECT count(*) AS n FROM businesses').first(),
    c.env.PROFILES.head('__healthz__'),
  ]);
  return c.json({
    ok: true,
    db: db.status === 'fulfilled' ? 'up' : 'down',
    r2: r2.status === 'fulfilled' ? 'up' : 'down',
    ts: Date.now(),
  });
});

app.get('/', async (c) => {
  const page = await c.env.PROFILES.get('app/dashboard.html');
  if (page) {
    return new Response(page.body, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Vouch</title>` +
      `<body style="font:16px/1.6 ui-monospace,monospace;background:#0b0d10;color:#e6e9ef;max-width:44rem;margin:4rem auto;padding:0 1rem">` +
      `<h1 style="font-weight:600">Vouch</h1>` +
      `<p style="color:#9aa4b2">Customers ask AI what's good nearby. We grade the answers.</p>` +
      `<p style="color:#6b7280;font-size:14px">Dashboard not yet uploaded to R2 (app/dashboard.html).</p>`,
  );
});

/**
 * Static sprites for the dashboard, served from R2 under `app/assets/`.
 * The name is whitelisted to a flat, lowercase PNG filename — no traversal,
 * no nested keys, nothing but what the design handoff produced.
 */
app.get('/assets/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[a-z0-9-]+(@2x)?\.png$/.test(name)) return c.text('Not found', 404);
  const obj = await c.env.PROFILES.get(`app/assets/${name}`);
  if (!obj) return c.text('Not found', 404);
  return new Response(obj.body, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' },
  });
});

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

/**
 * The money-spending endpoint. Every call costs real cash (Places $40/1k,
 * Claude search $10/1k, plus tokens), so it is authenticated AND throttled.
 * Fails closed: no RUN_ACCESS_TOKEN configured means no runs at all.
 */
app.post('/api/run', async (c) => {
  if (!(await requireRunToken(c.req.raw, c.env))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const verdict = await throttle(c.env.DB, `run:${ip}`, 10, 300); // 10 per 5 min
  if (!verdict.allowed) {
    return c.json({ error: 'rate_limited', used: verdict.used, limit: verdict.limit }, 429);
  }

  let body: { name?: string; city?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const name = body.name?.trim();
  if (!name || name.length > 120) return c.json({ error: 'name required (max 120)' }, 400);

  let run: Awaited<ReturnType<typeof startRun>>;
  try {
    run = await startRun(c.env, c.executionCtx, {
      name,
      city: body.city?.trim() || 'San Francisco',
    });
  } catch (e) {
    return c.json({ error: safeError(e) }, 500);
  }

  // Stream, don't fire-and-forget. Cloudflare cancels waitUntil() work 30s
  // after a response completes; a body that is still streaming has no limit.
  // The client must hold the connection open until `done` — the dashboard and
  // the CLI runner both do. Writes to a disconnected client reject; those are
  // swallowed so the pipeline itself never depends on the socket.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const write = (line: Record<string, unknown>): Promise<void> =>
    writer.write(encoder.encode(`${JSON.stringify(line)}\n`)).catch(() => undefined);

  c.executionCtx.waitUntil(
    (async () => {
      await write({ runId: run.runId, businessName: run.businessName });
      const beat = setInterval(() => void write({ heartbeat: Date.now() }), HEARTBEAT_MS);
      try {
        await run.pipeline;
        await write({ done: true, runId: run.runId });
      } catch (e) {
        await write({ done: true, runId: run.runId, error: safeError(e) });
      } finally {
        clearInterval(beat);
        await writer.close().catch(() => undefined);
      }
    })(),
  );

  return new Response(readable, {
    status: 202,
    headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' },
  });
});

app.get('/api/events/:runId', async (c) => {
  const since = Number(c.req.query('since') ?? 0);
  const { results } = await c.env.DB.prepare(
    'SELECT id, run_id, agent, state, message, payload_json, ts FROM events ' +
      'WHERE run_id = ? AND ts > ? ORDER BY ts ASC LIMIT 200',
  )
    .bind(c.req.param('runId'), Number.isFinite(since) ? since : 0)
    .all();
  return c.json({ events: results ?? [] });
});

/* ------------------------------------------------------------------ *
 * Inbound webhooks
 * ------------------------------------------------------------------ */

// Signature verification happens inside handleWebhook (v1 only — test mode also
// sends a bogus v0 scheme that would fail every comparison).
app.post('/stripe/webhook', async (c) => {
  const raw = await c.req.text();
  try {
    return await handleWebhook(c.env, raw, c.req.header('stripe-signature'));
  } catch (e) {
    return c.json({ error: safeError(e) }, 400);
  }
});

/**
 * Slack gives us 3 seconds. Verify, ack immediately, do the work in waitUntil().
 * Read the raw body BEFORE parsing — the signature covers the exact bytes.
 */
app.post('/slack/interactions', async (c) => {
  const raw = await c.req.text();
  const ok = await verifySlackSignature(
    raw,
    c.req.header('x-slack-request-timestamp'),
    c.req.header('x-slack-signature'),
    c.env.SLACK_SIGNING_SECRET,
  );
  if (!ok) return c.text('bad signature', 401);

  try {
    const payload = parseInteraction(raw);
    const action = payload.actions?.[0];
    if (action?.action_id === 'approve' && payload.response_url) {
      c.executionCtx.waitUntil(
        respondToInteraction(payload.response_url, '✅ Approved — sending outreach.'),
      );
    }
  } catch {
    // A malformed payload must not turn into a non-200; Slack shows the user an error.
  }
  return c.body(null, 200);
});

/** Signature-free fallback if the Slack button misbehaves. HMAC'd and expiring. */
app.get('/approve', async (c) => {
  const businessId = c.req.query('business_id');
  const token = c.req.query('token');
  const exp = Number(c.req.query('exp'));
  if (!businessId || !token || !Number.isFinite(exp)) return c.text('missing parameters', 400);

  const valid = await verifyApproveToken(c.env.SLACK_SIGNING_SECRET, businessId, exp, token);
  if (!valid) return c.text('invalid or expired link', 403);

  return c.html(`<p>Approved ${escapeHtml(businessId)} — outreach sending.</p>`);
});

export default app;
