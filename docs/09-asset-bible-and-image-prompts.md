# Asset bible and image-generation prompts

## Production rules

Generate one asset per image call. Use the prompt's aspect ratio and preserve generous safe margins for responsive crops. Character and prop sheets require transparent backgrounds. Scene plates contain no characters unless requested. Do not generate readable text: signs, tickets, displays, uniforms, and vehicles must be blank or carry abstract fictional marks so the web UI can localize them.

### Canonical TICO source

TICO is the supplied friendly orange robot, not the retired hoopoe concept. The neutral, celebrating, thinking, and determined turnaround sheets in `client/assets/source/tico/` are the identity source of truth. Runtime cutouts live in `client/public/assets/characters/tico/`. Any new pose must use a canonical sheet as an identity reference and preserve the asymmetric antennae, floating gold antenna light, face, proportions, orange body, dark outline, and gold joint accents.

### Shared style block

Append this block verbatim to every new-generation prompt below:

> Warm hand-painted 2D children's storybook game art, contemporary everyday Egypt, tactile gouache and subtle paper texture, clean readable silhouettes, expressive but not exaggerated, inclusive local people in practical everyday clothing, sun-warmed ochres and sand neutrals with Nile blue, teal, coral, and restrained yellow accents. Production-ready layered-game composition, no photorealism, no 3D render, no gradients that destroy readability, no brand marks, no logos, no watermarks, no readable text, no political or government symbols, no unrelated pyramids, pharaohs, hieroglyphs, camels, or tourist clichés.

The shared style block is part of each prompt. The asset-specific text and block together are the copy/paste request. Use the first TICO result as the visual reference for every later TICO pose; use accepted world plates as references for state edits.

## Playable 2D scene contract

Establishing plates support cards, maps, and story moments. They are not gameplay boards. A playable mission uses a fixed orthographic side or high three-quarter/top-down camera, an empty background plate, transparent actors at the same camera angle, and code-native overlays/coordinates. Generate characters separately; never bake actors, arrows, labels, selection rings, or localized UI into the board.

Playfields must expose wide readable routes, unambiguous collision edges, interaction destinations, and empty actor-scale positions. Decorative detail stays outside walkable lanes. A reviewed client-side coordinate graph defines movement; the app never tries to recover navigation geometry from generated pixels.

### Bakery v2 — current production direction

Follow [layered bakery production](13-bakery-layered-production.md) and its [exact generation prompt log](bakery-v2-prompts.json) for the side-on visual preview. The fixed environment must contain no people or bread. Oven, awning, counter front/worktop, trays, loaves, tools, bags and actors are independent raster layers. Masters: `client/assets/source/bakery-v2/`. Runtime: `client/public/assets/bakery-v2/`. These are client-only visual assets, not a shared AI manifest change.

### Earlier top-down prototype (superseded for bakery gameplay)

- Master board: `client/assets/source/worlds/bakery/playfield-topdown-v1.png`
- Runtime boards: `client/public/assets/worlds/bakery/gameplay/playfield-topdown-v1.webp` and `playfield-topdown-v1-mobile.webp`
- Actor masters: `client/assets/source/characters/gameplay/`
- Runtime actors: `client/public/assets/characters/gameplay/`

**Board prompt:** Create a wide 16:9 orthographic high three-quarter/top-down gameplay board of a contemporary Egyptian public baladi bakery. Put the service counter at the upper edge, a broad cream-tiled public area in the center, and one continuous readable queue route from the lower spawn area to exactly five empty waiting positions and the service window. Use low rails and tile changes for boundaries. Include restrained contemporary Egyptian details such as pale plaster, geometric teal tile trim, awning shade, clay water jug, planter, and bench. Keep walkable spaces large and uncluttered. No people, characters, TICO, vehicles, text, numbers, arrows, UI, logos, flags, official emblems, monuments, or 3D isometric rendering.

**Actor prompt pattern:** Using the accepted bakery playfield as the exact camera, scale, light, outline, and rendering reference, re-render one accepted character from mostly behind and above, facing the top of the canvas. Preserve identity and clothing. Use a compact full-body silhouette readable at 75–80 px on a removable uniform background, with no floor, long shadow, environment, extra character, text, logo, or watermark. One call produces one actor.

## Global assets — 5 prompts

### 01 — `global.tico.anchor`

**Prompt:** Using `client/assets/source/tico/tico-neutral-turnaround.jpeg` as a strict identity reference, isolate the canonical TICO robot in a relaxed three-quarter pose. Preserve the asymmetric antennae, floating gold antenna light, large observant eyes, small smile, rounded orange body, dark outline, gold shoulder joints, proportions, and clean cel shading exactly. Full body, centered, genuinely transparent background, square canvas, ample padding around antennae, hands, and feet, crisp silhouette readable at 96 px. Include no labels, extra poses, extra objects, text, logo, or watermark.

### 02 — `global.tico.neutral`

**Prompt:** Using the accepted TICO anchor as a strict character reference, create TICO in a neutral listening pose, head slightly tilted, wings relaxed, crest gently raised, subtle friendly smile. Full body, same proportions, colors, satchel, lighting, and camera angle as the reference; transparent background, square canvas, generous padding, no props or text. Append the shared style block.

### 03 — `global.tico.thinking`

**Prompt:** Using the accepted TICO anchor as a strict character reference, create a thinking pose: TICO looks toward a small blank floating idea tile, one wing near the beak, crest slightly asymmetrical, curious rather than confused. Full body and tile, consistent proportions and palette, transparent background, square canvas, readable at small size, no letters, numbers, code, or symbols on the tile. Append the shared style block.

### 04 — `global.tico.celebrate`

**Prompt:** Using the accepted TICO anchor as a strict character reference, create a joyful success pose: TICO makes a small hop with open wings, crest lifted, delighted expression, three restrained confetti shapes in coral, teal, and yellow. Full body, consistent proportions and satchel, transparent background, square canvas, keep all confetti inside safe margins, no trophy and no text. Append the shared style block.

### 05 — `global.world_map`

**Prompt:** Create a wide illustrated journey map for a coding game with exactly three connected contemporary Egyptian locations: a neighborhood baladi bakery, a fictional regional railway station, and a Cairo-inspired traffic-control intersection. A curving route links three large blank badge sockets; the bakery is first, station second, traffic third. Warm paper-map composition, subtle Nile-blue route, room for localized UI labels above each stop, no people, no readable signs, no national borders or political map claims. 16:9 landscape, important details centered for responsive cropping. Append the shared style block.

## Bakery world — 12 prompts

### 06 — `bakery.street`

**Prompt:** Create a 16:9 scene plate of a contemporary Egyptian neighborhood public baladi bakery exterior in morning light: shaded fabric awning, pale worn plaster, patterned tile strip, metal service shutters, an orderly empty queue lane, bread-tray silhouettes visible inside, small blank signboard above the entrance. No characters, no vehicles, no readable prices or official emblems. Leave open foreground space for sprites and UI; strong depth layers for subtle parallax. Append the shared style block.

### 07 — `bakery.queue`

**Prompt:** Create a 16:9 interior/covered queue scene for the same bakery: waist-high queue rails, tiled lower walls, ceiling fans, a blank number display, soft morning light from the street, service windows in the distance. Clean, dignified, orderly public space with no people. Leave wide central walking space and separate foreground/midground/background shapes. No readable text or government branding. Append the shared style block.

### 08 — `bakery.counter`

**Prompt:** Create a 16:9 close scene plate of a baladi bakery service counter: warm round flatbread on wooden trays, safe food-handling surfaces, a blank fictional card-reader screen, an empty token stand, tiled wall and metal bread racks behind. No people, no readable text, prices, logos, or official designs. Reserve the left third for a character and the right third for UI feedback. Append the shared style block.

### 09 — `bakery.store`

**Prompt:** Create a 16:9 bakery storeroom and production-planning scene: neatly stacked generic flour sacks without writing, empty bread trays, a sturdy table, a blank chalkboard, warm light through a high window, practical clean workspace. No characters, no brand labels, no unsafe clutter. Leave the tabletop visually simple for runtime counters and code-result overlays. Append the shared style block.

### 10 — `bakery.hassan`

**Prompt:** Create Hassan, an experienced Egyptian baladi baker in his late forties, calm kind face, medium-brown skin, short dark hair with some gray, practical light shirt, dark trousers, clean flour-dusted apron, holding an empty wooden bread paddle safely upright. Full-body three-quarter game sprite, transparent background, square canvas, friendly competence without caricature, no text or logo. Append the shared style block.

### 11 — `bakery.salma`

**Prompt:** Create Salma, an Egyptian bakery queue coordinator in her thirties, confident welcoming posture, medium-brown skin, modest long-sleeved coral tunic, comfortable trousers, teal headscarf, holding a small blank clipboard. Full-body three-quarter game sprite, transparent background, square canvas, clean silhouette and expressive hands, no uniform insignia or text. Append the shared style block.

### 12 — `bakery.mariam`

**Prompt:** Create Mariam, an Egyptian customer in her fifties collecting bread for her household, warm observant expression, medium-dark skin, modest patterned dress and simple neutral headscarf, carrying a reusable woven bread bag with no logo. Full-body three-quarter game sprite, transparent background, square canvas, dignified everyday portrayal, no text. Append the shared style block.

### 13 — `bakery.tray`

**Prompt:** Create one isolated low wooden bakery tray holding a tidy arrangement of round baladi flatbread, viewed at a readable three-quarter angle. Transparent background, square canvas, realistic countable loaf shapes, clean silhouette, no crumbs outside the tray, no people, labels, or text. Append the shared style block.

### 14 — `bakery.queue_token`

**Prompt:** Create one isolated reusable queue token for a fictional bakery: rounded enamel-like disk with a recessed blank central area where the web UI can overlay a number, teal rim and warm cream face. Transparent background, square canvas, front three-quarter view, no actual numeral, Arabic letter, logo, or official mark. Append the shared style block.

### 15 — `bakery.card_reader`

**Prompt:** Create one fictional tabletop bread-card reader, intentionally unlike any real government device: friendly rounded teal casing, blank cream display, two abstract unlabelled buttons, subtle cable base. Transparent background, square canvas, three-quarter view, child-readable silhouette, no text, logo, seal, real card, or financial branding. Append the shared style block.

### 16 — `bakery.flour_sacks`

**Prompt:** Create a small isolated stack of three generic tied flour sacks in warm canvas cloth, with blank stitched patches and subtle flour texture. Transparent background, square canvas, stable safe arrangement, no company mark, Arabic writing, measurement, spill, or extra prop. Append the shared style block.

### 17 — `bakery.badge`

**Prompt:** Create a circular world-completion badge featuring a simple baladi loaf on a small tray with one teal check-shaped decorative stroke, coral rim, warm cream center. Transparent outside the badge, square canvas, bold silhouette readable at 48 px, no letters, numbers, logos, flags, or official symbols. Append the shared style block.

## Railway station world — 12 prompts

### 18 — `station.concourse`

**Prompt:** Create a 16:9 exterior/concourse scene plate for a fictional contemporary Egyptian regional railway station: sunlit pale masonry, deep shaded entrance, geometric tile details, benches, potted greenery, and one large blank station sign. No people, real railway logos, place names, timetables, or security detail. Leave open foreground room for sprites and responsive UI. Append the shared style block.

### 19 — `station.ticket_hall`

**Prompt:** Create a 16:9 fictional Egyptian station ticket hall: three ticket windows, brass-toned queue rails, high fans, patterned tile floor, blank departure board and blank window signs. No people or legible details. Calm organized interior, strong depth, open central lane, no real operator branding or live schedule. Append the shared style block.

### 20 — `station.platform`

**Prompt:** Create a 16:9 safe railway platform scene in a fictional Egyptian station: long canopy, benches, generic cream-and-blue passenger train stopped in the background, highly visible platform edge line, blank platform sign, warm afternoon light. No people, logos, place names, readable carriage numbers, or dangerous track behavior. Keep the foreground behind the safety line open for sprites. Append the shared style block.

### 21 — `station.dispatch`

**Prompt:** Create a 16:9 small fictional station dispatch office: wooden desk, generic radio shape, wall clock, blank route diagram, blank status monitors, window overlooking a platform. No people, readable operational data, logos, security controls, or real signaling instructions. Reserve clean monitor areas for localized UI overlays. Append the shared style block.

### 22 — `station.dina`

**Prompt:** Create Dina, an Egyptian railway ticket clerk in her early thirties, precise friendly expression, medium-brown skin, modest navy blouse and warm beige headscarf, holding a blank generic ticket. Full-body/seated-compatible three-quarter game sprite, transparent background, square canvas, no official uniform, badge, text, or logo. Append the shared style block.

### 23 — `station.samir`

**Prompt:** Create Samir, an Egyptian train conductor in his fifties, attentive safety-focused expression, medium-dark skin, neat mustache, generic charcoal jacket and cap with no insignia, holding a simple unbranded ticket punch at his side. Full-body three-quarter sprite, transparent background, square canvas, dignified and non-official styling, no text. Append the shared style block.

### 24 — `station.nour`

**Prompt:** Create Nour, an Egyptian university student traveler around age twenty, curious alert expression, medium-brown skin, casual long-sleeved overshirt, trousers, comfortable shoes, backpack and blank notebook. Full-body three-quarter game sprite, transparent background, square canvas, contemporary practical look, no school logo or text. Append the shared style block.

### 25 — `station.ticket`

**Prompt:** Create one isolated fictional railway ticket template: warm cream card, rounded corners, four clearly separated blank data fields, abstract teal route line and perforated edge. Front view, transparent background, wide 3:2 canvas, no words, numerals, QR code, barcode, logo, place, or operator identity. Append the shared style block.

### 26 — `station.barrier`

**Prompt:** Create one isolated waist-high manual station barrier prop with teal painted metal, warm wood top, and a simple blank circular status plate. Transparent background, square canvas, three-quarter angle, friendly readable geometry, no warning words, logo, electronics, or official design. Append the shared style block.

### 27 — `station.clock`

**Prompt:** Create one isolated classic station wall clock with cream face, dark navy rim, minute and hour hands set to a neutral ten-past-ten display, tick marks but no numerals or brand. Transparent background, square canvas, front view, strong small-size readability. Append the shared style block.

### 28 — `station.train`

**Prompt:** Create one isolated side three-quarter view of a generic Egyptian-inspired regional passenger carriage, cream body with a restrained Nile-blue stripe, broad windows, closed doors, no locomotive and no background. Transparent background, 16:9 canvas, no operator logo, Arabic text, carriage number, flag, graffiti, or identifiable real livery. Append the shared style block.

### 29 — `station.badge`

**Prompt:** Create a circular world-completion badge featuring the front silhouette of a friendly generic train beneath a simple canopy arch, Nile-blue rim and coral accent. Transparent outside the badge, square canvas, readable at 48 px, no words, numbers, logos, flags, or official rail symbols. Append the shared style block.

## Cairo traffic world — 12 prompts

### 30 — `traffic.intersection`

**Prompt:** Create a 16:9 scene plate of a broad fictional Cairo-inspired intersection in daylight: mid-rise balconies, shaded shopfronts with blank signs, trees, marked crosswalks, traffic lights, a few stationary generic vehicles, and protected pedestrian islands. No people, brands, readable plates, monuments, collisions, or official signage. Leave the central signal and near sidewalk clear for sprites and UI. Append the shared style block.

### 31 — `traffic.sensor_view`

**Prompt:** Create a 16:9 simplified overhead diagnostic view of the same fictional intersection: clean road geometry, crosswalks, four traffic signals, and translucent abstract teal sensor zones with no numbers. Educational diagram feel within the hand-painted storybook world, no vehicles overlapping people, no labels, map names, real coordinates, or operational engineering detail. Append the shared style block.

### 32 — `traffic.control_room`

**Prompt:** Create a 16:9 compact fictional traffic-control room: curved desk, three large blank monitors, small model intersection panel, notebooks, warm daylight and practical task lighting. No people, camera feeds, maps, readable telemetry, official emblems, police branding, or realistic control instructions. Screens must be flat blank shapes ready for runtime UI. Append the shared style block.

### 33 — `traffic.evening`

**Prompt:** Create a 16:9 resolved Cairo-inspired corridor at warm blue-hour evening: two visible intersections with safely sequenced green phases, orderly generic traffic, illuminated shopfronts with blank signs, protected pedestrians waiting on sidewalks, and soft window lights. No collisions, emergency scene, logos, readable plates, monuments, or text. Keep a calm celebratory mood and room for success UI. Append the shared style block.

### 34 — `traffic.farah`

**Prompt:** Create Farah, an Egyptian transportation engineer in her thirties, thoughtful confident expression, medium-brown skin, dark curly hair tied back, practical long-sleeved shirt and trousers, generic reflective vest with no wording, holding a blank tablet. Full-body three-quarter sprite, transparent background, square canvas, no official logo or safety claim. Append the shared style block.

### 35 — `traffic.youssef`

**Prompt:** Create Youssef, an Egyptian traffic officer in his forties, calm protective stance, dark-brown skin, generic light summer shirt and dark trousers, reflective armband, plain cap without insignia, one hand raised in a gentle wait gesture. Full-body three-quarter sprite, transparent background, square canvas, deliberately non-official uniform, no weapon, badge, logo, or text. Append the shared style block.

### 36 — `traffic.amal`

**Prompt:** Create Amal, an Egyptian city bus driver in her forties, experienced observant expression, medium-brown skin, modest teal blouse and neutral headscarf, holding a small blank route card at her side. Full-body three-quarter game sprite, transparent background, square canvas, no company uniform, logo, route number, or text. Append the shared style block.

### 37 — `traffic.signal`

**Prompt:** Create one isolated simplified vertical traffic signal on a short display stand, three circular lenses red, amber, and green with only the green lens softly illuminated, plus distinct lens patterns for color-accessible recognition. Transparent background, square canvas, three-quarter view, no words, countdown digits, brand, or real controller detail. Append the shared style block.

### 38 — `traffic.road_sensor`

**Prompt:** Create one isolated fictional classroom road-sensor prop: compact rounded teal device with a dark blank lens, two abstract indicator shapes, and a safe low-profile mounting pad. Transparent background, square canvas, three-quarter view, clearly a simplified educational object, no brand, text, exposed wiring, or realistic deployment instructions. Append the shared style block.

### 39 — `traffic.bus`

**Prompt:** Create one isolated side three-quarter view of a generic contemporary Egyptian city bus, warm cream body with teal and coral accent stripes, broad windows, doors closed. Transparent background, 16:9 canvas, no people visible, operator logo, route text, number, license plate, advertisement, flag, or identifiable real livery. Append the shared style block.

### 40 — `traffic.controller`

**Prompt:** Create one isolated fictional traffic-controller tabletop model: friendly rectangular navy enclosure, four unlabeled colored status tiles, blank display, and small model intersection lines on top. Transparent background, square canvas, three-quarter view, intentionally non-operational and child-safe, no text, logo, wiring diagram, ports, or real equipment resemblance. Append the shared style block.

### 41 — `traffic.badge`

**Prompt:** Create a circular world-completion badge featuring three linked traffic-light dots and a curved road line, teal rim, coral and yellow details, warm cream center. Transparent outside the badge, square canvas, readable at 48 px, no letters, numbers, logos, flags, or official road symbols. Append the shared style block.

## State-edit prompts — 3 prompts

These are edits, not new generations. Supply the accepted base scene as the reference and request only the listed change so layout remains pixel-consistent.

### 42 — `bakery.queue.resolved`

**Edit prompt:** Edit the supplied accepted `bakery.queue` scene only. Preserve camera, architecture, light, palette, blank signs, rails, and every fixed object. Show the resolved state by adding a small neat stack of filled bread trays behind the distant counter, shifting the blank number display to a non-text green circular status icon, and making the central lane feel clear and ready. Add no people, words, numbers, logos, new architecture, or unrelated objects. Match the source's warm hand-painted 2D storybook texture exactly.

### 43 — `station.platform.ready`

**Edit prompt:** Edit the supplied accepted `station.platform` scene only. Preserve camera, train design and position, canopy, safety line, palette, and blank signage. Show readiness by softly illuminating a non-text green status lamp near the blank platform sign, opening no doors, and adding two tidy luggage silhouettes safely behind the line. Add no people, words, numbers, logos, new train cars, or operational details. Match the source's warm hand-painted 2D storybook texture exactly.

### 44 — `traffic.intersection.synchronized`

**Edit prompt:** Edit the supplied accepted `traffic.intersection` scene only. Preserve camera, buildings, road geometry, vehicles, crosswalks, palette, and all blank signs. Show a safe synchronized success state: the learner-facing direction has green signals, the crossing direction has red signals, vehicles remain orderly, and pedestrian islands stay protected. Add a subtle warm late-afternoon glow but no new people, text, numbers, logos, collisions, emergency vehicles, monuments, or changed architecture. Match the source's warm hand-painted 2D storybook texture exactly.

## Export and import contract

- Master scene: 3840×2160 PNG or lossless WebP source; runtime AVIF/WebP variants at 1920, 1280, and 768 widths.
- Character/prop: transparent PNG master, typically 2048×2048; runtime WebP variants at 1024, 512, and 256.
- Preserve editable source outside the runtime bucket.
- File name: `<manifest-id>__v<integer>__<size>.<ext>`.
- Asset metadata: manifest ID, version, SHA-256, dimensions, focal point, safe crop, locale-neutral alt intent, prompt ID, and review status.
- Private source bucket contains prompts and masters; public optimized bucket contains only reviewed runtime derivatives.
- Human review checks anatomy, cultural fit, consistency, blank-text rule, trademarks, safety, crop resilience, transparency, and small-size legibility before an asset becomes manifest-eligible.
