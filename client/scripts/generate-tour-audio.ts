/**
 * Pre-record the spoken lines of the opening tour.
 *
 *   pnpm audio:tour                 # dry run: what it would cost, nothing spent
 *   pnpm audio:tour --write         # synthesise the missing files
 *   pnpm audio:tour --write --force # re-record lines that already exist
 *
 * The tour is authored — every line of `lib/bakery/world-tour.ts` is fixed text spoken
 * to every child — so it is recorded once and served as static files, for the same
 * reason the missions are: see `generate-mission-audio.ts`. Files go to
 * `public/audio/tours/<world>/<stopId>.mp3` and the manifest the player imports is
 * refreshed from what is on disk.
 *
 * ## In order, as far as the quota goes
 *
 * The whole tour is longer than what a free month has left once the missions have had
 * theirs. So lines are recorded in script order — the opening is the part every child
 * hears — and the run stops at the first line that no longer fits rather than failing.
 * It does not go on to squeeze in shorter lines from further down: a recorded line with
 * a silent one before it is a tour that stutters, whereas a tour that goes quiet at one
 * point and stays quiet just reads as the end of the narration. Existing files are
 * skipped on the next run, so re-running after the monthly reset records the rest.
 *
 * The key is read from `ELEVENLABS_API_KEY` and never written anywhere.
 */

import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { tourNarrationLines, type TourNarrationManifest } from "../src/lib/bakery/tour-narration";
import { TOUR } from "../src/lib/bakery/world-tour";
import { MODEL, QuotaExceededError, remainingCharacters, synthesise, voiceId } from "./elevenlabs";

/** The one world with an authored tour. */
const TOURS = { "el-forn": TOUR } as const;

const OUT_DIR = resolve(process.cwd(), "public/audio/tours");
const MANIFEST_FILE = resolve(process.cwd(), "src/lib/bakery/tour-narration-manifest.json");

function parseArgs(argv: string[]) {
  return { write: argv.includes("--write"), force: argv.includes("--force"), voiceId: voiceId() };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ELEVENLABS_API_KEY ?? "";

  const plan = Object.entries(TOURS).map(([world, script]) => {
    const lines = tourNarrationLines(script);
    const todo = lines.filter((line) => options.force || !existsSync(join(OUT_DIR, world, `${line.key}.mp3`)));
    return { world, lines, todo };
  });

  const pending = plan.reduce((n, p) => n + p.todo.length, 0);
  const pendingChars = plan.reduce((n, p) => n + p.todo.reduce((m, l) => m + l.text.length, 0), 0);
  const have = plan.reduce((n, p) => n + p.lines.length - p.todo.length, 0);

  console.log(`voice ${options.voiceId}\n`);
  for (const row of plan) {
    const chars = row.todo.reduce((n, l) => n + l.text.length, 0);
    console.log(`  ${row.world.padEnd(12)} ${String(row.todo.length).padStart(2)}/${row.lines.length} lines to record  ${String(chars).padStart(5)} chars`);
  }
  console.log(`\n  already recorded: ${have}`);
  console.log(`  to record:        ${pending} lines, ${pendingChars} characters`);

  if (!pending) {
    console.log("\n  nothing to do.");
    return;
  }

  if (!options.write) {
    console.log("\n  dry run — nothing spent. Re-run with --write to synthesise.");
    return;
  }

  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  // Unlike the missions, a run that cannot afford everything still goes ahead: it records
  // in order until the quota is spent and reports what it had to leave.
  let remaining = await remainingCharacters(apiKey);
  if (remaining !== null) console.log(`  quota remaining:  ${remaining} characters`);

  console.log("\nrecording…");
  let written = 0;
  const skipped: string[] = [];
  // Set the moment a line will not fit — by the estimate above, or because the service
  // refused it: the counter is only an estimate, and once the ledger says no, every later
  // line is left for next month.
  let exhausted = false;
  for (const row of plan) {
    const dir = join(OUT_DIR, row.world);
    mkdirSync(dir, { recursive: true });

    for (const line of row.todo) {
      if (!exhausted && remaining !== null && line.text.length > remaining) exhausted = true;
      if (!exhausted) {
        try {
          const audio = await synthesise(apiKey, options.voiceId, line.text);
          writeFileSync(join(dir, `${line.key}.mp3`), audio);
          written += 1;
          if (remaining !== null) remaining -= line.text.length;
          console.log(`  ${row.world}/${line.key}.mp3  (${line.text.length} chars, ${audio.length} bytes)`);
          continue;
        } catch (error) {
          if (!(error instanceof QuotaExceededError)) throw error;
          exhausted = true;
        }
      }
      skipped.push(`${row.world}/${line.key} (${line.text.length} chars)`);
    }
  }

  // The manifest describes what is on disk, so a stop with no entry simply plays nothing.
  const manifest: TourNarrationManifest = {
    voiceId: options.voiceId,
    model: MODEL,
    tours: Object.fromEntries(
      plan.map(({ world, lines }) => [
        world,
        lines.filter((l) => existsSync(join(OUT_DIR, world, `${l.key}.mp3`))).map((l) => l.key),
      ]).filter(([, keys]) => (keys as string[]).length),
    ),
  };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n  wrote ${written} file(s) and refreshed the manifest.`);
  if (skipped.length) {
    console.log(`  out of quota — ${skipped.length} line(s) left for the next run:`);
    for (const s of skipped) console.log(`    ${s}`);
  }
}

main().catch((error: unknown) => {
  console.error(`\naudio generation failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
