import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { bakeryScene, sceneAssetUrls } from "./scene-manifest";
import { CUSTOMER_IDS } from "./simulation";

test("all runtime layers and actor atlases exist as WebPs, below a 1.5 MB scene budget", () => {
  const urls = sceneAssetUrls();
  assert.equal(new Set(urls).size, urls.length);
  let bytes = 0;
  for (const url of urls) {
    const file = join(process.cwd(), "public", url);
    const header = readFileSync(file).subarray(0, 12);
    assert.equal(header.subarray(8, 12).toString(), "WEBP", url);
    bytes += statSync(file).size;
  }
  assert.ok(bytes < 1_500_000, `Scene is ${bytes} bytes`);
});
test("eight unique customer atlases, independent baker/coordinator, and a fitting queue", () => {
  const actors = CUSTOMER_IDS.map((id) => bakeryScene.actors[id]);
  assert.equal(new Set(actors.map((actor) => actor.src)).size, 8);
  assert.ok(actors.every((actor) => actor.columns * actor.rows === 6));
  assert.equal(bakeryScene.actors.hassan.columns * bakeryScene.actors.hassan.rows, 16);
  assert.equal(bakeryScene.actors.salma.columns * bakeryScene.actors.salma.rows, 2);
  assert.ok(bakeryScene.queue.first.x + bakeryScene.queue.spacing * 7 + 70 < bakeryScene.width);
  for (const actor of Object.values(bakeryScene.actors)) {
    for (const hand of actor.hands) {
      assert.ok(Math.abs(hand.x) < 160);
      assert.ok(hand.y < 0 && hand.y > -300);
    }
  }
});
