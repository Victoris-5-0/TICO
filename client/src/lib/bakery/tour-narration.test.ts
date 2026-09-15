import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import manifest from "./tour-narration-manifest.json";
import { tourNarrationDir, tourNarrationLines } from "./tour-narration";
import { TOUR } from "./world-tour";

/**
 * The recordings are static files keyed by stop id, and the manifest is what the player
 * believes exists. Three things can drift apart without anything failing at runtime: a
 * stop renamed in the script (its recording is orphaned and it plays nothing), a manifest
 * entry whose file was never committed (the player asks for a 404 and moves on), and a
 * manifest naming a stop that no longer exists. These catch all three.
 */

const WORLD = "el-forn";
const PUBLIC = join(process.cwd(), "public");

test("the tour's lines are keyed by stop id, in order, Arabic only", () => {
  const lines = tourNarrationLines(TOUR);
  assert.deepEqual(lines.map((l) => l.key), TOUR.map((s) => s.id));
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length, "keys must be unique");
  for (const [i, line] of lines.entries()) {
    assert.equal(line.text, TOUR[i].ar.trim());
    assert.equal(line.speaker, TOUR[i].speaker);
  }
});

test("every recorded stop exists in the script and on disk", () => {
  const keys = manifest.tours[WORLD];
  assert.ok(keys.length > 0, "the tour has no recordings at all");
  const ids = new Set(TOUR.map((s) => s.id));
  for (const key of keys) {
    assert.ok(ids.has(key), `manifest names a stop the tour does not have: ${key}`);
    const file = join(PUBLIC, tourNarrationDir(WORLD), `${key}.mp3`);
    assert.ok(existsSync(file), `manifest lists ${key} but ${file} is missing`);
  }
});

test("recordings are the opening first, not a scattering", () => {
  // The quota records in script order and stops. A gap before the last recorded stop
  // would mean a line in the middle of the tour plays nothing while its neighbours speak.
  const keys = manifest.tours[WORLD];
  const positions = keys.map((key) => TOUR.findIndex((s) => s.id === key));
  assert.deepEqual(positions, positions.map((_, i) => i), "recordings must be a prefix of the tour");
});
