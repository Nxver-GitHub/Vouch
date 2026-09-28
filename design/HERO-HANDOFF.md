# Hero and brand imagery handoff — Vouch, The Survey Office

**For: Codex (asset production). Read `DESIGN.md` first; it is the contract.**
**Output goes only into `design/assets/`. No HTML, CSS or JS. No git. No installs.**

## What we are making

The dashboard at `usevouch.dev` is now a warm-paper, daylight instrument panel with
the five-agent street of isometric shopfronts you already rendered. It is clean but
it has no imagery of its own yet: no hero, no mark with weight, no empty-state
picture, no social card. Those are the deliverables. They must belong to one world,
"The Survey Office": a surveyor's kit and a neighbourhood street, in daylight, on
paper, drawn with restraint.

The product's own sentence is the brief: **"Customers ask AI what's good nearby. We
grade the answers."** Every image is either the street (what customers ask about)
or the instrument (how we grade). Nothing else.

## The world, in one paragraph

Paper ground `#F6F3EC`, ink `#1B1A17`, hairline `#E3DDD1`. One warm colour only,
datum amber `#D98E1F`, and it means exactly one thing: an engine cited this shop.
Brass `#9C7A3C` is reserved for the monitoring plate (paid). Verdict red `#B8412F`
appears only on wrong facts. Everything else is grey-ink line and flat paper. Type on
the page is Instrument Serif for large numerals and IBM Plex for the rest, so images
should not carry their own lettering. Motion principle: the needle settles, one
overshoot, damped. Assets are still; the page moves them.

## References, and what to take from each

All nine are in `design/refs/` (reference only, never shipped). Sources are 1950s to
1980s annual-report covers from annualreport.gallery.

| File | Take this | Not this |
|---|---|---|
| `ref-kings-1971-strip.jpg` | The whole idea for the hero: a thin illustrated storefront strip, line drawing on cream, one warm colour for the lit windows and awnings, framed like a plate | The heavy black frame, the cartoon cars |
| `ref-kings-1970-storefronts.jpg` | How lit windows read as "open, alive" with one colour against neutral | The black ground (we are daylight) |
| `ref-neisner-1972-storefront.jpg` | Grey-ink architectural shading with a single red accent; silhouette figures at the door give scale without faces | The oversized letter sign |
| `ref-mercantile-1969-clock.jpg` | A street instrument as the hero object: a sidewalk clock is a public measuring device. Our version is a survey benchmark or a street-corner gauge, not a clock | The painterly gouache texture, the figures' detail |
| `ref-talley-1978-gauge.jpg` | The instrument arc over a scene. This is the shape of our grade dial: an arc with engraved tick marks, warm only on the pointer | The dark twilight ground |
| `ref-nationaltool-1953-tools.jpg` | Instruments as still-life objects on ruled paper, each rendered plainly, orbiting a label. This is the empty-state picture | The 1950s script, the brown ground |
| `ref-cca-1964-iso-cube.jpg` | Confidence of a single isometric line form on cream. Our benchmark plate can carry this much restraint | Nothing to avoid; it is the floor |
| `ref-technicolor-1980-grid.jpg` | The fine measurement grid as ground texture, barely there | The pale grey; ours is warm paper |
| `ref-neisner-1966-window.jpg` | The warm window glow, for the lit sprite state on a light ground | The night photo itself |

## Deliverables, in priority order

Ship 1 before starting 2. Each is useful on its own.

### 1. The street strip hero — `hero-street.png` and `hero-street@2x.png`

A daytime line drawing of one San Francisco block in the King's 1971 manner: seven
to nine storefronts of varied height and width, awnings, a corner bakery, a pizza
place with a window counter, a café. Grey-ink line and flat paper fills. Three shops
have lit windows in datum amber; the rest are unlit. No figures with faces; silhouettes
only, two or three, at doors. No lettering on any sign; leave sign boards blank.

- 2400×600 at 1x is the composition size; deliver 1x and 2x.
- Transparent background so it sits on the paper ground; or paper-coloured background
  with the exact hex `#F6F3EC`, your choice, say which.
- Tileable is not required. It should crop well to 1280×320 and 390×260 (tell me the
  safe area).
- This is the masthead image. It sits under the sentence "Customers ask AI what's good
  nearby." It should read at a glance from ten feet: a street, some lit windows.

#### 1b. Approved alternative for the hero: line-printer ASCII art

You may make the street strip as ASCII art instead of a line drawing, if it looks
better. It fits the world: 1960s and 70s annual reports came off the same chain
printers that produced ASCII art, and our data face is already a mono. It only works
under these conditions:

- **It is ink on paper, never light on black.** Characters in ink `#1B1A17` and
  secondary ink `#5E5A52` on the paper ground. No green, no phosphor, no scanlines, no
  CRT curvature. If it reads as a terminal, it fails.
- **Amber is still the only warm colour** and still means a lit window. Lit windows
  are the only characters in `#D98E1F`. Nothing else is coloured.
- **Set it in IBM Plex Mono** (the page's data face) so it matches the dashboard when
  the two sit together. Fixed grid, no proportional glyphs, no box-drawing Unicode
  beyond the basic set; keep to printable ASCII so it survives every font fallback.
- **Density does the drawing.** Awnings, brick, glass and sky are different character
  densities (`.`, `:`, `=`, `#`, `@`), the way a line printer would shade them. Avoid
  outlining everything with `|` and `_`; that reads as a wireframe, not a street.
- **Deliver both forms:** the raw text (`hero-street.txt`, 80 to 160 columns wide,
  no trailing spaces) and a rendered PNG at 1x and 2x on transparent or paper. The
  page will use the PNG; the text is the source of truth and lets us re-render or
  animate a lit window later by swapping one character.
- **Same acceptance test.** From ten feet it must read as a street with countable lit
  windows. If it only reads as texture, it fails.

Consistency note: the interactive street below the hero stays 3D sprites. The two
coexist only if the hero is clearly "the surveyor's sketch on the notebook page" and
the sprites are "the models on the desk". Keep the ASCII strip framed like a page,
with generous paper margin, so the difference reads as intentional.

If you try both, deliver both and say which you'd ship.

### 2. The benchmark plate, rendered — `plate-3d.png`, `plate-3d@2x.png`

The dashboard draws the plate as a flat SVG symbol (see `design/dashboard.html`,
`#g-plate`): a small engraved brass plate with a circled cross datum glyph, and three
text lines the page sets live. Render a dimensional version in Blender: brass with a
matte finish, engraved cross, two screw heads, slight bevel, soft daylight from the
upper left, casting a short soft shadow onto paper. **No text on it**; the page sets
the text. 512×320 at 1x, transparent. This becomes the favicon source, the Slack
avatar, the email sign-off mark and the paid plaque on the shopfront.

### 3. The empty state — `empty-desk.png`, `empty-desk@2x.png`

Before a run there is nothing to read. Show the surveyor's desk from above, National
Tool 1953 manner but on warm paper: a folded street map, a brass plate, a dial gauge,
calipers, a pencil, a ruled notebook. Still life, plain rendering, no hands. One warm
accent only: the gauge pointer in datum amber. 1200×800 at 1x, transparent or paper
background, say which. It sits in the reading area with the sentence "No audit yet.
Run one to see what AI says about a business."

### 4. Category storefronts for the street — same pipeline as the existing sprites

Three new shop bodies, each with a dark and a lit state, identical camera and footprint
to `shop-dark.png` / `shop-lit.png`:

- `shop-bakery-dark.png` / `shop-bakery-lit.png` (awning, bread in the window)
- `shop-pizza-dark.png` / `shop-pizza-lit.png` (counter window, oven glow when lit)
- `shop-cafe-dark.png` / `shop-cafe-lit.png` (tables outside, hanging lamp)

512×768, transparent, 1x and 2x. Lit means warm interior light only; unlit means the
same building with dark windows. Keep the greys that read well on paper; the current
sprites already do.

### 5. Social card — `og-card.png`

1200×630, paper ground. The street strip hero cropped across the middle third, the
plate at the lower right. **No text**; the page overlays it. This is what a judge sees
when the link is pasted into Slack.

### 6. Optional, only if 1 to 5 are done

- A light-ground re-render of `hero-dark/lit.png` with a short soft contact shadow
  baked in, so the hero sits on the paper instead of floating.
- `street-day.png`: a paper-toned pavement strip to replace the current dark kerb,
  1024×256, tileable.

## Rules that outrank taste

1. **Amber means cited.** Never use `#D98E1F` on anything that is not a lit window or
   the gauge pointer. No amber signs, no amber awnings, no amber sky.
2. **Brass means paid.** Only the plate is brass.
3. **No baked text anywhere.** The page sets every word.
4. **No glow, no bloom, no neon.** Daylight, matte, printed. Shadows have an offset and
   a soft edge; a zero-offset halo is a defect.
5. **No faces.** Silhouettes at most.
6. **Nothing that looks like a specific real business.** Blank signs, generic
   storefronts. We publish pages about real shops; the art must not impersonate one.
7. Deliver incrementally into `design/assets/`. Never one big final export.

## Acceptance

Place `hero-street.png` on `#F6F3EC` at 1280 wide and stand back ten feet. If you can
see a street and count the lit windows, it passes. Place `plate-3d.png` at 48px: if the
cross reads and it still looks like brass, it passes. Place `empty-desk.png` at 600
wide: if you can name four objects, it passes.

Report: file paths, pixel sizes, background choice per file, safe areas for the hero,
and anything you could not do.
