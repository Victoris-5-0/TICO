# Bakery preview — layered production v2

Status: layered preview implemented and functionally verified on 2026-09-06. Active-animation performance needs further investigation (see below). Client-only visual preview; not a completed Python lesson.

## Scope and art direction

Replace the top-down choreography prototype with a polished illustrated **side-on cutaway** of a contemporary Egyptian baladi bakery. Keep the existing `/{locale}/worlds/el-forn/missions/opening-message` route. No AI service, shared manifest, database, authentication or curriculum changes. The preview grants no XP and stores no learner progress. Python execution remains a separate delivery slice.

Use the canonical Hassan, Mariam, Salma and Nour identities. Add six distinct background customers, not new AI conversational personas. No subsidy, price or entitlement claims: eight loaves per batch and two per order are fictional simulation quantities. Remove maze railings; all waiting feet share one sidewalk plane.

## Production assets

Creative generation uses the built-in imagegen skill/tool. Save exact prompts in `bakery-v2-prompts.json`. Keep generated masters in `client/assets/source/bakery-v2/`; optimized runtime assets live in `client/public/assets/bakery-v2/`. Preserve all v1 assets.

Generate a composition guide, then an empty environment with no people, bread, oven, counter or awning. Separate fixtures include oven shell, counter front, work surface, awning, olive planter and aloe planter. Bread, dough, tray, peel, bag and effects are independent props. Never animate a baked-in duplicate.

Actors use full-body side-facing raster frames: idle, four walking frames and receiving; Hassan has four frames each for load, retrieve, place and handover. Asset preparation normalizes each frame to 384×384, with a foot pivot at (192, 360). Body height is 336 px. Keep per-pose hand sockets with the scene manifest. Flip only Hassan's actor group when turning to the oven; never mirror the world for RTL.

The generator's simulated checkerboard is not alpha. When genuine alpha is unavailable, generate an exact magenta key background and remove it mechanically with ImageMagick. Inspect edges after preparation. `client/scripts/prepare-bakery-assets.mjs` performs cropping, key removal, pivot normalization and WebP compression; it does not generate artwork.

The scene preloads 25 runtime WebPs (under the existing 1.5 MB budget), including ten actor atlases, the radio, flour sack and four-frame fire atlas. Earlier Farid and glow WebPs are retained but no longer requested. The normalized individual actor/effect frames stay in `client/assets/source/bakery-v2/frames/` for review, not in the public runtime directory. Small steam paths and diffuse oven lighting are native SVG; their opacity and flame frame selection share the simulation clock. Regenerate optimized assets from the repository masters with `pnpm assets:bakery` inside `client/` (requires ImageMagick). No image-generation API call is needed to rebuild them.

### Egyptian neighborhood details

- The existing signboard reads **فرن الحارة**, with **عيش بلدي** below it. A small wall placard reads **صباح الخير**. These are actual Arabic SVG text using Alexandria, with explicit RTL direction, on both locale routes; the scene's accessible description explains their meaning in English or Arabic. Do not bake lettering into the environment or mirror it with the scene.
- Farid is an everyday Sa‘idi customer in a charcoal galabeya, ivory wrapped عمّة, and brown slippers. `farid-saidi.webp` replaces his appearance, preserving his queue ID and the eight-customer/two-batch simulation. The six frames include idle, four walking poses, and receiving; hand sockets remain tied to his frame pivot. The earlier outfit remains available as source art.
- An unbranded wooden transistor radio sits on a small interior wall shelf. It is currently a visual prop with no audio or radio controls. A tied flour sack sits inside the service area, clear of the walking lane.
- The four fire frames share an ember baseline and are clipped to the oven opening. Natural flame shapes, glowing embers and a restrained radial light replace the former static glow sprite. Only the existing simulation clock cycles fire frames; pause/hidden states freeze it and reduced motion uses a fixed frame. No independent looping timers or SVG blur filters.
- Exact new artwork prompts are in [bakery-egypt-details-prompts.json](bakery-egypt-details-prompts.json); the two painted-checkerboard corrections are in [bakery-egypt-keying-prompts.json](bakery-egypt-keying-prompts.json). Artwork uses built-in imagegen, followed by mechanical keying and WebP export. Corrections and original masters are preserved separately.

## Scene graph and behavior

One fixed SVG coordinate system, 1600×900, scales the entire scene together. Depth order: environment → awning/signs/radio/flour → oven/effects → plants → Hassan and carried tools → counter front → work surface/tray/stock → customers and handoffs → Salma. Both plant pots must stay above the background and behind every actor, including exiting customers. No percent-positioned actors or independently measured CSS coordinates.

The pure client state machine owns queue order, phases, inventory and playback. A single pausable clock drives both pose selection and position. Animation callbacks cannot change inventory or correctness. Bread has one owner at any instant: dough, oven, peel, tray, handover or customer. Serve FIFO only; reject empty-tray and concurrent baker operations.

Manual controls: Bake batch, Serve next, Play demo, Pause/Resume and Reset. Automated playback bakes only when needed, serves all eight customers across two batches and stops. Reset returns to eight waiting and no bread. Pausing freezes every world animation. Hidden tabs suspend elapsed time without a catch-up burst. Reduced motion shows static phase changes and the same inventory/captions.

## UI and test gates

Scene takes priority over a compact heading. Controls stack on phones with Full scene / Counter views. English and Egyptian Arabic ship together, with RTL controls but identical world geometry. Preload assets before enabling playback, offer a retry on load failure, use 44 px targets, visible keyboard focus and a polite phase-level text summary (not frame-level announcements).

Use the connected **Chrome DevTools MCP** for browser interaction and screenshots. Do not download Playwright or browser binaries: the development connection is metered 4G. Unit tests use the installed Node/tsx tools. Inspect initial, retrieval, handoff, advance and completed scenes, plus narrow and Arabic layouts. Verify FIFO, bread conservation, repeated clicks, empty serving, pause/reset mid-handoff, reduced motion and visibility pause. Run client typecheck, lint and production build.

## Implementation map

- `client/src/lib/bakery/simulation.ts`: pure reducer, phase timings, FIFO and exclusive loaf ownership. No network, persistence or assessment side effects.
- `client/src/lib/bakery/scene-manifest.ts`: preview-local assets, pivots, per-frame hand sockets and fixed world coordinates. These are not new shared AI asset IDs.
- `client/src/components/bakery/scene.tsx`: layered SVG, actor atlas cropping, walk/action frames, tools, bread transfers and effects.
- `client/src/components/bakery/neighborhood-details.tsx`: Arabic shop lettering, shelf/radio/flour arrangement, clipped fire frames and oven lighting.
- `client/src/components/bakery-world-demo.tsx`: Motion for React clock, loading/retry, visibility suspension, accessible bilingual controls and status.
- `client/src/components/bakery/bakery.module.css`: responsive scene and counter views, touch targets and focus styles.
- `docs/bakery-v2-prompts.json`: exact generation and correction prompts. `client/assets/review/bakery-v2/`: browser review screenshots.

## Verification and remaining work

Passed `pnpm test:bakery` (12 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`. The asset preparation command was rerun successfully against the saved masters. Tests cover ownership conservation, two-batch/eight-customer completion, FIFO, invalid deltas, repeated actions, pause/reset, visibility suspension and the runtime asset budget.

After the Egyptian-detail update, the same 12 tests, typecheck, lint and production build passed. Chrome DevTools verified the Arabic sign bounds, new Farid atlas, fire-frame changes and freeze while paused, and Farid's final handoff followed by eight-customer completion. Arabic at 390 px remained within the viewport; an injected reduced-motion preference kept the fire frame and lighting fixed during playback. That check exposed and fixed a hydration mismatch: the browser preference is now applied after the initial server-matching render, before playback, using a hydration snapshot. The reduced-motion reload then produced no console warnings or errors. The manifest's 25 loaded images total 1,172,316 bytes. Review captures: `egypt-neighborhood.webp`, `egypt-oven-fire.webp`, `farid-saidi-handoff.webp`, and `egypt-ar-mobile.webp` in the review folder.

Chrome DevTools checks exercised the full automated cycle, paused retrieval and handoff, walking queue advance, reset mid-handoff, unique rendered loaf IDs, and asset failure → disabled playback → successful retry. A fresh load finished with no console warnings or errors. Keyboard navigation reached the scene controls with visible 3 px focus outlines and 44 px targets. Arabic at 390 px had no horizontal overflow; the counter crop retains identical world geometry. Reduced motion was exercised through an injected media-query preference. Visibility suspension was tested through the reducer and a simulated browser visibility event; the connected browser did not report a real hidden-tab transition during tab switching, so that physical transition remains a manual check.

**Known performance issue:** the connected Brave session exhibits pronounced GPU stalls during active animation, also in the production build. A short local trace recorded approximately 2.97 s of GPU tasks in 3.4 s, while paint and animation callbacks were small. Changing atlas rendering to individual frames did not resolve it, so the smaller atlas implementation is retained. This does not establish whether the root cause is the browser/driver or scene compositing. Do not claim a 60 fps acceptance pass. Verify on a second browser/device and investigate SVG/raster compositing before shipping this as a production game scene. The clock now uses elapsed timestamps rather than Motion's clamped frame delta; each tick is capped at 1 s and cannot skip a whole phase. Pause/hidden transitions reset its timestamp to prevent catch-up.

Python-to-scene commands, learner assessment and persistent progress are deliberately not implemented in this visual slice. Keep the preview label until that integration is delivered; do not award XP for the demo. The AI backend and shared contracts were not changed.
