# Survey Office asset delivery

Produced from `DESIGN.md` and `design/HERO-HANDOFF.md` on 2026-09-28. The line-drawn hero is the selected direction; no ASCII alternative was produced. These are asset files only; consuming HTML/CSS/JS was not changed.

## Required assets

All paths below are relative to this directory. No production image contains baked lettering.

| Files | 1x pixels | 2x pixels | Background | Production |
|---|---|---|---|---|
| `hero-street.png`, `hero-street@2x.png` | 2400×600 | 4800×1200 | Transparent, opaque paper building faces | Built-in imagegen, architectural line drawing |
| `plate-3d.png`, `plate-3d@2x.png` | 512×320 | 1024×640 | Transparent with rendered soft shadow | Blender Cycles, matte brass, recessed cross, inset border, two screws |
| `empty-desk.png`, `empty-desk@2x.png` | 1200×800 | 2400×1600 | Opaque warm paper | Built-in imagegen, six survey tools |
| `shop-bakery-dark.png`, `shop-bakery-dark@2x.png` | 512×768 | 1024×1536 | Transparent | Blender, awning and bread shelves |
| `shop-bakery-lit.png`, `shop-bakery-lit@2x.png` | 512×768 | 1024×1536 | Transparent | Same bakery geometry, amber window material |
| `shop-pizza-dark.png`, `shop-pizza-dark@2x.png` | 512×768 | 1024×1536 | Transparent | Blender, counter and oven opening |
| `shop-pizza-lit.png`, `shop-pizza-lit@2x.png` | 512×768 | 1024×1536 | Transparent | Same pizza geometry, amber interior and oven opening |
| `shop-cafe-dark.png`, `shop-cafe-dark@2x.png` | 512×768 | 1024×1536 | Transparent | Blender, recessed front, outdoor tables, hanging lamp |
| `shop-cafe-lit.png`, `shop-cafe-lit@2x.png` | 512×768 | 1024×1536 | Transparent | Same cafe geometry, amber interior |
| `og-card.png` | 1200×630 | — | Opaque warm paper | Built-in imagegen composition of the street and plate; no text |

## Optional daylight assets

| Files | 1x pixels | 2x pixels | Background |
|---|---|---|---|
| `hero-day-dark.png`, `hero-day-dark@2x.png` | 512×768 | 1024×1536 | Transparent with a short daylight contact shadow |
| `hero-day-lit.png`, `hero-day-lit@2x.png` | 512×768 | 1024×1536 | Transparent with a short daylight contact shadow |
| `street-day.png`, `street-day@2x.png` | 1024×256 | 2048×512 | Transparent above pavement, neutral light stone below |

Original storefront, plaque, sign, street and retina exports remain available unchanged. The older cyan `plaque.png` belongs to the previous dark-UI direction; use the new brass plate or the dashboard's existing brass SVG for the Survey Office direction. Payment still adds a plate; it never changes a lighting state. Deployment still uses the independent sign prop.

## Hero composition and cropping

- Seven generic storefronts, exactly three amber-lit shop groups. Blank signs, no real business identities.
- Desktop: display the full 2400×600 source at 1280×320. Keep all three lit shops visible.
- Mobile: crop the 1x source to **x=750..1650, y=0..600** (900×600), then display at **390×260**. This shows the central unlit shop with lit storefronts at its sides. Side buildings are intentionally cropped; the full three-shop count belongs to the desktop composition.
- For the 2x source double every crop coordinate: **x=1500..3300, y=0..1200**.
- A centered `object-fit: cover` at 390×260 gives the same crop. No lettering or controls belong inside the image; place those in the page.
- Transparent hero and sprite backgrounds should sit on `#F6F3EC`.

## Resolution and paper notes

- Plate, category sprites, daylight hero and pavement have **native Blender renders at both sizes**, with fixed camera and geometry.
- Imagegen returned a **2172×724 hero master** and **1536×1024 desk master**. Hero export trims empty vertical margin to a 2172×543 composition, then resamples to the requested 1x/2x sizes. The illustrated **2x files are resampled exports, not native 4800/2400px generations**.
- The desk and social card have generated warm-paper backgrounds with slight pixel variation; they are **not guaranteed to match the exact `#F6F3EC` CSS value pixel for pixel**. Use them as opaque illustrations with their existing margin. The transparent hero, plate and sprites do not have that background-matching limitation.
- The OG image is text-free as requested. A social crawler will show the raster itself; page HTML text is not automatically composited into the image by Slack.

## Verification and proofs

- All required and optional file dimensions and PNG decoding checked.
- Bakery, pizza and cafe dark/lit alpha masks are identical at each resolution.
- Category sprites use the original orthographic camera, render framing and foundation geometry. The cafe facade is recessed to keep its tables on that foundation.
- Daylight pavement left/right edges match exactly at both resolutions.
- Optional hero shadow alpha can vary slightly with lighting and Monte Carlo sampling; the camera and geometry remain fixed.
- `survey-office-proof.png` (1280×980): hero at 1280, mobile crop at 390, plate at 48 and 256, desk and all six category states on exact CSS paper.
- `daylight-proof.png` (840×300): optional hero pair and pavement on paper.
- Screen-scale visual inspection completed. Physical ten-foot projector testing is still needed at the venue.

## Prompt set and production provenance

Built-in imagegen was used, not the CLI/API fallback. Mechanical export sizing and review sheets used the bundled Pillow runtime; no packages were installed. The production prompts specified:

1. **Hero:** a panoramic daytime SF block, seven to nine varied generic storefronts, annual-report architectural grey-ink line drawing, paper faces, exactly three datum-amber shop window groups, transparent background, no amber awnings, no lettering, no faces, no glow. Center crop must preserve a lit/unlit contrast. The generated seven-shop version was selected.
2. **Desk:** top-down map, benchmark plate, dial gauge, calipers, grey pencil and blank ruled notebook; restrained engraved illustration; plate alone brass, pointer alone amber, no text. Follow-up edits replaced a drafting compass with calipers, matched the rectangular circled-cross plate, and removed broad smoky background shading in favor of opaque daylight paper and tight offset shadows.
3. **Social card:** preserve the supplied street illustration and plate, place street across the middle and plate lower-right, paper background, generous blank top area, no added text or objects.

Blender production used separate scenes for the plate, categories, daylight hero and daylight pavement. Existing scene objects were preserved; no `.blend` file is part of the delivery.
