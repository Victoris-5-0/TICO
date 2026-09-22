import assert from "node:assert/strict";
import test from "node:test";

import { arrivalOffset, trafficQueue } from "./vehicle-motion";

test("each approaching car begins fully beyond the scene edge", () => {
  for (const car of trafficQueue) {
    const { x, y } = arrivalOffset(car);
    const startingLeft = car.left + car.width * x / 100;
    assert.ok(startingLeft > 100, `${car.id} should enter from outside the frame`);
    assert.ok(y > 0, `${car.id} should follow the road diagonal`);
  }
});

test("the larger queue occupies two separate painted road lanes", () => {
  assert.deepEqual(trafficQueue.slice(0, 3).map((car) => car.lane), [0, 1, 0]);
  for (const lane of [0, 1]) {
    const vehicles = trafficQueue.filter((car) => car.lane === lane);
    for (let index = 1; index < vehicles.length; index++) {
      const ahead = vehicles[index - 1];
      const behind = vehicles[index];
      assert.ok(behind.left > ahead.left && behind.top > ahead.top);
      assert.ok(behind.left >= ahead.left + ahead.width - 1, `${behind.id} must not overlap ${ahead.id}`);
    }
  }
  assert.ok(trafficQueue.every((car) => car.width >= 8));
});
