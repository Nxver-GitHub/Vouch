# Vouch — Hackathon Brief

**Startup Speedrun Hackathon** · Cloudflare HQ, 101 Townsend St · Sat 28 Sep 2026
Kickoff 09:30 · Lunch 12:30 · Panel 13:00–13:45 · **Hacking ends 15:30** · Judging 15:30–17:00

Compiled from 7 research threads + the Citation repo + your own X/LinkedIn notes.
Everything cited. Everything unverified is marked **UNVERIFIED**.

---

## 1. The finding that changes the plan

**The original claim — "deploy a page and AI recommends you" — is not supported by evidence.**

- ChatGPT's local answers don't read your page. Measurement of its retrieval stack found local queries never touch web search; they're served by listings providers. Provider mix across 99,538 entities: **Google Places 88.8%, Yelp 10.2%**, Foursquare 0.2%, TripAdvisor 0.1% — and Google fell 100% → 70.3% in 90 days. ([Search Engine Land 2026-08-17](https://searchengineland.com/chatgpt-retrieval-stack-index-cache-pages-485036), [Sitter 2026-03-24](https://nicolassitter.com/research/tripadvisor-chatgpt-hotels-study-2026))
- **JSON-LD is flat to negative.** 1,885 pages that added it vs ~4,000 controls, diff-in-diff: AI Overviews **−4.6%**, AI Mode +2.4%, ChatGPT +2.2% — the last two indistinguishable from zero. Separately, **0 of 5** AI systems extracted a fact that existed *only* in JSON-LD. ([study 2026-05-16](https://thatseoagent.com/en/schema-ai-citations-study), [via thrivestack 2026-05-04](https://www.thrivestack.ai/research/schema-markup-for-ai-brand-visibility))
- **llms.txt does nothing.** 97% of llms.txt files got zero fetches across 137K domains. John Mueller: *"no AI system currently uses llms.txt."* ([Ahrefs](https://ahrefs.com/blog/llmstxt-study), [SERoundtable 2025-06-17](https://www.seroundtable.com/google-ai-llms-txt-39607.html))
- **ChatGPT is not Bing.** 1.5% URL overlap with Bing's top 20.

**Your own Citation doctrine already said this.** `citation-outbound-handoff.md` banned *"any claim that Citation changes the engine answers. It measures them."* Two independent sources, same conclusion.

### But the page still has a real mechanism — and it's engine-specific

Steady Demand's AI Citation Ledger (1,487 local queries × 50 metros × 10 verticals, 10,229 citations, Sept 2026):

| Source cited | **Gemini** | **ChatGPT** |
|---|---|---|
| **Business's own site** | **49.6%** | **10.5%** |
| General directory | 17.7% | 46.0% |
| Local-service directory | 19.1% | 27.2% |
| Review platform | 2.4% | 13.0% |

On Gemini the business's own website is the **largest** citation source — more than every directory, forum and review platform combined. On ChatGPT it's a rounding error.

**The honest framing, which the researcher states himself — say it verbatim on stage:**
> The page wins the **verification** step, not the selection step. The model often picks a business first, then cites the site to confirm hours, services, pricing.

Corroborating: Yext's analysis found **42% of AI citations come from business listings and 44% from first-party websites — 86% brand-managed**. The entity card is listings-controlled; the prose is website-controlled. Both are influenceable. Your AEO doc already had it: *"Measurement without a citable page is a report. A citable page without measurement is guesswork. Ship both."*

### Two hard constraints that follow

1. **Facts must be in visible HTML**, not JSON-LD only.
2. **"Best tacos in the Mission" is won in the gatekeeper layer** (Yelp, Angi, BBB) — your page does not win that.

### The one exception — build this page

A single-location roofer (Pinnacle Roofing) was cited by **both** engines in 5 of 10 cities — not for its homepage, but for its own **"best roofing companies in [city]"** comparison pages. Four documents independently converged on this: the GEO research, the Jev brief's entity-vs-content split (businesses serving both earn **~5.3×** more citations), your AEO doc's *"H1 = the highest-intent probe they lost,"* and Citation's own query templates.

**Builder output should be that page, not a profile page.**

---

## 2. The four decisions, revised

| # | Original | Revised | Why |
|---|---|---|---|
| 1 | Stealth: keep Citation off slides | **Hold, but relax the fear** | citation.so is a live public site with a pricing page. The risk isn't "putting it on record" — it's a judge reading `citation` off a URL. You're on `usevouch.dev`, so that's handled. |
| 2 | Name: Vouch | **Unchanged.** `usevouch.dev` bought, wildcard TLS verified | Every "vouch" variant across 5 TLDs was taken — the name is crowded (existing: Vouch insurance, Vouched identity). Not worth a rename on build day. |
| 3 | Brainbase: ask at kickoff, 10:30 fallback | **Obsolete — self-serve, already signed up** | `app.brainbaselabs.com` has no waitlist. Kafka is their generalist agent runtime (`kafka_cloud` harness), not a phone product. Universal Harness API: one `POST /v2/threads` creates *and runs* an agent; spec accepts `mcp_servers`, `skills`, `secrets`. **Brainbase is the host and only cash sponsor — use it.** |
| 4 | Existing code: check the rules | **Ask at 09:30. Have a clean answer ready either way** | The Luma page states no rule. Cloudflare's own hackathon rules *permit* prior code if you declare it and the delta is substantial; Anthropic's comparable Berkeley event required a new build. Assume a judge asks "what existed before today?" |

---

## 3. The pitch

### Opening (use the venue)

> Cloudflare gets recommended by ChatGPT because it published hundreds of pages that answer the question before selling anything. A bakery can't write 300 pages. Our agents write the five that matter for that one bakery, deploy them on Workers, and then measure whether the answer moved — past a noise floor we actually measured.

Source for the Cloudflare framing: [@mal_shaik thread](https://x.com/mal_shaik/status/2104314170632229153) (~37% ChatGPT infra visibility vs AWS ~12%). **UNVERIFIED — single source.** Attribute it or soften to "Cloudflare publishes hundreds of answer pages" rather than quoting the percentage.

### The spine — one sentence answers all three competitive objections

> **They all wait for the owner to show up. Vouch goes and gets them, and arrives with the work already done.**

### Why it's a company (20s)

Every run finds, fixes and sells to a customer without a human. The budget ledger shows what that customer cost. Same pipeline runs overnight on every business in a city.

### What's next (10s) — the ACO close

> Today AI answers questions about the bakery. Next year an agent books the table. Businesses that aren't machine-addressable won't be slightly less discoverable — they'll be invisible, the way Lyft would be if an agent can only reach Uber. We're the layer that makes a local business legible and transactable to agents.

**Caveat:** "ACO" is the X poster's own coinage (they say so). Don't present it as an established category — say "the agentic commerce layer."

---

## 4. Demo script (rewritten)

**Cut the old step 5.** "Ask Claude the question, pointed at the new page" is circular — you're fetching a page you wrote 30 seconds earlier. A GEO-literate judge says so out loud: *"You proved a language model can read. Now show me it chose you."*

| # | Beat | Notes |
|---|---|---|
| 1 | Judge names a local SF business. Type it in. | Pre-vetted fallbacks: **Tartine Bakery, Tadich Grill, Caffe Trieste** (already used on citation.so) |
| 2 | Orchestrator: "Run started, cap $2." Linear issue appears. | |
| 3 | Auditor posts score + one striking wrong fact. Read it aloud. | 3 engines, not 1 — OpenAI + Gemini + Claude |
| 4 | **THE MOMENT — run the same Gemini query twice, live.** | Cited sources overlap **~40%**. Same top business recommended **~7%** of the time. vs **~90%** for Google's local 3-pack. Then ChatGPT vs Gemini: **8.3%** domain overlap, same top business **4.9%**. → *"That's why it's a subscription, not a project."* |
| 5 | Builder posts a live URL — `tartine-bakery.usevouch.dev` | Show the "best bakeries in the Mission" page, not a profile page |
| 6 | **15 seconds only** — extractability check | *"Most schema-only pages fail this. Here's ours passing."* True, modest, defensible. Do NOT claim it changed an answer. |
| 7 | Revenue posts payment link. Outreach posts draft + Approve button. Click. | |
| 8 | Email lands on phone. Pay with 4242 on stage. | |
| 9 | Slack: "Paid. Monitoring on." Linear closes. **Show the budget ledger.** | Engines testify (fixed) · Jev decides (~free) · Code grades (free) · Human approves |

**Have a pre-run business in a second tab. Have `?demo=replay` rendering a cached run from D1.**

---

## 5. Judge Q&A

### "How do you know AI actually changes its answer?"

> We don't claim it does. We measure what it says, with a fixed prompt set, across three engines, and we store the answers. Entity facts — hours, phone — come from Google Places and Yelp; we generate the exact diffs and the owner approves them at the source. The prose layer is open web, and that's where our page competes: on Gemini, a business's own site is **49.6%** of local citations. The page wins the verification step, not the selection step.

### "What stops a competitor copying the page?"

> Nothing. The page is a commodity. The moat is the measurement instrument — we pin the engine version, we know our noise floor is **4.73 points** (SD across audits), and we never compare across instrument versions. Plus the distribution: we find the business before they know they have a problem.

### "Why would an owner pay monthly?"

> Because the answer surface is non-deterministic and the providers churn. Repeat runs of the same local prompt overlap **20–33%**. ChatGPT's local provider mix moved **30 points in 90 days**. Reddit went from **41.7% of ChatGPT's local citations to zero on 2026-08-20** — unannounced. A one-time audit is worthless by next quarter.

---

## 6. Competitive objections (ranked, with names)

| # | Objection | Who makes it land | Answer |
|---|---|---|---|
| 1 | "Monitoring + auto-published pages already exists at $109/mo" | **Uberall GEO Studio** (2026, w/ AthenaHQ) — AI share-of-voice + an engine that generates and publishes blog posts and FAQs into WordPress/Webflow/Wix | Multi-location, self-serve, waits for inbound |
| 2 | "Agents that fix with one-click approval shipped a year ago" | **Birdeye Search AI** (2025-09-03) — Search Optimization Agent "autonomously optimize a brand's GEO with one-click approvals" | Purpose-built for brands with *many* locations. One dentist isn't their unit of value |
| 3 | **"Why doesn't Google just do this?"** | **GBP + Gemini** now gives owners proactive "stale or missing info" suggestions — free, and **only for owners with a single verified profile** (i.e. exactly your customer) | Google tells the owner what's wrong. It doesn't go find the owner. Yelp licenses the data upward — OpenAI deal, Q2 FY2026 |
| 4 | "BrightLocal does per-location AI visibility for $31/mo" | Bundled into every plan | Commodity below $31. Compete on acquisition, not monitoring |

**What is genuinely unclaimed:** across the AI-SDR category (11x, Artisan, Clay, AiSDR) agents stop at the booked meeting. Nothing found where an agent cold-finds a prospect, does unprompted work, and self-serve closes. **Your novelty is that the deliverable is finished before the sale happens** — a distribution invention, not a payments one.

**Do NOT claim the Stripe link is the innovation.** Stripe + OpenAI shipped ACP in Sept 2025; it's co-authored with Meta, Apache-2.0, supports subscriptions, exposes checkout over REST *or MCP*. Stripe's words: one line on an existing integration.

**Market signal for the ask:** Profound $96M at **$1B** (Feb 2026). **Adobe acquired Semrush for ~$1.9B**, closed Apr 2026, explicitly for GEO. Peec ~$10M ARR in 16 months. Yext opened Scout to agencies May 2026.

---

## 7. Technical decisions — locked

### Deployment
- **One wildcard Worker.** NOT per-business Workers. Creating Workers via API needs **Admin at the Workers product scope** (Editor can't create), plus 3 chained calls. Workers for Platforms is $25/mo self-serve — still not worth it.
- `usevouch.dev` **live and verified**: zone active, `AAAA * → 100::` proxied, cert SANs `*.usevouch.dev` + `usevouch.dev`, `ssl_verify_result = 0` on arbitrary slugs. Universal SSL covers **one label only** — never go two deep.
- Fallbacks: `proximize.net` (cert active), `suryapugaz.com` (wildcard record already present).

```jsonc
"routes": [
  { "pattern": "usevouch.dev/*",   "zone_name": "usevouch.dev" },
  { "pattern": "*.usevouch.dev/*", "zone_name": "usevouch.dev" }
]
```

### D1 — these will bite
- **50 queries per Worker invocation on Free** (1,000 paid). A 5-agent pipeline in one request blows this. Use `db.batch()` or keep agent state in DO SQLite, one row per run to D1.
- **100,000 row writes/day** free (an index adds a second write per insert). 5M reads/day.
- Free tier **hard-errors** since 2026-09-01. Upgrade clears it "within minutes."
- `D1 DB reset because its code was updated` fires on redeploy — **freeze deploys 15 min before demo.**

### Claude
- `web_search_20260318`, model `claude-opus-5`. **$10 per 1,000 searches** + search content billed as input tokens on every subsequent turn (compounds — matters for the $2 cap).
- **Footgun:** `allowed_callers` defaults to `["code_execution_20260120"]` → plain tool use returns **400**. Set `allowed_callers: ["direct"]`. *(Citation's `probeClaude` already does this.)*
- `web_fetch` has no per-call surcharge. If you have the URL, fetch beats search.

### Google Places (New) — still the biggest unverified item
- **One call**: `POST places:searchText`, headers `X-Goog-Api-Key` + `X-Goog-FieldMask` (mask is **mandatory**). Returns name, address, phone, hours, rating, reviews.
- `places.reviews` escalates to Enterprise+Atmosphere: **$40/1k, 1,000 free/mo**. Drop reviews → $35/1k. $200 monthly credit retired; new accounts get $300 trial.
- **Brand-new project enablement delay: UNVERIFIED. Test with a real curl in the first 15 minutes.**

### Stripe — VERIFIED LIVE (test acct `acct_1U8tkMQ8yrJTwMzR`)
- **Two calls, not three.** `POST /v1/prices` takes `product_data[name]` inline.
- ✅ Payment link metadata confirmed: `{business_id, run_id, slug}` present on the link object.
- ✅ Poll filter confirmed: `GET /v1/checkout/sessions?payment_link=plink_...` accepts the filter.
- ⚠️ **`subscription_data.metadata` is EMPTY** on a recurring link. For a `$39/mo` price the Subscription won't carry `business_id`. Set `subscription_data[metadata][business_id]` too if you need to match renewals.
- ⚠️ **Test mode sends a FAKE `v0` signature** alongside `v1`. Naive verification that grabs the last signature fails 100% — in test mode only. Match on `v1`.
- `signed_payload` = `timestamp + "." + raw_body` (**period**). Slack uses `v0:timestamp:body` (**colons**). Don't cross them.
- **No published webhook latency SLA.** Build the 2-second poll as the primary stage path.
- Skip the Agent Toolkit.

### Slack — configured ✅
- `chat:write`, `chat:write.customize`, `chat:write.public` confirmed on the bot token.
- ⚠️ **Verify Socket Mode is OFF.** With it on, interactivity goes over the WebSocket and your Request URL never fires — silently.
- Ack within **3 seconds**; do the `replace_original` POST in `ctx.waitUntil()`. `response_url` = 5 uses / 30 min.
- Signing: `v0:{x-slack-request-timestamp}:{rawBody}`, 5-min replay window, read `await request.text()` **before** parsing.
- Interactivity Request URL → `https://usevouch.dev/slack/interactions` **after first deploy**.
- **Belt-and-braces:** prefix every message with `*🕵️ Auditor*\n` on line one. Works with any token.
- Backup approve path: `GET /approve?business_id=…&token=…` pasted in the same message.

### Linear
- `Authorization: <API_KEY>` — **no `Bearer`** (OAuth tokens use Bearer; personal keys don't).
- ⚠️ **GraphQL returns HTTP 200 on partial failure.** Branch on the `errors` array, never the status code.
- Team `Vouch` = `a1ec0397-3b49-4835-adcd-18416b39d2d5`. **Create 4 states**: Audited/Deployed/Offered = Started, **Paid = Completed** (so the issue visibly closes). Hardcode the UUIDs in env vars — don't resolve live.

### Resend
- ⚠️ **A verified domain is required.** `onboarding@resend.dev` is only documented as delivering to Resend's own sink address. ~15 min to verify. **Do not proxy the CNAME.**
- Add `usevouch.dev` so the From address matches the product on screen.

### Jev (Workers AI)
- `typesafe/jev` via `env.AI.run()` — another Cloudflare surface, which Cloudflare judges on ("demonstration of underlying technology").
- 70–500ms, batches every question sharing a state into one call. Makes the 36-answer classification feasible inside a 3-minute demo.
- ⚠️ Shipped 2026-09-15, on Cloudflare 09-19. **Verify one `noul` + one `choice` + one `score` against a fixture before relying on it.** Keep a one-line Claude fallback.
- Use your own honest number: **5–10× cheaper than a small LLM**, not 400×.
- Confidence policy: `<0.6` excluded from published rates · `0.6–0.85` internal ranking only · `>0.85` actionable.

---

## 8. Citation lift (if prior code is allowed) — 1.5–2h total

Repo is Next.js 16 + Convex + Clerk on Workers via `@opennextjs/cloudflare`. **The app is not portable** to a Hono Worker. The `convex/lib/` layer **is** — pure, dependency-free, raw `fetch` + `AbortSignal.timeout`. Only edit: `process.env.X` → `env.X`.

**Lift verbatim (~20 min)**
1. `convex/lib/openai.ts:96-176` — `structuredCompletionWithUsage` (strict json_schema, refusal handling, `onBilled` spend hook). Best file in the repo.
2. `convex/probe.ts:669-718` — `probeClaude` + `convex/lib/claudeExtract.ts`
3. `convex/lib/injectionDefense.ts` — `wrapUntrusted`, `SYSTEM_DATA_ONLY`, `MAX_ANSWER_CHARS`
4. `convex/lib/pricing.ts` + `budget.ts` — cost accounting + spend breaker (= your budget-ledger beat, free)
5. `convex/places.ts:25-131` — Places (New) wrapper, your ground-truth source

**Port with changes (~45–60 min)**
6. `convex/lib/queryTemplates.ts` — keep the intent-weight structure; rewrite the 12 strings as **fact probes** ("what are X's hours?") not discovery questions
7. `convex/analyzer.ts` — keep `structuredCompletionWithUsage` + `SYSTEM_DATA_ONLY` + the `buildMentionRows` allow-list pattern; **replace the schema** with a ground-truth diff: `{factKey, stated, expected, verdict: correct|wrong|missing}`
8. `convex/lib/scoring.ts` — reuse `gradeFor()` / `GRADE_BANDS`; the rank×sentiment formula doesn't fit factual accuracy

**⚠️ The mismatch:** Citation measures **presence/rank/sentiment**, never **factual correctness**. There is no ground-truth comparison anywhere in the repo. That's why this is a port, not a copy.

**NOT in the repo — budget full build time:** Stripe, Slack, Linear, JSON-LD/page template.

**Do not `cp -r`:** `.env.local`, `.env.production.local`, `.env.production.local.bak-20260922174551` exist on disk. `package.json` build scripts inline your Sentry DSN, Clerk publishable key, Convex URLs, Turnstile key. `.env.example` is safe.

**If the hackathon repo goes public:** `queryTemplates.ts` and `scoring.ts` *are* the Citation instrument. Reshape, don't copy.

---

## 9. Timeline

9:30→15:30 minus lunch/panel = **~5h15m**.

| Time | Build | Done when | Cut if late |
|---|---|---|---|
| 9:30–10:00 | Kickoff. **Ask the prior-code rule + judging format.** Claim credits. Curl Places + Jev fixture + Claude web_search. | Scope locked, all 3 APIs answered a real call | — |
| 10:00–11:00 | Auditor + Builder end to end, no Slack | Name in → live URL out | Places → Claude web search alone |
| 11:00–12:00 | Orchestrator, D1 events, Slack per agent. **Deploy early** so the Slack Request URL + Stripe webhook have a real target. | Full run in #ops | Durable Objects → sequential Worker |
| 12:00–12:30 | Revenue: Stripe link + webhook **+ the 2s poll** | Test payment flips status to Paid | — |
| 12:30–13:45 | Lunch + panel. **Run the Auditor on 5 nearby businesses.** | Before-examples collected | — |
| 13:45–14:30 | Outreach, Approve button, Linear states | Email lands after Approve | Linear → Kafka |
| 14:30–15:00 | Budget ledger, **the non-determinism demo**, error handling | Clean run ×3 | Dashboard polish / 3D scene |
| 15:00–15:30 | Backup video, rehearse ×2 | Video saved locally | — |

**Judging format is unpublished.** ~92 registrants ≈ 25–35 teams in 90 minutes. Build a demo that survives **both** a 3-minute stage pitch **and** a table you re-run 15 times. Ask at 09:30.

---

## 10. Quotable stats

| Stat | Source |
|---|---|
| Gemini cites the business's own site **49.6%** of the time; ChatGPT **10.5%** | [Steady Demand AI Citation Ledger](https://www.steadydemand.com/ai-citation-ledger/), Sept 2026 |
| Repeat runs of the same local prompt overlap only **20–33%** | BrightLocal, Sept 2026 (200k prompts, 1.9M citations) |
| Same Gemini query twice: **~40%** source overlap, same top business **~7%** — vs **~90%** for Google's 3-pack | Steady Demand / [SEL 2026-08-19](https://searchengineland.com/business-websites-gemini-citations-local-ai-search-study-485506) |
| AI gives a phone number 91% of the time; matches the brand's own site 64%; **matches GBP 27%** | [Seer Interactive](https://www.seerinteractive.com/insights/ai-models-provide-incorrect-phone-numbers-36-of-the-time-heres-what-you-can-do), Dec 2025 |
| **SMEs get a fabricated fact 50% of the time** vs 32% for 500+-staff companies | Searchable, July 2026 (13,000+ queries). *UK sample* |
| ChatGPT recommends a given location **1.2%** of the time vs **35.9%** in Google's local 3-pack | SOCi Local Visibility Index, Jan 2026. *Vendor research* |
| **58%** of consumers have used AI to find or get a recommendation for a local business | BrightLocal Consumer Survey 2026 |
| 86% of AI citations are brand-managed: **42%** listings + **44%** first-party sites | Yext analysis. *Vendor research* |
| Reddit went from **41.7%** of ChatGPT's local citations **to zero** on 2026-08-20 — unannounced | Steady Demand, "What Changed" |
| Adding JSON-LD: **−4.6%** AI Overviews / +2.4% AI Mode / +2.2% ChatGPT | Ahrefs, 1,885 treated vs ~4,000 control |
| **97%** of llms.txt files received zero fetches | Ahrefs, 137K domains, May 2026 |
| Profound: **$96M at $1B** valuation, Feb 2026. Adobe bought Semrush for **~$1.9B** (closed Apr 2026) | Company/SEC filings |
| **Your own:** citation self-overlap between re-runs ≈40%; audit-to-audit score delta **SD = 4.73 points** | `convex/lib/checkpoints.ts` |

---

## 11. Claims you must NOT make

1. ❌ "Our page makes AI recommend you." No controlled study supports it; the best one is flat-to-negative.
2. ❌ "AI reads our llms.txt." No platform has ever confirmed it.
3. ❌ "Google uses schema for AI Overviews." Google explicitly says the opposite.
4. ❌ Any crawl-to-citation latency number ("indexed within 48 hours"). **No verified measurement exists**; OpenAI removed the telemetry in July 2026.
5. ❌ "ChatGPT runs on Bing." Dead — 1.5% overlap.
6. ❌ "We fix your hours everywhere in AI." You're editing GBP/Yelp/Foursquare — third-party systems you don't control. **GBP API needs a 60-day-old verified profile + application + ~14-day review.** Ship as *generate-and-queue*, owner one-click-approves.
7. ❌ "The agent closing the sale with Stripe is novel." ACP shipped Sept 2025.
8. ❌ Causal language from "AI-cited pages are 3× likelier to have JSON-LD." Ahrefs' own causal test kills it.
9. ❌ Engines you don't probe. You probe **OpenAI, Gemini, Claude** — not Perplexity, not AI Overviews.

---

## 12. Pre-kickoff status

**Done**
- `usevouch.dev` — zone active, wildcard DNS + TLS verified on arbitrary slugs
- Cloudflare MCP ×4 (api / docs / bindings / observability), all authed
- wrangler installed + logged in
- Linear MCP connected · team `Vouch` exists
- Stripe MCP authed, **test mode**, least-privilege scopes · metadata + poll flow verified live
- Stripe CLI + Link skills (`create-payment-credential`, `financial-insights`)
- Brainbase account + CLI · `git clone https://github.com/BrainbaseHQ/mega.git` for context files
- Slack app with `chat:write` + `chat:write.customize` + `chat:write.public`
- GitHub MCP fixed (`~/.zshrc` sources `gh auth token`; live next session)

**Remaining**
- [ ] Slack **Socket Mode OFF** — silent killer of the Approve button
- [ ] Linear: create the 4 states, grab UUIDs into env
- [ ] Resend: add `usevouch.dev`, don't proxy the CNAME
- [ ] Disable the Vercel plugin (injects Next.js/Vercel defaults every session)
- [ ] Slack interactivity Request URL — after first deploy
- [ ] **Google Places: enable + curl a real `searchText`** — the last unverified dependency
- [ ] `.dev.vars` with all keys; `wrangler secret put` for prod

**Stripe test artifacts created during verification** (delete or ignore):
`price_1UKavfQ8yrJTwMzROKwqvf5l` · `prod_VLHUZn764Oj6F2` · `plink_1UKavqQ8yrJTwMzRs0xj4Efx`

---

## 13. Sponsor strategy

- **Brainbase is the host and the only cash sponsor.** Their homepage hero demo is *agents scored against rubrics with +/− criteria*. A demo showing your agent **graded and self-correcting** is directly on-message. Your code-computed 0–100 + confidence gating is exactly that.
- **Taste Labs is on the panel** — and they are *not* local recommendations. They sell **preference datasets, rubrics and evaluation environments** ($18.5M seed, Amplify + CRV, June 2026), mission "end AI slop." So you won't face a local-search expert; you'll face someone whose company *is* measuring subjective quality. **Bring the methodology, not vibes:** score computed in code, not LLM-graded; pinned engine version; 4.73-point noise floor.
- **Stripe's DevRel said they're teaming with Brainbase, Anthropic and Cloudflare on "how to build with Link agent wallet."** That's the clearest signal available about what they want to see. `npx skills add stripe/link-cli` is installed. A monetized-MCP or Link-credential beat is likely the judged differentiator.
- **Cloudflare judges on "Innovation, Creativity, Demonstration of underlying technology."** You're using Workers + DO + D1 + R2 + Workers AI (Jev) + wildcard routing. Say that out loud.
- **Stripe Atlas prize** forms a *new Delaware entity*, but the signup flow accepts a parent company's name and tax ID — so it can be a **subsidiary** of the existing entity. Costs $175+/yr Delaware franchise tax if you accept it.

---

## 14. The ACO / game-layer direction (for tomorrow's grill)

**Pre-render, don't real-time render.** Blender is offline — seconds-to-minutes per frame, impossible inside a Worker. Use Blender to produce **sprites/scene states**, push to R2, animate with CSS/canvas.

**The metaphor is already in your product language:** *"the shops down the street"* + RANK n/m. An isometric street — your shop plus the Places competitor set. Shops AI recommends are lit; yours is dark. Auditor probes → storefronts light up. Builder plants a sign. Payment turns your lights on. Same data, rendered spatially.

**Lock the event contract before fanning out to subagents** — otherwise two halves that don't meet:

```json
{ "run_id": "...", "ts": 1727500000, "agent": "auditor", "state": "probing",
  "business": { "slug": "tartine-bakery", "name": "Tartine Bakery", "lit": false },
  "competitors": [ { "name": "Arsicault", "lit": true } ],
  "score": 34, "rank": [4, 6], "url": null,
  "message": "Claude says closed Mondays; it's open." }
```

Use `isolation: "worktree"` for the rendering agent. Budget it as a **cut-line item** — decided in advance, not at 14:45. And don't let it displace the measurement story: the game makes people watch, the measurement makes them believe.
