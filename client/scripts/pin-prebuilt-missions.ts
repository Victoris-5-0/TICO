/**
 * Mark the prebuilt missions as the pinned set.
 *
 *   pnpm mission:pin                       # report what would change
 *   pnpm mission:pin --write               # apply
 *   pnpm mission:pin --dir ../somewhere    # a different prebuilt directory
 *
 * A pinned mission is authored content rather than a per-student generation: every
 * student playing that lesson gets the same one. That is what makes one recording of the
 * narration correct for everybody, and it is why these rows are never claimed with a
 * `user_id` the way generated missions are.
 *
 * The flag lives in `params.prebuilt`. `params` already holds "how this row came to be"
 * (pre-generation writes `source` and `repetition` there) and `content` is the contract
 * with the frontend, so this belongs beside the former and not in the latter.
 *
 * Reading `ai-backend/content/prebuilt/` is a one-off admin step, not runtime coupling —
 * the root AGENTS.md rule is about the services talking to each other while running. The
 * missions themselves are already in the database; this only tags the ones that ship.
 */

import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEFAULT_DIR = resolve(process.cwd(), "../ai-backend/content/prebuilt");

function parseArgs(argv: string[]) {
  const write = argv.includes("--write");
  const dirFlag = argv.indexOf("--dir");
  const dir = dirFlag >= 0 ? resolve(argv[dirFlag + 1] ?? "") : DEFAULT_DIR;
  return { write, dir };
}

type Prebuilt = { id: string; titleAr: string; concept: string; repetition: number | null; file: string };

function readPrebuilt(dir: string): Prebuilt[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as { data?: Record<string, unknown> };
    const mission = (raw.data ?? raw) as Record<string, unknown>;
    // `variables-2-<id>.json` — the repetition is in the name, and also in `params` on
    // the row. The filename is the one thing that cannot drift from what shipped.
    const match = /^([a-z]+)-(\d+)-/.exec(file);
    return {
      id: String(mission.id),
      titleAr: String(mission.titleAr ?? ""),
      concept: String(mission.targetConceptId ?? match?.[1] ?? ""),
      repetition: match ? Number(match[2]) : null,
      file,
    };
  });
}

async function main() {
  const { write, dir } = parseArgs(process.argv.slice(2));
  const prebuilt = readPrebuilt(dir);

  if (!prebuilt.length) throw new Error(`no prebuilt missions in ${dir}`);
  console.log(`${prebuilt.length} prebuilt missions in ${dir}\n`);

  let missing = 0;
  let pinned = 0;

  for (const item of prebuilt) {
    const row = await db.generatedMission.findUnique({
      where: { id: item.id },
      select: { id: true, validated: true, params: true, content: true },
    });

    if (!row) {
      console.log(`  MISSING  ${item.file} — not in the database; import it first`);
      missing += 1;
      continue;
    }

    const params = (row.params && typeof row.params === "object" ? row.params : {}) as Record<string, unknown>;
    const already = params.prebuilt === true;

    // An unvalidated mission is never shown to a student, so pinning one would take a
    // lesson out of service rather than fill it.
    if (!row.validated) {
      console.log(`  SKIP     ${item.concept}/${item.repetition} ${item.titleAr} — not validated`);
      continue;
    }

    console.log(
      `  ${already ? "ok      " : write ? "PINNED  " : "would   "} ${item.concept}/${item.repetition}  ${item.titleAr}`,
    );

    if (!already && write) {
      await db.generatedMission.update({
        where: { id: item.id },
        data: {
          params: { ...params, prebuilt: true, repetition: item.repetition ?? params.repetition ?? null },
          // Shared content, owned by nobody. A `user_id` here would make one student's
          // claim hide the mission from everyone else.
          userId: null,
        },
      });
      pinned += 1;
    }
  }

  console.log();
  if (missing) console.log(`  ${missing} missing from the database`);
  if (write) {
    console.log(`  pinned ${pinned} mission(s)`);
  } else {
    console.log("  dry run — nothing written. Re-run with --write to apply.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(`\npin failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
