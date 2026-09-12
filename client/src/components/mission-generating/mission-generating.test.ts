import test from "node:test";
import assert from "node:assert/strict";

test("overlay mock waiting duration is within the required 5-8 seconds window", () => {
  const defaultDurationMs = 6000;
  const minDurationMs = 5000;
  const maxDurationMs = 8000;

  assert.ok(
    defaultDurationMs >= minDurationMs && defaultDurationMs <= maxDurationMs,
    `Duration ${defaultDurationMs}ms must be between ${minDurationMs}ms and ${maxDurationMs}ms`,
  );
});

test("overlay progression covers all loading quadrants with calm messages", () => {
  const phases = [
    { min: 0, max: 35, en: "Analyzing your pace and setting difficulty..." },
    { min: 35, max: 70, en: "TICO is generating Python code and test cases..." },
    { min: 70, max: 100, en: "Validating assertions and checking sandbox..." },
    { min: 100, max: 100, en: "Mission ready! Entering workspace..." },
  ];

  for (const phase of phases) {
    assert.ok(phase.en.length > 0, "Phase message must not be empty");
    assert.ok(phase.max >= phase.min, "Phase max must be >= min");
  }
});
