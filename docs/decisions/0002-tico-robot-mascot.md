# ADR 0002: TICO uses the supplied robot mascot

- Status: Accepted
- Date: 2026-09-05
- Supersedes: the hoopoe mascot references in ADR 0001 and early design documents

## Context

The product owner supplied production character turnaround sheets for an orange robot in neutral, thinking, celebrating, and angry/determined emotional states. These assets match the approved UI reference and are ready to anchor consistent client implementation.

## Decision

TICO is the friendly orange robot shown in `client/assets/source/tico/`. The supplied sheets are the canonical identity reference. Processed transparent runtime sprites live in `client/public/assets/characters/tico/`.

New TICO poses must preserve the robot's asymmetric antennae, floating gold antenna light, face, proportions, orange body, dark outline, rounded limbs, and gold joint accents. The angry sheet is exposed to learners as **determined** and is never used to shame or threaten a learner after an error.

TICO remains the only conversational companion persona. This visual change does not alter the Egyptian worlds, curriculum, safety boundaries, or AI behavior.

## Consequences

- Do not generate or ship the retired hoopoe mascot.
- World scenes and human characters should share the robot sheets' clean, rounded 2D line language while keeping richer environmental texture.
- Asset generation uses a canonical source sheet as a style/identity reference where TICO appears.
- Existing copy that calls TICO a bird or hoopoe must be updated before release.
