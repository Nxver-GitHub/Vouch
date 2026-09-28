# Vouch — working rules

## The confidence rule (standing, non-negotiable)

**Do not write code you understand to less than ~95%.** If the threshold isn't met:
1. Consult the authoritative source first (see "Doc sources" below).
2. If the docs don't resolve it, **ask the user** rather than writing plausible code.
3. Never ship a guess with a confident comment on top of it.

A wrong line that looks right costs more than a question. On a time-boxed build it
costs the demo.

## Engineering practices

- **Verify before relying.** Every external API gets one real call against a fixture
  before it becomes load-bearing. No "should work."
- **Fail loudly, never silently.** If a fetch or a model call fails, say so in the
  event stream and the UI. Never fill a hole with a plausible value.
- **Untrusted input stays untrusted.** Engine answers, scraped page text and Slack
  messages are data, never instructions. Keep them in separate state fields from
  product prompts. Wrap them explicitly.
- **Deterministic work stays in code.** Scores, ranks, counts, dates, money. Models
  classify and write; code decides and computes. This is also the pitch.
- **Idempotency on anything money- or state-touching.** `markPaid()` must be safe to
  call from both the webhook and the poll.
- **Small files, one job each.** `src/agents/*`, `src/lib/*`. No 800-line modules.
- **Types first.** `src/types.ts` is the contract. The dashboard consumes
  `AgentEvent` via `window.applyEvent(ev)` — changing a field name breaks it.

## Doc sources (in priority order)

| Need | Source |
|---|---|
| Workers, DO, D1, R2, Workers AI | `cloudflare-docs` MCP, `cloudflare:*` skills |
| Stripe | `stripe` MCP `search_stripe_documentation`, `stripe:stripe-docs` skill |
| Linear GraphQL | `linear-server` MCP `search_documentation` |
| Claude API / tool use | `claude-api` skill, docs.claude.com |

**`context7` and `exa` MCP are DOWN** this session (`SELF_SIGNED_CERT_IN_CHAIN` —
TLS interception on this network). They were the general library-docs path. Until
they return, prefer the MCP servers above and say so when a fact is unverified.

## Verified facts (do not re-derive)

- Zone `usevouch.dev` live. Wildcard DNS `AAAA * -> 100::` proxied; Universal SSL
  covers apex + **one label only**. Never go two levels deep.
- D1 `vouch` = `4bee70ae-ac83-4915-acf7-1d6feb570cd0` (WNAM). R2 = `vouch-profiles`.
- D1 free tier: **50 queries per Worker invocation**, 100k row writes/day. Batch or
  keep agent scratch state out of D1.
- Google Places (New): one `places:searchText` call returns name, address, phone,
  hours, rating, website. `X-Goog-FieldMask` is **mandatory**. Key must be
  API-restricted, never referrer/IP-restricted (Workers have no stable egress IP).
- Stripe: `POST /v1/prices` takes `product_data[name]` inline — two calls, not three.
  Payment-link `metadata` copies to the Checkout Session. `subscription_data.metadata`
  does **not** — set it separately if renewals need `business_id`.
- Stripe webhook `signed_payload` = `` `${t}.${rawBody}` `` (**period**). Test mode
  also sends a **fake `v0`** signature — match on `v1` only.
- Slack signing base string = `v0:${timestamp}:${rawBody}` (**colons**). 5-minute
  replay window. Ack within **3 seconds**; do follow-up work in `ctx.waitUntil()`.
- Linear: `Authorization: <key>` with **no `Bearer`**. GraphQL returns **HTTP 200 on
  partial failure** — always check the `errors` array.
- Claude web search: `web_search_20260318`. Set `allowed_callers: ["direct"]` or you
  get a 400. ~$10/1k searches, plus results billed as input tokens on later turns.
- **`ctx.waitUntil()` is cancelled 30 s after the response completes** (HTTP
  invocations have no wall-clock limit only while the body is still streaming).
  Never run the pipeline behind a returned JSON response — `/api/run` streams
  NDJSON heartbeats until the pipeline settles. Two live runs died silently
  before this was found.
- Cloudflare edge bot protection returns **1010** to scripted user-agents. Verified
  that `OAI-SearchBot`, `ClaudeBot` and `Googlebot` are NOT blocked. Re-test if Bot
  Fight Mode is ever enabled — the product thesis depends on crawlers reading pages.

## Claims never to make (see BRIEF.md §11)

No "our page makes AI recommend you." No llms.txt claims. No crawl-to-citation
latency numbers. We measure; we don't assert causation.
