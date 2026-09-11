/**
 * Import a phased mission JSON into `generated_missions`.
 *
 *   pnpm mission:import ../response_1789007764977.json
 *   pnpm mission:import ./mission.json --user <userId>
 *
 * WHY THIS EXISTS. In the normal path the Python service writes this row itself and
 * `mission.service.ts` only links `userId`/`templateId` — see the long comment there
 * about why the client must never overwrite `content`. This script is for the other
 * path: a mission JSON handed over as a file, out of band, when the pipeline did not
 * run against this database.
 *
 * It is idempotent. Re-importing the same file updates the row rather than making a
 * second one, so running it against a mission the Python service already wrote is safe
 * and changes nothing but the linkage.
 *
 * Accepts either the raw `PhasedMissionOut` or the `{data, meta}` envelope that docs/06
 * requires on every response, because that is what actually arrives in a file.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import type { PhasedMissionOut } from "../src/lib/ai/types";

const db = new PrismaClient();

/** `el_forn` in the manifest is `el-forn` in `tracks.slug`. The one naming seam. */
const trackSlugFor = (worldId: string) => worldId.replace(/_/g, "-");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let userId: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--user") {
      userId = argv[i + 1];
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }

  if (!positional[0]) {
    throw new Error("usage: pnpm mission:import <mission.json> [--user <userId>]");
  }
  return { file: resolve(positional[0]), userId };
}

function readMission(file: string): PhasedMissionOut {
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const mission = (raw as { data?: PhasedMissionOut }).data ?? (raw as PhasedMissionOut);

  const required = ["id", "worldId", "sceneId", "targetConceptId", "phases"] as const;
  const missing = required.filter((key) => mission[key] === undefined);
  if (missing.length) {
    throw new Error(`${file} is not a phased mission — missing ${missing.join(", ")}`);
  }

  const phases = ["encounter", "explore", "discover", "understand", "guided", "remix"] as const;
  const absent = phases.filter((phase) => !mission.phases[phase]);
  if (absent.length) {
    throw new Error(`mission ${mission.id} is missing phases: ${absent.join(", ")}`);
  }

  // A mission the validator refused is never shown to a student, so importing one is
  // almost certainly a mistake rather than a decision.
  if (!mission.validated) {
    throw new Error(
      `mission ${mission.id} has validated: false. The Python validator rejected it; ` +
        "importing it would put an unchecked mission in front of a child.",
    );
  }

  return mission;
}

/**
 * The template to link this mission to.
 *
 * A mission that already has one keeps it. A track/concept pair can have several
 * templates — el-forn/variables has more than one — and `findFirst` across them has no
 * defined order, so re-resolving on every import would silently re-point an existing
 * mission at a different mechanic each run. The row's existing link is authoritative;
 * this only has to decide for a mission being created.
 */
async function resolveTemplate(
  trackId: string,
  mission: PhasedMissionOut,
  currentTemplateId: string | undefined,
) {
  if (currentTemplateId) {
    const linked = await db.missionTemplate.findUnique({ where: { id: currentTemplateId } });
    if (linked) return linked;
  }

  const existing = await db.missionTemplate.findFirst({
    where: { trackId, targetConceptId: mission.targetConceptId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return db.missionTemplate.create({
    data: {
      trackId,
      targetConceptId: mission.targetConceptId,
      carriedConceptIds: mission.carriedConceptIds ?? [],
      mechanicId: "imported",
      scenes: [mission.sceneId],
      propsRequired: [],
      paramSchema: {},
      difficultyBand: mission.difficultyBand ?? 5,
      manifestVersion: "1.0.0",
    },
  });
}

async function main() {
  const { file, userId } = parseArgs(process.argv.slice(2));
  const mission = readMission(file);

  const slug = trackSlugFor(mission.worldId);
  const track = await db.track.findUnique({ where: { slug } });
  if (!track) {
    const have = await db.track.findMany({ select: { slug: true } });
    throw new Error(
      `no track '${slug}' for world '${mission.worldId}' (have: ${have.map((t) => t.slug).join(", ")})`,
    );
  }

  const concept = await db.concept.findUnique({ where: { slug: mission.targetConceptId } });
  if (!concept) {
    throw new Error(
      `target concept '${mission.targetConceptId}' is not in the database — mastery could never move`,
    );
  }

  if (userId) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new Error(`no user '${userId}'`);
  }

  const existing = await db.generatedMission.findUnique({ where: { id: mission.id } });
  const template = await resolveTemplate(track.id, mission, existing?.templateId);

  // `content` is the whole mission: `app/services/hints.py` reads
  // `content.phases.guided.solutionCode` and `app/services/sessions.py` reads
  // `content.targetConceptId`, so storing a flattened view here breaks both silently.
  const row = {
    templateId: template.id,
    sceneId: mission.sceneId,
    params: {},
    content: mission as unknown as object,
    scaffoldPlan: (mission.scaffold ?? {}) as object,
    validated: mission.validated,
    manifestVersion: "1.0.0",
    ...(userId ? { userId } : {}),
  };

  const saved = await db.generatedMission.upsert({
    where: { id: mission.id },
    create: { id: mission.id, ...row },
    update: row,
  });

  console.log(`${existing ? "updated" : "created"}  generated_missions/${saved.id}`);
  console.log(`  title      ${mission.titleAr}`);
  console.log(`  world      ${mission.worldId} -> tracks/${track.slug}`);
  console.log(`  scene      ${mission.sceneId}`);
  console.log(`  concept    ${mission.targetConceptId}${mission.carriedConceptIds?.length ? ` (carries ${mission.carriedConceptIds.join(", ")})` : ""}`);
  console.log(`  template   ${template.id} (${template.mechanicId})`);
  console.log(`  user       ${saved.userId ?? "(unassigned)"}`);
  console.log(`  source     ${mission.source}, difficulty band ${mission.difficultyBand ?? "?"}`);
  console.log(`\n  play at    /{locale}/worlds/${track.slug}/missions/${saved.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(`\nimport failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
