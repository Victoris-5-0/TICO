# TICO 🚀

> **An intelligent, interactive programming companion designed to teach modern programming with hands-on practice, personalized feedback, and structured learning tracks.**

---

## 📖 Overview

**TICO** is a full-stack educational platform and AI programming tutor that helps learners master coding through guided lessons, real-time code challenges, and adaptive companion assistance.

### ✨ Key Features

- 🎯 **Curated Learning Tracks**: Structured curricula spanning TypeScript, Python, web development, and algorithms.
- 💻 **Interactive Coding Challenges**: Embedded code editor with automated test suite validation, hints, and immediate feedback.
- 🤖 **AI Teaching Companion**: Context-aware AI companion to clarify concepts, review code, explain errors, and provide guided hints.
- 📈 **Gamified Progress Tracking**: XP points, daily streaks, lesson mastery metrics, and submission history.
- 👨‍🏫 **Role-Based System**: Distinct student, instructor, and administrator permissions for authoring and learning content.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM & Migrations**: [Prisma](https://www.prisma.io/)
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## 🚀 Getting Started

### 1. Prerequisites

Ensure you have the following installed:
- **Node.js**: `v20.x` or later
- **pnpm**: `v10.x` or later
- **PostgreSQL**: Local instance or cloud database (Neon, Supabase, etc.)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd TICO
pnpm install
```

### 3. Environment Configuration

Copy the example environment file and update your PostgreSQL credentials:

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tico?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Database Setup & Migrations

Generate the Prisma Client and apply migrations to your PostgreSQL database:

```bash
# Generate Prisma Client types
pnpm db:generate

# Apply migrations (development)
pnpm db:migrate

# (Optional) Seed the database with demo tracks, lessons, and users
pnpm db:seed
```

To visually inspect and manage your database data:

```bash
pnpm db:studio
```

### 5. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
TICO/
├── prisma/
│   ├── migrations/         # PostgreSQL migration files
│   ├── schema.prisma       # Database schema definition
│   └── seed.ts             # Initial data seeding script
├── public/                 # Static assets
├── src/
│   ├── app/                # Next.js App Router (pages, layouts, api routes)
│   │   ├── globals.css     # Global styles with Tailwind CSS
│   │   ├── layout.tsx      # Root application layout
│   │   └── page.tsx        # Homepage
│   └── lib/
│       └── db.ts           # Prisma client singleton instance
├── .env.example            # Environment variables template
├── next.config.ts          # Next.js configuration
├── package.json            # Scripts & project dependencies
├── tsconfig.json           # TypeScript configuration
└── README.md
```

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts the Next.js development server with Turbopack |
| `pnpm build` | Builds the production-ready application |
| `pnpm start` | Starts the production server |
| `pnpm lint` | Runs ESLint checks |
| `pnpm db:generate` | Generates TypeScript types for Prisma Client |
| `pnpm db:migrate` | Runs database migrations in development |
| `pnpm db:deploy` | Applies pending migrations in production |
| `pnpm db:push` | Pushes the schema state directly to the DB without migration files |
| `pnpm db:seed` | Seeds database with demo courses, exercises, and accounts |
| `pnpm db:studio` | Launches Prisma Studio GUI for database inspection |

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
