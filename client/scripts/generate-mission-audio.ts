/**
 * Pre-record the spoken lines of the pinned missions.
 *
 *   pnpm audio:missions                 # dry run: what it would cost, nothing spent
 *   pnpm audio:missions --write         # synthesise the missing files
 *   pnpm audio:missions --write --all   # include questions, hints and prompts
 *   pnpm audio:missions --write --force # re-record lines that already exist
 *
 * ## Why pre-recorded
 *
 * ElevenLabs bills per character. Synthesising at play time would charge for every line
 * every child hears, forever, for text that never changes. These missions are pinned —
 * every student gets the same one for a lesson — so each line is spoken once, saved to
 * `public/audio/missions/<missionId>/<key>.mp3`, and served as a static file after that.
 *
 * ## Spending is opt-in
 *
 * The default is a dry run that prints the exact character count, because the free tier
 * is 10,000 characters a month and a careless re-run can eat it. Existing files are
 * skipped unless `--force`, so re-running after adding one mission costs one mission.
 *
 * The key is read from `ELEVENLABS_API_KEY` and never written anywhere.
 */

import "dotenv/config";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { PhasedMissionOut } from "../src/lib/ai/types";
import { narrationLines, type NarrationManifest } from "../src/lib/mission/narration";

/** Sarah — a premade voice, usable on the free tier. Library voices are not. */
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";
const MODEL = "eleven_multilingual_v2";
const API = "https://api.elevenlabs.io/v1";

const PREBUILT_DIR = resolve(process.cwd(), "../ai-backend/content/prebuilt");
const OUT_DIR = resolve(process.cwd(), "public/audio/missions");
/*
 * The manifest is imported by the player rather than read from disk at runtime.
 *
 * It used to live beside the audio in `public/` and be `readFileSync`-ed by the page. That
 * works in dev and on a plain node server, and silently returns nothing on any deploy
 * where `public/` is served by a CDN and not bundled with the server code — so every
 * mission would render with no narration controls and nobody would see an error.
 * Importing it makes it part of the build.
 */
const MANIFEST_FILE = resolve(process.cwd(), "src/lib/mission/narration-manifest.json");

type Options = { write: boolean; force: boolean; scope: "core" | "all"; voiceId: string };

function parseArgs(argv: string[]): Options {
  return {
    write: argv.includes("--write"),
    force: argv.includes("--force"),
    scope: argv.includes("--all") ? "all" : "core",
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE,
  };
}

function readMissions(): Array<{ file: string; mission: PhasedMissionOut }> {
  return readdirSync(PREBUILT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(PREBUILT_DIR, file), "utf8")) as { data?: PhasedMissionOut };
      return { file, mission: (raw.data ?? raw) as PhasedMissionOut };
    });
}

/** What the account has left, so the run can stop before it fails halfway. */
async function remainingCharacters(key: string): Promise<number | null> {
  try {
    const res = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": key } });
    if (!res.ok) return null;
    const body = (await res.json()) as { character_count?: number; character_limit?: number };
    if (typeof body.character_count !== "number" || typeof body.character_limit !== "number") return null;
    return body.character_limit - body.character_count;
  } catch {
    return null;
  }
}

async function synthesise(key: string, voiceId: string, text: string): Promise<Buffer> {
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // The one failure worth naming: a library voice on a free key looks like a bad
    // request until you read the body.
    if (res.status === 402) {
      throw new Error(
        `${res.status}: this voice needs a paid plan. Free keys can only use premade voices — ${detail.slice(0, 200)}`,
      );
    }
    throw new Error(`${res.status}: ${detail.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ELEVENLABS_API_KEY ?? "";

  const missions = readMissions();
  if (!missions.length) throw new Error(`no prebuilt missions in ${PREBUILT_DIR}`);

  // Plan first, always — including on a real run, so the totals are printed before a
  // single character is spent.
  let pending = 0;
  let pendingChars = 0;
  let have = 0;
  const plan = missions.map(({ file, mission }) => {
    const lines = narrationLines(mission, options.scope);
    const todo = lines.filter((line) => {
      const exists = existsSync(join(OUT_DIR, mission.id, `${line.key}.mp3`));
      if (exists && !options.force) { have += 1; return false; }
      return true;
    });
    pending += todo.length;
    pendingChars += todo.reduce((n, l) => n + l.text.length, 0);
    return { file, mission, lines, todo };
  });

  console.log(`${missions.length} prebuilt missions · scope "${options.scope}" · voice ${options.voiceId}\n`);
  for (const row of plan) {
    const chars = row.todo.reduce((n, l) => n + l.text.length, 0);
    console.log(
      `  ${row.file.slice(0, 26).padEnd(28)} ${String(row.todo.length).padStart(2)}/${row.lines.length} lines to record  ${String(chars).padStart(5)} chars`,
    );
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

  const remaining = await remainingCharacters(apiKey);
  if (remaining !== null) {
    console.log(`  quota remaining:  ${remaining} characters`);
    if (pendingChars > remaining) {
      throw new Error(
        `this run needs ${pendingChars} characters and only ${remaining} remain. ` +
          "Narrow it with the default --core scope, or wait for the monthly reset.",
      );
    }
  }

  console.log("\nrecording…");
  let written = 0;
  for (const row of plan) {
    if (!row.todo.length) continue;
    const dir = join(OUT_DIR, row.mission.id);
    mkdirSync(dir, { recursive: true });

    for (const line of row.todo) {
      const audio = await synthesise(apiKey, options.voiceId, line.text);
      writeFileSync(join(dir, `${line.key}.mp3`), audio);
      written += 1;
      console.log(`  ${row.mission.id}/${line.key}.mp3  (${line.text.length} chars, ${audio.length} bytes)`);
    }
  }

  // The manifest is what the player reads; a line with no entry simply has no audio and
  // the UI shows no play control for it.
  const manifest: NarrationManifest = {
    voiceId: options.voiceId,
    model: MODEL,
    missions: Object.fromEntries(
      plan.map(({ mission, lines }) => [
        mission.id,
        lines.filter((l) => existsSync(join(OUT_DIR, mission.id, `${l.key}.mp3`))).map((l) => l.key),
      ]).filter(([, keys]) => (keys as string[]).length),
    ),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`\n  wrote ${written} file(s) and refreshed the manifest.`);
}

main().catch((error: unknown) => {
  console.error(`\naudio generation failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
