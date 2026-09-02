<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TICO - Agent Guidelines & Architecture Rules

This repository houses **TICO**, an intelligent programming companion platform designed for teaching and learning programming interactively.

All AI agents and contributors working in this codebase **MUST** strictly adhere to the following architectural conventions and database workflows.

---

## 1. Tech Stack & Tooling

- **Framework**: Next.js 16 (App Router, Turbopack, React 19)
- **Language**: TypeScript (strict mode enabled)
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL
- **ORM & Migrations**: Prisma ORM
- **Package Manager**: `pnpm`
  - ⚠️ **RULE**: ALWAYS use `pnpm` (`pnpm add`, `pnpm install`, `pnpm run`). NEVER use `npm` or `yarn`.

---

## 2. Database Architecture & Rules

### 2.1 Prisma Client Singleton
- **Location**: `src/lib/db.ts`
- ⚠️ **RULE**: **NEVER** instantiate `new PrismaClient()` directly in API routes, Server Actions, or components. This causes connection pool leaks.
- **Usage**: Always import the shared instance:
  ```typescript
  import { db } from "@/lib/db";
  ```

### 2.2 Schema Management (`prisma/schema.prisma`)
- The single source of truth for database schema is `prisma/schema.prisma`.
- Whenever you modify `prisma/schema.prisma`:
  1. Run `pnpm db:generate` to regenerate `@prisma/client` types.
  2. Create/apply migrations using `pnpm db:migrate` (or `pnpm exec prisma migrate dev --name <descriptive_name>`).
  3. Never manually alter database tables without corresponding Prisma migration files in `prisma/migrations/`.

### 2.3 Prisma Configuration (`prisma.config.ts`)
- Prisma configuration is managed through `prisma.config.ts`.
- ⚠️ **RULE**: Do NOT add database or seed configurations to `package.json` under `"prisma"` — use `prisma.config.ts`.

### 2.4 Migrations & Database Scripts
- `pnpm db:generate` – Regenerates Prisma Client types after schema edits.
- `pnpm db:migrate` – Creates and applies a new migration in development.
- `pnpm db:deploy` – Applies pending migrations in production / CI environments.
- `pnpm db:push` – Prototype schema changes directly (use only for quick local experiments, NOT for shipping changes).
- `pnpm db:seed` – Seeds initial database tracks, lessons, exercises, and demo users (`prisma/seed.ts`).
- `pnpm db:studio` – Opens Prisma Studio GUI.

### 2.5 Database Transactions & Atomicity
- When performing multi-table mutations (e.g., completing an exercise, awarding XP, updating streaks, and saving submission status), **always** wrap the operations in a Prisma transaction:
  ```typescript
  await db.$transaction(async (tx) => {
    // Operations using tx
  });
  ```

### 2.6 Environment Variables & Security
- The database connection string is stored in `DATABASE_URL`.
- ⚠️ **RULE**: NEVER commit `.env` or hardcode database connection strings / credentials.
- When introducing new environment variables, ALWAYS update `.env.example` with sanitized placeholders.

---

## 3. Data Models Reference

Key models defined in `prisma/schema.prisma`:

| Model | Purpose |
| :--- | :--- |
| `User` | User accounts, roles (`STUDENT`, `TEACHER`, `ADMIN`), XP, and streaks. |
| `Track` | Top-level courses / learning tracks (e.g., TypeScript, Python). |
| `Lesson` | Individual curriculum units belonging to a Track. |
| `Exercise` | Coding tasks with starter code, solutions, test cases (JSON), and hints. |
| `Submission` | User code submissions, evaluation status, and execution metrics. |
| `UserProgress` | Progress tracking per user and lesson. |
| `CompanionChat`| Chat history between the user and the AI teaching companion. |

---

## 4. Next.js App Router Conventions

- **Server Components by Default**: Pages and components should remain React Server Components (RSC) unless interactivity (hooks, event handlers, client state) is required.
- **Client Components**: Add `'use client'` at the top of files that manage client state or event handlers. Keep client boundaries as small as possible.
- **Server Actions & Mutations**: Place Server Actions in dedicated files (e.g., `src/actions/...`) or co-locate with `'use server'` directives. Always validate inputs (e.g., using Zod) before executing database operations.
- **Import Aliases**: Use the `@/*` alias mapped to `src/*` (e.g., `@/lib/db`, `@/app/...`).
