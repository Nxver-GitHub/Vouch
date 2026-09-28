# Blender handoff — Vouch street scene

**For: Codex (or whoever drives Blender). Deadline: assets in `design/assets/` by 14:00 PDT today.**
This is a **cut-line item.** If it isn't done by 14:00 it is dropped and the dashboard
ships without it. Build so that partial delivery is still useful — sprites land
incrementally, never as one big final export.

## What this is

Vouch audits what AI assistants say about a local business. The product's own
language is *"the shops down the street"* and it ranks a business **n of m**
against nearby competitors. The scene turns that abstract rank into something a
bakery owner feels in one second.

**The metaphor:** an isometric street. Your shop plus the competitor set. Shops
that AI recommends are **lit**; yours is **dark**. As the audit runs, storefronts
light up one at a time. When the fix deploys, a sign goes up.

### TWO SEPARATE VISUAL CHANNELS — do not merge them

This matters more than any aesthetic decision in this document.

- **Light = "AI currently recommends this business."** It is audit data. It is the
  only thing lighting ever means.
- **Plaque = "Vouch monitoring is active."** It is a subscription state. It is what
  appears when the owner pays.

Payment must **NOT** turn the hero shop's lights on. Doing so would assert on
screen that paying us caused AI to recommend you — which is exactly the causal
claim `BRIEF.md` §11 forbids us from making. The research is explicit that we
measure answers and do not claim to change them. A payment adds a small plaque to
the shopfront; the lighting state stays whatever the audit says it is.

## HARD CONSTRAINT — pre-render only

Blender is an offline renderer. **Nothing renders at runtime.** You are producing
static raster assets that CSS/canvas animates in a browser. Do not deliver .blend
files, glTF, Three.js scenes, or anything requiring a 3D runtime. The dashboard is
vanilla HTML/CSS/JS with **no CDN dependencies** (venue wifi).

## Deliverables — in this priority order

Ship 1 before starting 2. Each is independently useful.

### 1. Storefront sprites — 4 files, two shops × two lighting states (DO THIS FIRST)
- `assets/shop-dark.png` — generic competitor, unlit
- `assets/shop-lit.png` — generic competitor, warm interior light
- `assets/hero-dark.png` — the hero shop, distinct silhouette, unlit
- `assets/hero-lit.png` — the hero shop, same silhouette, lit

The hero needs its own pair: a single hero sprite can't carry a distinct
silhouette through both lighting states via swaps.

- Isometric, ~2:3 aspect, **512px wide**, transparent background, PNG-24
- **Identical camera and footprint across all four** so they swap cleanly in place
- The two hero files must differ ONLY in lighting — same geometry, same position

### 1b. Monitoring plaque (small, do it with the sprites)
- `assets/plaque.png` — a small wall-mounted plaque or window decal reading as
  "verified / monitored". ~128px wide, transparent, designed to composite onto
  the hero shopfront at a fixed offset. No baked text.
- This is what appears on payment. It is independent of lighting state, so it must
  look correct composited over BOTH `hero-dark.png` and `hero-lit.png`.

### 2. Street strip background
- `assets/street.png` — pavement/kerb the shops sit on, tileable horizontally
- 1024×256, transparent above the kerb line

### 3. Sign prop
- `assets/sign.png` — a small A-board or window sign that "appears" when the
  Builder deploys the page. 256px wide.

### 4. Optional, only if 1–3 are done
- 2–3 filler buildings for visual rhythm, same camera
- `assets/shop-lit@2x.png` etc. for retina

## Visual direction

- **Instrument, not marketing.** Think field diorama or architectural model, not
  a stylised game. No gradients-as-decoration, no glow-for-glow's-sake.
- **Dark UI context** — the dashboard background is near-black (`#0b0d10`).
  Assets must read against dark. Test on that background before exporting.
- **Projector legibility is the acceptance test.** Silhouette must be readable at
  ~120px tall from ten feet. If it only works at full size, it's too detailed.
- Restrained palette. The *lit* state is the only place warm color appears — that
  is the datum, not decoration.
- No text baked into any asset (it gets rendered as HTML).

## How it gets consumed

`design/dashboard.html` already renders a competitor strip driven by the live
event contract. Each entry has a `lit` boolean:

```json
{ "business": { "slug": "tartine-bakery", "name": "Tartine Bakery", "lit": false },
  "competitors": [ { "name": "Arsicault", "lit": true },
                   { "name": "b. patisserie", "lit": true } ] }
```

So the only thing the front-end does is swap `shop-dark.png` ↔ `shop-lit.png` and
position them along `street.png`. **Nothing else is needed from you.** Do not
write HTML, CSS or JS — that integration is already owned.

## Rules

- Write **only** into `design/assets/`. Touch nothing else in the repo.
- No git commands. No installs. No changes to `dashboard.html` or `profile.html`.
- Commit nothing; just leave the PNGs on disk.
- If Blender MCP isn't connected, it needs the Blender app open with the addon
  listening — that's the user's action, not something to work around.
- Report: file paths produced, pixel dimensions, and anything you couldn't do.

## Acceptance

Drop the three storefront states onto `#0b0d10`, scale to 120px tall, step back
ten feet. If you can instantly tell lit from dark and yours from theirs, it works.
That is the whole test.
