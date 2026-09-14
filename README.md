# TICO — Learn Python by helping Egypt

<p align="center"><img src="client/public/assets/landing/logo.svg" alt="TICO" width="220" /></p>

TICO is a bilingual, story-driven programming game for children and beginner university students. Learners write real Python to help characters solve everyday Egyptian problems: opening a neighborhood bakery, serving a queue, organizing railway journeys, and coordinating Cairo traffic.

Every coding action produces a visible consequence in the world. A variable can open the shop or prepare several trays; an `if` condition can decide who receives bread; a wrong quantity can leave a customer waiting. TICO, the orange robot companion, explains programming from zero and provides a four-step hint ladder without giving away complete solutions.

> **Languages:** Egyptian Arabic (`ar-EG`) and English (`en`). Interface text follows the selected direction while Python code and output remain left-to-right.

## Live demos

| Service | URL | Purpose |
| --- | --- | --- |
| Client | [tico.0xd22.dev](https://tico.0xd22.dev) | Next.js game, maps, missions, and learner dashboard |
| AI API | [54-75-53-43.sslip.io/docs](https://54-75-53-43.sslip.io/docs) | Interactive FastAPI / Swagger documentation |
| AI health | [54-75-53-43.sslip.io/v1/health](https://54-75-53-43.sslip.io/v1/health) | Process and database readiness |

The client and AI health URLs were verified on 15 September 2026.

## Screenshots

### Landing page

![TICO landing page](docs/images/landing.webp)

### Learning map

![TICO learning map](docs/images/map.webp)

### Interactive bakery mission

![Interactive El Forn mission](docs/images/mission.webp)

### Learner analysis dashboard

![TICO learner analysis dashboard](docs/images/analysis-dashboard.webp)

## Gameplay and learning design

Each mission follows six authored learning phases while the setting, cast, and props provide variety:

1. **Encounter** — a character introduces a concrete problem in the scene.
2. **Explore** — the learner predicts what should happen.
3. **Discover** — TICO introduces the Python concept in plain language.
4. **Understand** — the learner runs and reads a complete example.
5. **Guided coding** — two or more small coding steps change the world.
6. **Remix** — a new requirement asks the learner to adapt their code.

The current authored El Forn path contains two variable missions and two conditional missions: `رسالة الفتح`, `عدّ الصواني`, `ظلي العيلة`, and `النصيب العادي`. Each includes multiple scene interactions and three meaningful gameplay beats.

Python runs locally in a sandboxed Pyodide Web Worker. This gives immediate feedback and keeps untrusted learner code away from the Next.js and AI servers. AI output never decides whether code passed: deterministic tests, schemas, manifests, and progression rules make that decision.

## Technology stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js 16 App Router, React 19, TypeScript 5 |
| UI and motion | Tailwind CSS 4, CSS Modules, Motion for React |
| Code editor | CodeMirror 6 with Python language support |
| Browser execution | Pyodide in a dedicated Web Worker |
| Authentication | Better Auth with Google OAuth and opaque sessions |
| Application data | PostgreSQL on Supabase, Prisma ORM and migrations |
| AI service | Python 3.11+, FastAPI, Pydantic 2 |
| AI orchestration | LangChain, LangGraph, Google Gemini |
| AI data access | SQLAlchemy 2 with psycopg2; Prisma remains migration owner |
| Validation and tests | Node test runner, Pytest, Playwright, ESLint |
| Deployment | Vercel client, Supabase database/storage, AWS EC2 AI service behind Nginx and Gunicorn/Uvicorn |

## Repository structure

```text
TICO/
├── client/
│   ├── prisma/                    # Authoritative schema and migrations
│   ├── public/
│   │   ├── assets/                # Reviewed runtime scenes, props, sprites, audio
│   │   └── pyodide-worker.js      # Isolated Python execution worker
│   ├── scripts/                   # Mission import, asset preparation, screenshots
│   └── src/
│       ├── app/                   # App Router pages and route handlers
│       ├── components/
│       │   ├── analysis/          # Learner progress dashboard
│       │   ├── bakery/            # Layered bakery renderer and simulation
│       │   ├── mission-player/    # Six-phase coding experience
│       │   └── mission-ui/        # World and challenge maps
│       ├── lib/                   # Auth, runner, AI types, manifests
│       └── services/              # Server-side application services
├── ai-backend/
│   ├── app/
│   │   ├── ai/                    # Model router, prompts, guards, graphs
│   │   ├── api/v1/                # FastAPI routers
│   │   ├── manifests/             # Versioned world vocabulary loader
│   │   ├── models_tables/         # SQLAlchemy mappings to Prisma tables
│   │   ├── queries/               # Database access
│   │   ├── rules/                 # Deterministic pedagogy and progression
│   │   ├── schemas/               # Pydantic/OpenAPI contracts
│   │   └── services/              # AI use-case orchestration
│   ├── content/
│   │   ├── prebuilt/              # Reviewed authored missions
│   │   └── worlds/                # Closed world manifests
│   ├── deploy/                    # EC2, Nginx, systemd, Docker guidance
│   ├── scripts/                   # Contract generation and validation
│   └── tests/
├── docs/                          # Product, architecture, UX, safety, and art docs
├── AGENTS.md                      # Repository-wide contribution rules
└── pnpm-workspace.yaml
```

## Architecture

```mermaid
flowchart LR
    B[Learner browser] -->|HTTPS| N[Next.js on Vercel]
    B -->|Python source| W[Pyodide Web Worker]
    N -->|Prisma queries and migrations| P[(Supabase PostgreSQL)]
    N -->|Better Auth| P
    N -->|Google OAuth| O[Google OAuth]
    N -->|Authenticated HTTPS| F[FastAPI AI service]
    F -->|SQLAlchemy reads and writes| P
    F -->|Structured model calls| G[Google Gemini]
    N -->|Reviewed files| A[Static assets / storage]
```

The boundaries are deliberate:

- **The client owns gameplay.** It renders scenes, runs learner Python, records submissions, updates progress, and owns every database migration.
- **The AI backend returns decisions and prose.** It never renders game state, executes learner code, or changes the schema.
- **Prisma is the database authority.** SQLAlchemy maps the same tables for AI use cases but does not create or migrate them.
- **OpenAPI is the HTTP authority.** TypeScript AI types are generated from FastAPI and checked for drift.
- **World manifests constrain generation.** Models select from approved characters, props, actions, and mechanics instead of inventing runtime APIs.

### Mission request flow

```mermaid
sequenceDiagram
    participant L as Learner
    participant C as Next.js client
    participant R as Pyodide worker
    participant A as FastAPI AI
    participant D as PostgreSQL
    participant G as Gemini
    L->>C: Select a lesson stop
    C->>A: Request prepared or adaptive mission
    A->>D: Load plan, mastery, and mission pool
    A->>G: Generate only when needed
    A->>A: Validate schema, world references, code, and tests
    A-->>C: Six-phase mission JSON
    L->>R: Run Python
    R-->>C: Deterministic test results
    C->>D: Save submission and progress
    C->>A: Refresh mastery asynchronously
```

## AI services

TICO uses one companion persona and six bounded AI capabilities:

| Capability | Deterministic layer | Model contribution |
| --- | --- | --- |
| Hints and TICO chat | Chooses context, hint rung, safety limits, and cache key | Writes short Socratic guidance |
| Error analysis | Normalizes runner evidence and restricts categories | Classifies ambiguous failures |
| Student model | Computes weighted mastery from evidence | Optional summary only |
| Path planner | Produces required and optional lesson choices | Reviews conflicting evidence |
| Adaptive composer | Selects scaffold, repetition, and advance/hold rules | Reviews uncertain conflicts |
| Mission generation | Narrows the legal curriculum and scene vocabulary, then validates code | Composes a structured mission draft |

Every structured model result is parsed through Pydantic. Generated missions must pass schema validation, manifest-reference checks, concept-scope checks, localization and safety checks, and executable solution tests. A failed generation retries once, then falls back to reviewed content. Mastery and pass/fail results never come from a language model.

The four-rung hint ladder gradually moves from attention guidance to a verbal repair explanation. Even its final rung does not return a complete runnable answer.

## AI API endpoints

All application routes use the `/v1` prefix. Protected routes validate Better Auth bearer sessions against the shared database. Successful JSON responses use a `{ data, meta }` envelope; errors use a stable `{ error }` envelope. TICO chat streams server-sent events.

| Method | Endpoint | Responsibility |
| --- | --- | --- |
| `GET` | `/v1/health` | Process and database health |
| `POST` | `/v1/sessions` | Open a mission session |
| `PATCH` | `/v1/sessions/{session_id}/phase` | Advance the recorded mission phase |
| `POST` | `/v1/sessions/{session_id}/close` | Close a mission session |
| `POST` | `/v1/sessions/{session_id}/debrief` | Produce the end-of-mission debrief |
| `POST` | `/v1/hints` | Return the next bounded hint rung |
| `POST` | `/v1/submissions/analyze` | Classify normalized execution failures |
| `POST` | `/v1/students/{student_id}/refresh` | Recompute deterministic mastery |
| `POST` | `/v1/students/{student_id}/plan` | Build the learner's next lesson path |
| `POST` | `/v1/missions/next` | Select or generate the next six-phase mission |
| `POST` | `/v1/missions/by-lesson` | Resolve the mission behind a specific map stop |
| `GET` | `/v1/missions/{mission_id}` | Reload a validated stored mission |
| `POST` | `/v1/missions/generate` | Explicitly generate and validate a mission |
| `POST` | `/v1/challenges/next` | Build mixed practice from mastered concepts |
| `POST` | `/v1/tico/messages` | Stream mission-scoped TICO chat over SSE |

The executable contract is available from [`/openapi.json`](https://54-75-53-43.sslip.io/openapi.json), with Swagger at the live AI demo linked above.

## Asset generation and scene production

TICO uses a warm, hand-painted 2D storybook style grounded in contemporary everyday Egypt. Production rules avoid readable generated text, brands, official emblems, stereotypes, and unrelated tourist motifs. Characters and props are generated as isolated transparent layers, reviewed by a person, optimized to WebP, and registered in a closed manifest before code can reference them.

<p align="center">
  <img src="client/public/assets/bakery-v2/frames/flour-sacks.webp" alt="Illustrated flour sacks" width="150" />
  <img src="client/public/assets/bakery-v2/frames/bread-board.webp" alt="Bread board with a visible baked result" width="150" />
  <img src="client/public/assets/bakery-v2/frames/scooter-crate.webp" alt="Bakery delivery scooter" width="190" />
  <img src="client/public/assets/bakery-v2/frames/coin-drawer.webp" alt="Bakery coin drawer" width="150" />
</p>

The bakery is composed in a shared 1600×900 SVG coordinate system. Environment layers, fixtures, actors, props, bread ownership, queue state, delivery state, money, and animation beats remain independent. This lets code visibly change one part of the scene while keeping the rest stable.

The asset workflow is:

1. Write a versioned prompt from the [asset bible](docs/09-asset-bible-and-image-prompts.md).
2. Generate a master scene, character atlas, or isolated prop.
3. Review cultural fit, anatomy, transparency, crop safety, and small-size readability.
4. Cut sprite sheets by connected components with `client/scripts/cut-sprite-sheet.py` when needed.
5. Export optimized WebP runtime assets.
6. Add stable IDs to both the AI world manifest and client scene manifest.
7. Run asset-budget, placement, overlap, interaction, and browser-playthrough checks.

See [layered bakery production](docs/13-bakery-layered-production.md) and the prompt collections under `docs/*.json` for reproducible examples.

## Local development

### Requirements

- Node.js compatible with Next.js 16
- pnpm 10.28+
- Python 3.11+
- PostgreSQL/Supabase credentials
- Google OAuth credentials for sign-in
- Google Gemini API key for live AI features

### Client

```bash
cd client
pnpm install
copy .env.example .env
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`. Use `pnpm test`, `pnpm typecheck`, and `pnpm lint` for validation. Run all Prisma commands from `client/`; never run `prisma migrate reset` against the shared database.

### AI backend

```bash
cd ai-backend
python -m venv env
# Windows: env\Scripts\activate
# macOS/Linux: source env/bin/activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for Swagger or `http://localhost:8000/v1/health` for readiness. Run `pytest` from `ai-backend/`.

### Contract checks

After changing a Pydantic API schema, regenerate and verify the client types:

```bash
python ai-backend/scripts/gen_client_types.py
python ai-backend/scripts/gen_client_types.py --check
```

Database changes begin in `client/prisma/schema.prisma`, include a Prisma migration in the same commit, and then update matching SQLAlchemy models.

## Documentation

The [documentation map](docs/README.md) links the detailed product, curriculum, world, UX, architecture, browser-runner, AI, asset, security, testing, and mission-authoring specifications. Settled MVP decisions live in [`docs/decisions/`](docs/decisions/).

Before contributing, read [`AGENTS.md`](AGENTS.md) and the relevant nested service instructions. The project uses `pnpm` for the client and keeps Python dependencies inside `ai-backend/`.
