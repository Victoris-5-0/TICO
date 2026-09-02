# TICO

TICO is an intelligent programming companion platform organized as a small monorepo.

## Repository layout

```text
TICO/
├── client/          # Next.js frontend + TypeScript backend + Prisma
├── ai-backend/      # Python AI backend
├── docs/            # Architecture and project documentation
├── AGENTS.md
├── CLAUDE.md
├── README.md
└── pnpm-workspace.yaml
```

## Client

The existing Next.js application now lives in `client/`.

```bash
cd client
pnpm install
pnpm dev
```

Database and Prisma commands are also run from `client/`:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Python AI backend

Python AI services live in `ai-backend/`. Keep model integrations, agent orchestration, AI APIs, evaluation, and related Python code there.

See `ai-backend/README.md` for the backend scaffold and `docs/architecture.md` for service boundaries.
