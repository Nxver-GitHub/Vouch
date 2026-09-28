# Vouch — Build Scope

**Office hours + CEO review (Reduction mode) → exactly what ships by 15:30.**
Companion to `BRIEF.md`. Read that for evidence; read this for decisions.

---

## Part 1 — Office hours: the six forcing questions

### 1. Demand reality — is anyone actually asking for this?

**Evidence for:** 58% of consumers have used AI to find a local business (BrightLocal 2026). SMEs get a fabricated fact **50%** of the time vs 32% for large companies (Searchable, 13k queries). ChatGPT recommends a given location just **1.2%** of the time vs 35.9% in Google's 3-pack (SOCi). AI matches a business's GBP phone number only **27%** of the time (Seer).

**Evidence against — and this is the uncomfortable one:** every number above says the *problem* is real. **None of them says the owner knows, cares, or will pay.** Your own outbound doc admits the mechanism: owners *"find out they are invisible only after foot traffic or phone calls slip, and they cannot tell if the SEO vendor is working on this."* That's a latent problem, not a felt one. Latent problems need to be *shown* to someone before they'll pay — which is exactly why the audit-as-the-pitch motion exists.

**Verdict: demand is inferred, not observed.** Don't claim otherwise on stage. The honest line is *"we don't ask owners whether they have this problem — we show them."*

**No traction data exists** (Citation is pre-incorporation, no usage numbers). So do not gesture at traction — vague volume claims are worse than silence, and a judge will ask for the number.

**What replaces traction: the instrument.** You have proprietary measurement data nobody else on that stage has:
- Audit-to-audit blended-score delta **SD = 4.73 points** (`convex/lib/checkpoints.ts`)
- Citation self-overlap between re-runs of one query **≈40%**
- A pinned `ENGINE_VERSION` so audits are never compared across instrument versions

That is the right currency for this room. Investors want traction; hackathon judges want the thing working and honestly measured — and the panel includes a company whose entire business is evaluation rubrics.

**Generate the "before" corpus today.** The 12:30–13:45 block already allocates time to run the Auditor on 5 nearby businesses. Those become real, same-day evidence: *"here are five businesses within two blocks of this building, and here's what AI gets wrong about each."* That beats a conversion rate for demo purposes because a judge can verify it on their own phone.

### 2. Status quo — what do they do today instead?

From your own outbound doc: *"asking a friend to prompt ChatGPT, checking Google reviews, paying an SEO retainer they cannot inspect, doing nothing."* Mostly **doing nothing**. The competitor isn't BrightLocal — it's indifference plus an unauditable retainer.

**Implication for the demo:** the "before" state has to land hard. A judge must feel the owner's blindness before you show the fix.

### 3. Desperate specificity — who is *desperate*, not just interested?

**Not the bakery.** The bakery is mildly curious.

**The local SEO agency is desperate.** Your outbound doc names the job precisely: *"I need an honest AI-visibility report card I can put in a client deck without looking like I made the number up."* Clients are already asking "does ChatGPT recommend us?" and agencies are either guessing or running a one-off prompt they can't compare or re-run.

**And the market validated it independently:** Yext opened Scout to agencies in May 2026 with *"a 90-day growth plan and paid media guidance built for prospect meetings and upsell conversations."* An incumbent built the agency artifact. That's confirmation, not competition.

**This exposes a real inconsistency in the current plan.** The demo sells to the *owner* (Stripe link → bakery). The evidence says the *agency* is the desperate buyer.

**Resolution — do both, deliberately:**
- **Demo the owner flow.** It's the better spectacle: one business, one judge-named name, one payment on stage.
- **Pitch the agency wedge as the business.** *"Every run is one customer. An agency has 200. That's who pays us $500/mo instead of $39."*

### 4. Narrowest wedge — what's the smallest thing that works?

**One business, one city, three engines, twelve questions, one page, one payment.** Which is the demo.

Not: multi-location, not agency workspaces, not GBP write-back, not a subscription lifecycle. Those are all post-hackathon.

### 5. Observation & surprise — what did you learn that changed the plan?

1. **Entity facts don't come from your page.** ChatGPT's local answers are served by listings providers — Google Places 88.8%, Yelp 10.2%. You cannot fix hours by publishing a page.
2. **But Gemini cites the business's own site 49.6% of the time** vs ChatGPT's 10.5%. The mechanism is real and engine-specific.
3. **Four independent sources measured the same volatility** — Steady Demand (~40% source overlap), BrightLocal (20–33%), SOCi, and *your own* `checkpoints.ts` (4.73-point SD). That convergence is the most defensible thing you own.
4. **The page that wins is a "best [category] in [neighborhood]" page**, not a profile page — a single-location roofer got cited in 5 of 10 cities that way.

### 6. Future-fit — why is this a bigger company in three years?

Today AI *answers* about the business. Next, an agent *transacts* with it. Businesses that aren't machine-addressable become invisible — not marginally less discoverable. Vouch is the layer that makes a local business legible and transactable to agents, and the same measurement instrument is how you prove it worked.

**Constraint:** don't call it "ACO" on stage — it's one person's coinage. Say "the agentic commerce layer."

---

## Part 2 — CEO review, REDUCTION mode

gstack's default posture is *"find the 10-star product."* With 5h15m of build time that's the wrong instinct. This is a deliberate scope reduction.

### The one-sentence definition of done

> A judge names a local SF business. Five agents visibly hand off work in Slack. A live URL appears on `usevouch.dev`. A Stripe payment lands on stage. And we prove, live, that AI's answer about that business is unstable — which is why it's a subscription.

**Everything that doesn't serve that sentence is cut.**

### MUST SHIP — the spine (≈3h45m)

| # | Item | Budget | Done when |
|---|---|---|---|
| 1 | One Hono Worker. Apex = dashboard. `*.usevouch.dev` = profile pages from R2/D1. | 30m | `curl` a slug, get HTML |
| 2 | D1: `businesses`, `audits`, `events`, `payments`, `budgets` | 15m | Insert + read works |
| 3 | **Auditor** — Places ground truth + probe (3 engines if time, Claude alone if not) → code-computed score + wrong-fact list | 60m | Name in → score + "Claude says closed Mondays; it's open" |
| 4 | **Builder** — generate `best [category] in [neighborhood]` page, visible HTML facts, → R2 → live slug | 45m | Live URL resolves with valid TLS |
| 5 | **Orchestrator** — sequential run, writes `events`, posts to Slack under each agent's name | 45m | Full run visible in `#ops` |
| 6 | **Revenue** — price+link with `metadata[business_id]`, webhook **+ 2s poll**, both → one idempotent `markPaid()` | 30m | Card 4242 flips status to Paid |
| 7 | **Outreach** — Resend email + Slack Approve button (plus `GET /approve?...` backup link) | 30m | Email lands after click |
| 8 | **Budget ledger** — cost per run on the dashboard | 15m | Real number displayed |
| 9 | **The non-determinism proof** — same query twice, show source-overlap delta | 20m | Two results side by side, overlap % computed |
| 10 | `?demo=replay` — render a cached good run from D1 | 15m | Works with wifi off |

### CUT LINE — in this exact order, no debate at the time

1. **Blender / game scene** → one static isometric PNG, or nothing
2. **Jev classification** → classify with Claude
3. **Three engines** → Claude only
4. **Places** → hardcoded fixture for the demo business + Claude web search for the rest
5. **Durable Objects** → plain sequential Worker
6. **Linear** → post the intended transition to Slack as text
7. **Email** → render the email body into Slack instead

### IF TIME — ranked, above dashboard polish

1. **MCP endpoint on the business Worker** (~25m) — `/mcp` or `/api/business.json` so the business is agent-addressable. Hits all three tracks at once, is Cloudflare + Anthropic native, and is the honest version of the ACO close. **This is the highest-value optional item.**
2. Stripe **Link agent-wallet** credential instead of a plain payment link (~30m) — the sponsors said explicitly they're pushing this
3. Three engines instead of one
4. Jev on Workers AI
5. Blender scene
6. Dashboard polish

### EXPLICITLY NOT BUILDING

Auth. Multi-tenant. Agency workspace. GBP/Yelp write-back (needs a 60-day-old verified profile + ~14-day approval). Real subscription lifecycle. llms.txt as a *claim* (ship the file, never mention it). Perplexity or AI Overviews probing — you don't probe them, so you can't claim them.

---

## Part 3 — Judging submission

Format is **unpublished**. ~92 registrants ≈ 25–35 teams in a 90-minute block. **Ask at 09:30.** Build for both:

**If stage pitch (4 min):** 30s problem · 3min demo · 30s why-it's-a-company + ask.

**If science fair:** the run must survive being executed 15 times for 15 judges. That means: idempotent runs, a reset button, `?demo=replay` always available, and a one-line opener you can repeat without fatigue.

**Deliverables to have ready by 15:30:**

- [ ] Live URL — `usevouch.dev` dashboard + one real business subdomain
- [ ] Public repo, README stating **what existed before today** (the prior-code answer, honestly)
- [ ] **Backup video** of a clean run, saved locally, not streamed
- [ ] Slack `#ops` with a full transcript a judge can scroll
- [ ] Linear issue showing all four state transitions
- [ ] Stripe test payment visible in the dashboard
- [ ] Budget ledger with a real per-customer cost
- [ ] The three hostile-question answers memorised (§5 of `BRIEF.md`)

**The line that answers every competitive objection:**
> They all wait for the owner to show up. Vouch goes and gets them, and arrives with the work already done.

---

## Part 4 — What changed from the original plan

| Original | Now | Why |
|---|---|---|
| Per-business Worker deploys | One wildcard Worker | Creating Workers via API needs Admin product scope; wildcard needs zero API calls at demo time |
| "Ask Claude, pointed at the new page" (step 5) | **Live non-determinism demo** | The original is circular — you're fetching a page you just wrote |
| Profile page with JSON-LD + llms.txt | **"Best [category] in [neighborhood]" page, facts in visible HTML** | JSON-LD is flat-to-negative; 0 of 5 systems read JSON-LD-only facts; llms.txt gets zero fetches |
| "Get local businesses recommended by AI" | "Measure what AI says, fix what we can, prove the delta" | Your own Citation doctrine bans the first claim |
| 5 prompts, Claude only | 12 prompts, 3 engines, **score computed in code** | Citation already does this, and "code-graded, not LLM-graded" is the line for the Taste Labs rubric expert |
| Brainbase = stretch goal | Brainbase = use it | Host + only cash sponsor, self-serve signup, sub-hour integration |
| Sell to the owner | **Demo the owner, pitch the agency** | Agencies are the desperate buyer; Yext shipped the agency artifact and validated it |
