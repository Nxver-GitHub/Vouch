# Vouch design system — The Survey Office, daylight edition

The product talks like a surveyor: *grade*, *noise floor*, *engine version pinned*,
*we measure and do not assert*. This is the surveyor's room in daylight: warm paper,
neutral, built around hairlines and instrument marks rather than cards and shadows.

The reference implementation is [`design/dashboard.html`](design/dashboard.html).
The business answer pages and the Slack / email surfaces adopt the same tokens.

---

## 1. The two visual channels — the rule that outranks every other rule

There are exactly two state channels in this product, and **they never merge**:

| Channel | Means | Rendered as |
|---|---|---|
| **Light** | An AI engine cited this business when asked | Lit sprite + `--datum` lamp mark on the nameplate |
| **Plate** | Vouch monitoring is active (i.e. paid) | The benchmark plate composited on the shopfront + a brass mark |

**Payment must never change lighting.** A paid state that lights the hero shop asserts
on screen that paying Vouch caused an engine to recommend the business — the causal
claim `BRIEF.md` §11 forbids. The dashboard fixture keeps `business.lit === false` for
the hero for the whole run, by design, and the legend states the separation in the
product's own words:

> Lit = an AI engine cited this shop when asked. Plate = Vouch monitoring is active.
> Neither changes the other.

A third, independent channel exists for deployment: the **sign** prop, which appears
when the Builder returns a live URL. It is not lighting and it is not payment.

---

## 2. Tokens

```css
:root{
  /* ground */
  --ground:#F6F3EC;   /* warm paper. the page. */
  --surface:#FFFFFF;  /* masthead, inputs */
  --well:#EFEAE0;     /* the one inset well (the street) */
  --hair:#E3DDD1;     /* hairline: rows, cells, dividers */
  --strong:#C9C1B2;   /* strong rule: section rules, input borders, marks */

  /* ink */
  --ink:#1B1A17;      /* body and headings */
  --ink-2:#5E5A52;    /* secondary. 6.20:1 on paper — safe at any size */
  --ink-3:#8B8578;    /* muted. 3.31:1 — >=18px text or decorative marks ONLY */

  /* the four meaning colours */
  --datum:#D98E1F;    /* LIT. cited by an engine. the only warm hue on the page. */
  --verdict:#B8412F;  /* wrong facts and failed states only. 4.95:1 */
  --measured:#2F7A5A; /* correct / done. 4.70:1 */
  --brass:#9C7A3C;    /* paid / monitoring only. 3.61:1 */
}
```

### Colour rules

- `--datum` means **exactly one thing**: lit, cited by an engine. It is never a button,
  never a "working" state, never emphasis. At 2.42:1 it is a **fill colour, not a text
  colour** — the lamp mark carries a `#B0741A` hairline so its shape clears 3:1.
- `--verdict` is for wrong facts and failed steps. Nothing else. "Missing" is an absence,
  not an error, so a missing fact is rendered in ink, not red.
- `--brass` is a **mark colour, not a text colour** (3.61:1). The paid chip pairs a brass
  mark with ink text; the plate is stroked in brass.
- **Working / attention is not a colour.** It is ink at reduced weight plus motion. There
  is no amber "busy" state anywhere. A status mark changes on state change only; there is
  no ambient pulse on this page.

### Verdict rendering (four values)

| Verdict | Colour | Mark | Scored? |
|---|---|---|---|
| `correct` | `--measured` | — (not listed in the table) | yes |
| `wrong` | `--verdict` | filled square | yes |
| `missing` | `--ink` | open square | yes |
| `disputed` | `--ink-2` | half-filled square | **no — below the confidence floor** |

A `disputed` row shows **both** values (AI stated and ground truth) in secondary ink and
is counted separately: `2 wrong · 2 missing · 2 disputed`. It is excluded from the score,
and the reading says so.

---

## 3. Type

| Face | Used for | Fallback |
|---|---|---|
| **Instrument Serif** | the grade letter, the score numeral, the overlap percentage, the one headline | Iowan Old Style, Palatino, Georgia |
| **IBM Plex Sans** | everything else | system sans |
| **IBM Plex Mono** | data cells only: URLs, ids, timestamps, money, engine-stated values | ui-monospace |

Loaded as a Google Fonts **stylesheet** (no CDN scripts). Every face has a system
fallback so the page is legible with the venue wifi off.

Mono is for data, never a costume for "technical". Sans carries all prose and all labels.

### Scale — 13 / 15 / 18 / 24 / 40 / 96

| px | Role |
|---|---|
| 13 | field labels, table cells, mono data, captions, timeline messages |
| 15 | body, section headings, control text |
| 18 | the rank line, the reading's empty state |
| 24 | the masthead headline (serif), ledger figures |
| 40 | the grade stamp (serif), the overlap percentage (serif) |
| 96 | the score numeral (serif) |

`font-variant-numeric: tabular-nums` is set on `body` — every figure on every surface
is tabular. Nothing below 13px ships.

---

## 4. Depth and surface

**No drop-shadow cards.** Surfaces sit on hairlines: `--hair` for rows and cells,
`--strong` for section rules and input borders. There is exactly **one inset well** on
the page — the street — and it is the only place a shadow appears, as an inset:

```css
box-shadow: inset 0 2px 5px rgba(27,26,23,.09), inset 0 -1px 0 rgba(255,255,255,.6);
```

No rounded card stacks, no nested containers, no coloured left borders, no gradient text.

---

## 5. Motion — "the needle settles"

One principle, one implementation, applied in three places.

> A value arrives with **one overshoot and damps**. ~180 ms out, ~220 ms back,
> exponential ease-out. Never a fade in. Never a pulse. One thing at a time.

```css
@keyframes settle{
  0%   { transform:translate3d(0,0,0); }
  45%  { transform:translate3d(0,-6px,0); }   /* 180ms out */
  100% { transform:translate3d(0,0,0); }      /* 220ms back */
}
.settling{ animation:settle 400ms cubic-bezier(.16,1,.3,1) both; }
```

```js
function settle(el){ el.classList.remove("settling"); void el.offsetWidth; el.classList.add("settling"); }
```

Applied to, and only to:

1. the **score numeral** and the **grade stamp**, when the reading arrives;
2. **each shop the moment it lights** — tracked per shop, so a shop settles once and
   never re-animates on a later re-render;
3. the **overlap percentage**, which is deliberately set ~220 ms *after* its two source
   columns, so the reader sees the evidence before the figure.

The only looping motion on the page is the 26×8 px **tick** on a working or waiting agent
row — ink, no colour. When any agent reaches `waiting`, `body.awaiting` stills every other
tick on the page: **"awaiting approval" is the only live thing on screen.**

`prefers-reduced-motion: reduce` disables all animation and transition.

---

## 6. The benchmark plate — the signature element

An engraved plate, authored inline as an SVG symbol at a **single 1.3 stroke weight**,
stroked in `--brass`. It bears:

- the **datum glyph** — a circled cross (`#g-datum`), authored once and `<use>`d everywhere;
- the **engine name** — from the event data (`overlap.engine`, else the first fact's engine);
- the **date** — from `ev.ts`, formatted `28 Sep 2026`;
- the **pinned engine version** — `v2026-09-28.1`, from `ENGINE_VERSION` in `src/types.ts`.

```
┌──────────────────────────────────┐
│  ┌────────────────────────────┐  │
│  │ ⊕ │ Gemini                 │  │
│  │   │ 28 Sep 2026  v2026-…   │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

It is two things at once, and that is the point:

- **the masthead mark** — the instrument identifies itself and its version before it
  says anything about a business;
- **the plaque** on the hero shopfront when `revenue` reports `paid` (`#g-plaque`, the
  same frame and the same glyph at 30 px).

Text on the plate is set via `textContent` on SVG `<text>`, so untrusted engine strings
can never become markup. Before a run the plate reads `Instrument idle / no reading yet` —
it never invents a date.

Reuse it as the Slack bot avatar, the email sign-off, and the verification stamp on
business answer pages. Same glyph, same stroke, same three fields.

---

## 7. Layout — the page has an argument, top to bottom

No sidebar. No grid of equal cards. Each section answers the previous one.

1. **Masthead** — the benchmark plate, `Vouch`, the one headline
   ("Customers ask AI what's good nearby. We grade the answers."), and, when a run is
   active, a compact run status: business name · elapsed `mm:ss` · state word with a
   status mark. **No run id here.**
2. **Controls** — Business, City, Access token (password), Run, Reset. Plain fields on
   hairlines, ink focus rings, real disabled and loading states on Run. Enter runs.
3. **The street** — the widest element on the page, full content width, an inset well on
   the paper ground. 180 px sprites with nameplates beneath (business name, escaped),
   the hero labelled *this business*, competitors from `competitors[]`. Dark sprite = not
   cited, lit sprite = cited. The pavement sits at the sprite baseline, not as a bar at
   the foot of the panel. A one-line caption states the legend (§1). The well scrolls
   horizontally with a themed scrollbar when the street is wider than the viewport.
4. **The reading** — the score numeral in Instrument Serif with the **server-supplied
   `grade`** beside it, the noise-floor line, and the wrong/missing/disputed facts table.
   **Gated on `factsReceived > 0`**: until a probe returns, the whole area is a single
   honest sentence, not zeros and not a grade. A score that arrives before any fact is
   held and rendered once a fact lands.
5. **The non-determinism probe** — two source columns; shared sources sit on the same row
   and are joined by a rule; the overlap percentage is set last; the gap between the two
   asks is computed from the timestamps, never asserted.
6. **Agent timeline** — five compact rows, not a 1000 px column. States:
   `idle` · `working` (ink + motion, no colour) · `waiting` (labelled **awaiting
   approval**; everything else on the page goes still) · `done` · `failed` · `paid` (brass).
7. **Cost strip** — engines / decisions / writing / total / cap, as money. Rendered only
   once a `cost` payload has arrived; before that, one line: *"Costs are reported when the
   run completes."*
8. **Footer** — engines probed, ground truth source, *"we measure answers; we do not claim
   to change them"*, and **the run id**, in mono, at the very bottom.

### Failed states

Raw error strings never reach the reader. Known failures map to a plain sentence
(`stripe: missing secret key` → *"Payment could not be set up, so no offer was sent."*)
and the original string is kept in a collapsed `<details>` for the operator.

---

## 8. Browser surfaces

The parts we did not draw still carry the design:

```css
::selection{ background:#E8DCBE; color:var(--ink); }
:root{ caret-color:var(--ink); accent-color:var(--ink); color-scheme:light; }
:focus-visible{ outline:2px solid var(--ink); outline-offset:2px; }
.well{ scrollbar-width:thin; scrollbar-color:var(--strong) transparent; }
.well::-webkit-scrollbar-thumb{ background:var(--strong); }
a{ text-underline-offset:3px; text-decoration-thickness:1px; }
body{ font-variant-numeric:tabular-nums; }
```

---

## 9. Responsive

1280 first, then 390. At 390: no horizontal overflow anywhere
(`document.documentElement.scrollWidth === innerWidth`). Grid children carry
`min-width:0`; mono data cells carry `overflow-wrap:anywhere` while prose cells use
`break-word` so ordinary words are never split. The street scrolls inside its well; the
probe keeps its two ask columns and drops the connector; the timeline stacks; the
facts table drops the Engine column and switches to `table-layout:auto`.

---

## 10. Prohibitions

Carried from the craft floor and from `BRIEF.md` §11:

- **No kicker or eyebrow label above any heading.** Ever.
- No emoji as icons. Icons are authored SVG at one stroke weight, or text.
- No same-size card grid as page structure; no nested cards.
- No gradient text, no glass, no coloured left borders, no zero-blur block shadows.
- No monospace as a costume for "technical" — mono is for data.
- No ambient pulses, no scattered entrance animations, no fades.
- No claim that a Vouch page makes an engine recommend a business. No llms.txt claims.
  No crawl-to-citation latency numbers. We measure; we do not assert causation.

---

## 11. Answer pages (`design/profile.html` + `src/agents/builder.ts`)

The published business pages adopt the tokens above: `--ground` paper, `--ink`,
hairlines instead of boxes, Instrument Serif for the **H1 only**, Plex Sans for
prose, Plex Mono for the fact-box and hours **values**. Secondary ink on these
pages is `--ink-2` (6.07:1); `--ink-3` is not declared there at all, because
every secondary string on the page is small. The verification stamp carries the
benchmark plate from §6 — same frame, same datum glyph, same 1.3 stroke —
reading `Vouch` over `28 Sep 2026 · v2026-09-28.1`. No kicker above the H1 (§10).

### The rule that outranks layout here

> **A section renders only if every fact in it has a verified source.**

Blank slots are what made the first generation of these pages read as doorway
spam. The template holds no repeating numbered slots: sections are assembled by
`renderX()` functions in `builder.ts`, each returning an empty fragment when its
source is absent. Today that means the comparison table, the services list, the
price row, the transit row, the hours-exception line and the JSON-LD `geo` and
`priceRange` nodes never render — we hold no source for any of them. Adding a
fact means adding a `renderX()`, never a placeholder row.

An absence that a reader would otherwise mistake for an error is stated once, in
plain words — *"No public phone number listed"*, as text, never as a `tel:` link
with nothing behind it.

### Order

H1 question → answer paragraph (40–80 words) → byline → fact box → hours → FAQ
→ verification stamp → footer. One `<main>`, zero CDN JS, Google Fonts
stylesheet with system fallbacks.

### What the page may and may not say

- The byline reads *"Checked against Google Business Profile"*. An engine under
  test is **not** a source and is never counted as one; engines are named only in
  the disclosure line of the verification stamp.
- Never print the neighbourhood when it equals the city.
- No run ids, no "probes", no "verification run" — no instrument vocabulary
  reaches a customer. The stamp says *"Re-checked on every audit run."*
- A `disputed` fact that the page states carries one honest line beneath it in
  `--verdict`: *"Some AI assistants report different hours. The hours above are
  from Google Business Profile, read on {date}."* Never on a `correct` fact.
- §10 still applies in full, and BRIEF.md §11 above it.
