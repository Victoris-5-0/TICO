# Egypt world bibles

## Shared canon

The setting is contemporary, lived-in Egypt: useful public places, ordinary people, recognizable materials, Arabic environmental rhythm, and practical community problems. Egypt is the substance of the challenges, not a decorative skin.

TICO is a small hoopoe with a subtle tech satchel. TICO is the only speaking companion persona; human characters create story context and react visually, while instructional dialogue retains TICO's voice.

- Show diverse ages, skin tones, modest and everyday clothing, and mixed abilities without caricature.
- Prefer local cues: sun-faded paint, patterned tiles, metal shutters, shaded awnings, concrete, enamel signs, and warm daylight.
- Avoid brands, political marks, real government seals, exact railway branding, stereotypes, poverty spectacle, and unrelated pharaonic motifs.
- Never bake instructional text into images. Signboards and displays are blank; localized UI supplies text.
- Queues are orderly problems to improve, never an excuse to mock people.

## World 1 — El Forn: the public baladi bakery

**Purpose:** introduce Python through counting, orders, limits, batches, and reusable calculation.

**Story:** Morning demand is rising. TICO helps Hassan and Salma make the bread flow clearer and fairer, from opening notice to batch planning.

Characters are `bakery.hassan` (experienced baker), `bakery.salma` (practical queue coordinator), and `bakery.mariam` (patient household customer). Scenes are `bakery.street`, `bakery.queue`, `bakery.counter`, and `bakery.store`.

| Prop ID | Reads | Verbs | Use |
| --- | --- | --- | --- |
| `bakery.tray` | `capacity`, `loaves` | `fill()`, `count()` | arithmetic and batches |
| `bakery.queue_token` | `number` | `issue()` | ordered service |
| `bakery.card_reader` | `requested_loaves`, `allowed_loaves` | `approve()`, `adjust()` | conditional rules; wholly fictional UI |
| `bakery.flour_sack` | `kilograms` | `use()` | extension calculations |

Represent baladi bread as familiar round flat loaves. Do not claim current subsidy rules, entitlement amounts, prices, or eligibility; all mission data is explicitly fictional. Completion shows a moving queue and stocked trays.

## World 2 — El Mahatta: Egyptian railway station

**Purpose:** teach collections and composition through tickets, queues, destinations, platforms, and seat rows.

**Story:** A fictional regional departure needs accurate passenger information. TICO helps organize the ticket line, direct groups, and prepare a dispatch summary.

Characters are `station.dina` (precise ticket clerk), `station.samir` (safety-focused conductor), and `station.nour` (university student traveler). Scenes are `station.concourse`, `station.ticket_hall`, `station.platform`, and `station.dispatch`.

| Prop ID | Reads | Verbs | Use |
| --- | --- | --- | --- |
| `station.ticket` | `passenger`, `destination`, `carriage`, `seat` | `validate()` | structured travel data |
| `station.barrier` | `is_open` | `open()`, `close()` | conditional feedback |
| `station.clock` | `hour`, `minute` | `set_time()` | scheduling extensions |
| `station.train` | `code`, `capacity`, `passengers` | `board()`, `depart()` | collection problems |

Do not reproduce a live timetable, operational procedure, logo, uniform insignia, or security layout. Keep everyone safely behind the platform line. Completion shows an orderly, train-ready platform.

## World 3 — Isharet Cairo: traffic control

**Purpose:** deepen conditional, loop, validation, state, and debugging skills through a simplified city intersection model.

**Story:** Sensor data and signal timing need attention. TICO helps Farah's team restore one intersection, then coordinate a small fictional corridor.

Characters are `traffic.farah` (transportation engineer), `traffic.youssef` (safety-focused officer), and `traffic.amal` (experienced city bus driver). Scenes are `traffic.intersection`, `traffic.sensor`, `traffic.control_room`, and `traffic.evening`.

| Prop ID | Reads | Verbs | Use |
| --- | --- | --- | --- |
| `traffic.signal` | `state`, `countdown` | `set_state()`, `tick()` | branching and loops |
| `traffic.sensor` | `vehicle_count`, `valid` | `read()`, `reset()` | aggregation and validation |
| `traffic.bus` | `route_code`, `waiting` | `move()`, `stop()` | state feedback |
| `traffic.controller` | `intersections`, `fault_code` | `update()`, `diagnose()` | functions and debugging |

This is a classroom simulation, not real traffic-control guidance. Use fictional routes and interfaces, no official insignia, no collisions, and no implication that learner code controls infrastructure. Completion shows synchronized safe phases with protected pedestrians.

## Manifest rule

Each world is a versioned YAML manifest in `ai-backend/content/worlds/`. A mission generator may select only listed scenes, characters, props, reads, verbs, mechanics, and constraints. Adding a noun to prose does not add it to canon; update and review the manifest first.
