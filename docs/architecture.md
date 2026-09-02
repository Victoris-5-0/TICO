# TICO Architecture

TICO is split into two application services plus documentation.

## Root services

### `client/`
The Next.js application owns the user-facing frontend and TypeScript server-side/backend responsibilities, including Prisma and PostgreSQL access.

### `ai-backend/`
The Python service owns AI-specific logic: model integrations, orchestration, tutoring/coaching workflows, code analysis, personalization, hinting, and related AI APIs.

### `docs/`
Contains architecture notes, API contracts, implementation decisions, and setup documentation shared across services.

## Service boundary

The client/backend should call the Python AI backend through explicit APIs. Avoid filesystem or language-runtime coupling between the services. Shared request/response contracts should be documented here as the integration surface grows.
