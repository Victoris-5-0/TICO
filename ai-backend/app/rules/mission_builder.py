"""Compose a concrete mission from a mechanic and a scaffold plan.

Pure, deterministic given a seed, and does no I/O. That is what makes generation testable
without a database, an API key, or a network — and it is why the model is optional here
rather than load-bearing.

## What "generation" actually is

The interesting claim in the design is that the AI fills in variations and never invents
mechanics. This module is where that stops being a claim:

    mechanic (authored)  +  params (chosen from bounds)  ->  a real mission

The model's whole job is prose — the Arabic brief, the title, an NPC line. Take it away
and you still get a correct, playable, solvable mission with passing tests. That is the
right dependency direction: a model outage should cost you variety, not the product.

## Where the expected outputs come from

They are not written, and they are certainly not asked of a model. The composer renders
the reference solution, runs it against the sample inputs, and records what came back.
A test built that way cannot disagree with its own solution.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from app.ai import sandbox
from app.manifests.models import Mechanic, World

#: Composer placeholders are `<<name>>`, NOT `{name}`.
#:
#: Solution templates contain real Python f-strings — `f"مخبز {station_name} جاهز"` — and
#: `{name}` substitution would eat them. A delimiter Python has no opinion about keeps the
#: two syntaxes independent.
_SAMPLE_PATTERN = re.compile(r"<<(\w+)>>")


@dataclass
class ComposedMission:
    """Everything a mission needs except the prose."""

    world_id: str
    mechanic_id: str
    scene_id: str
    target_concept: str
    carried_concepts: list[str]
    signature: str
    starter_code: str
    solution_code: str
    remix_solution_code: str = ""
    #: Egyptian Arabic, from the prose layer. Empty when the model was unavailable —
    #: the mission is still complete and solvable without it.
    brief_ar: str = ""
    #: [(call expression, expected repr)] — derived by running `solution_code`.
    tests: list[tuple[str, str]] = field(default_factory=list)
    remix_tests: list[tuple[str, str]] = field(default_factory=list)
    params: dict = field(default_factory=dict)
    scaffold: dict[str, str] = field(default_factory=dict)
    difficulty_band: int = 5
    #: Filled by validation, never by the composer asserting its own work.
    validated: bool = False
    problems: list[str] = field(default_factory=list)


class CompositionError(RuntimeError):
    """The mechanic could not be turned into a mission."""


# --------------------------------------------------------------------------- params


def choose_params(mechanic: Mechanic, rng: random.Random) -> dict:
    """Pick one concrete value for every entry in `param_schema`.

    Three kinds, and nothing else is allowed — a manifest cannot smuggle in a free-text
    field for the model to fill, which is precisely the point.
    """
    chosen: dict = {}
    for name, spec in (mechanic.param_schema or {}).items():
        kind = spec.get("type")
        if kind == "const":
            chosen[name] = spec["value"]
        elif kind == "enum":
            options = spec.get("options") or []
            if not options:
                raise CompositionError(f"{mechanic.id}: param '{name}' is an enum with no options")
            chosen[name] = rng.choice(options)
        elif kind == "int":
            lo, hi = spec.get("min", 1), spec.get("max", 10)
            chosen[name] = rng.randint(lo, hi)
        else:
            raise CompositionError(
                f"{mechanic.id}: param '{name}' has unsupported type '{kind}' "
                "(expected const, enum or int)"
            )
    return chosen


def sample_values(mechanic: Mechanic, world: World, params: dict, rng: random.Random) -> dict:
    """Concrete arguments for the test calls.

    Drawn from the world's vocabulary where possible, so a bakery test asks about 240
    loaves rather than 7,000,000. `plausible_range` exists for exactly this.
    """
    ints = [
        v for v in world.vocabulary.values()
        if v.type == "int" and v.plausible_range
    ]
    default_lo, default_hi = (1, 50)
    if ints:
        default_lo = min(v.plausible_range[0] for v in ints)
        default_hi = max(v.plausible_range[1] for v in ints)

    strings = [v for v in world.vocabulary.values() if v.type == "str" and v.options]
    words = strings[0].options if strings else ["القاهرة"]

    def an_int(lo: int = default_lo, hi: int = default_hi) -> int:
        return rng.randint(max(lo, 1), max(hi, 2))

    threshold = params.get("threshold", an_int(5, 40))
    numbers = sorted(an_int(1, 60) for _ in range(rng.randint(3, 5)))

    return {
        "sample_a": an_int(2, 30),
        "sample_b": an_int(2, 30),
        "sample_a2": an_int(2, 30),
        "sample_b2": an_int(2, 30),
        "sample_number": an_int(),
        "single_number": an_int(),
        "threshold": threshold,
        "limit": threshold,
        "above": threshold + rng.randint(1, 10),
        "below": max(0, threshold - rng.randint(1, 5)),
        "night_sample": rng.choice([23, 0, 2, 3]),
        "day_sample": rng.choice([9, 12, 15, 18]),
        "sample_numbers": ", ".join(str(n) for n in numbers),
        "sample_list": ", ".join(str(n) for n in numbers),
        "sample_destination": rng.choice(words),
        "sample_place2": rng.choice(words),
        "sample_queue": ", ".join(
            f'"{rng.choice(words)}"' for _ in range(rng.randint(3, 6))
        ),
    }


# ------------------------------------------------------------------------ rendering


def _substitute(template: str, values: dict) -> str:
    """Fill `{placeholders}`, leaving unknown ones alone rather than crashing.

    Leaving them is deliberate: an unfilled placeholder shows up in validation as a
    visible `{like_this}` in the mission, which is far easier to diagnose than a
    KeyError three layers down.
    """
    def replace(m: re.Match) -> str:
        key = m.group(1)
        return str(values[key]) if key in values else m.group(0)

    return _SAMPLE_PATTERN.sub(replace, template)


def compose(
    world: World,
    mechanic: Mechanic,
    *,
    scaffold: dict[str, str] | None = None,
    seed: int | None = None,
    brief_ar: str | None = None,
) -> ComposedMission:
    """Turn a mechanic into a concrete, runnable mission.

    `scaffold` maps a carried concept to NONE / PARTIAL / FULL. A concept the student is
    already strong on gets pre-filled, so a loops mission is about loops rather than about
    remembering how to open a variable.

    `seed` makes this reproducible — the same seed gives the same mission, which is what
    lets a test assert on generated output at all.
    """
    rng = random.Random(seed)
    scaffold = scaffold or {}

    params = choose_params(mechanic, rng)
    samples = sample_values(mechanic, world, params, rng)

    scene_id = rng.choice(mechanic.scenes)

    # One scaffold line per carried concept, in the manifest's own words.
    scaffold_lines = [
        world.scaffold_for(concept, level)
        for concept, level in scaffold.items()
        if world.scaffold_for(concept, level)
    ]
    values = {
        **samples,
        **params,
        "carried_scaffold": "\n    ".join(scaffold_lines),
        # The prose layer supplies this. Empty is a valid mission — the code is
        # complete and solvable without it, which is the point of keeping the model
        # optional.
        "brief_ar": (brief_ar or "").strip(),
    }

    solution_code = _substitute(mechanic.solution_template, values).strip()
    remix_solution_code = _substitute(mechanic.remix_solution_template or "", values).strip()
    starter_code = _substitute(mechanic.starter_template, values).strip()

    # With no brief, the template leaves a bare `#` behind. A dangling empty comment in
    # the first thing a child reads looks like a bug, so drop the line entirely.
    starter_code = "\n".join(
        line for line in starter_code.splitlines() if line.strip() != "#"
    )
    signature = _substitute(mechanic.signature, values)

    # Derive the expected outputs by running the solution.
    call_exprs = [_substitute(t.input, values) for t in mechanic.tests]
    run = sandbox.run(solution_code, call_exprs)
    remix_call_exprs = [_substitute(t.input, values) for t in mechanic.remix_tests]
    remix_run = sandbox.run(remix_solution_code, remix_call_exprs) if remix_solution_code else None

    mission = ComposedMission(
        world_id=world.id,
        mechanic_id=mechanic.id,
        scene_id=scene_id,
        brief_ar=(brief_ar or "").strip(),
        target_concept=mechanic.target_concept,
        carried_concepts=list(mechanic.carried_concepts),
        signature=signature,
        starter_code=starter_code,
        solution_code=solution_code,
        remix_solution_code=remix_solution_code,
        params=params,
        scaffold=dict(scaffold),
        difficulty_band=mechanic.difficulty_band,
    )

    if not run.ok:
        mission.problems.append(f"the reference solution did not run: {run.error}")
        return mission

    for call in run.results:
        if not call.ok:
            mission.problems.append(f"{call.expression} raised {call.error}")
            continue
        mission.tests.append((call.expression, call.value or "None"))

    if remix_run is not None:
        if not remix_run.ok:
            mission.problems.append(f"the remix reference solution did not run: {remix_run.error}")
        else:
            for call in remix_run.results:
                if not call.ok:
                    mission.problems.append(f"remix {call.expression} raised {call.error}")
                    continue
                mission.remix_tests.append((call.expression, call.value or "None"))

    return mission
