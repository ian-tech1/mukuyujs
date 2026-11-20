---
name: og
description: Create, configure, and validate branded Open Graph share cards for this web app. Use when a new app, game, creative tool, or brand-forward page needs social-preview imagery or metadata.
---

# Open Graph brand assets

Use this workflow when the app needs a custom social card. Games, creative tools, whimsical apps, and brand-forward pages require a custom card. Plain utilities such as converters, CRUD trackers, and admin dashboards may keep the platform placeholder.

## Brand-asset pass:

1. Inspect the app's actual visual identity and use its own logo, colors, and artwork. Do not invent product features or substitute a generic stock image. Compose the share card so its title and key art remain legible at small preview sizes.
2. Export a 1200×630 JPEG as `public/og.jpg`, keeping it below 600 KB. If needed, re-encode with `ffmpeg -q:v 4` and verify the final dimensions and file size.
3. Set `"card": "custom"` in `src/lib/og/site.json`. For a game, also set `"type": "x:game"`; do not invent `x:type` or use `twitter:card` as the game signal.
4. For games, also export a 1200×264 JPEG (`50:11`) as `public/x-banner.jpg`, below 600 KB.
   Use the atomic hand-over commands in [references/asset-handover.md](references/asset-handover.md) to place final files safely.
5. If the pass runs in parallel with other work, keep `/workspace/.grok/og-pending` fresh while generating assets and remove the marker when the pass finishes. Parent checks ignore a marker older than 10 minutes.
6. No `wait_tasks` or `get_task_output` calls are permitted for this pass; continue independent work and rely on its completion notification rather than blocking the main task.
7. Run the appropriate self-check from the project root:

   - Custom share card: `node scripts/brand-check.mjs`
   - Game/canvas checks: `node scripts/brand-check.mjs --game`
   - Plain utility keeping the placeholder: `node scripts/brand-check.mjs --placeholder-ok`

Resolve any `BRAND WARNING` before reporting the pass complete. A `BRAND NOTE` for a plain utility is expected when the placeholder is intentionally retained.
