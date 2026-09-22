"""Generate one isolated traffic-loop review sample without publishing a mission row."""

import json
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import manifests  # noqa: E402
from app.ai.chains import mission_gen  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stop", type=int, choices=(1, 2), default=2)
    args = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    root = backend.parent
    outcome = mission_gen.generate(
        manifests.get("isharet_cairo"),
        target_concept="loops",
        carried_concepts=["conditionals", "variables"],
        scene_id="traffic_establishing",
        scaffold={"conditionals": "FULL", "variables": "PARTIAL"},
        repetition=args.stop,
        already_taught=[],
        speaker="officer",
    )
    if outcome.mission is None or not outcome.mission.validated:
        raise RuntimeError("the review mission did not pass validation")
    sample = {
        "meta": {
            "promptVersion": mission_gen.prompt.PROMPT_VERSION,
            "attempts": outcome.attempts,
            "latencyMs": outcome.latency_ms,
            "model": outcome.model_name,
            "reviewOnly": True,
        },
        "data": outcome.mission.model_dump(by_alias=True, mode="json"),
    }
    content = json.dumps(sample, ensure_ascii=False, indent=2) + "\n"
    artifact_name = "isharet-cairo-loops-v6.json" if args.stop == 2 else "isharet-cairo-cars-v6.json"
    artifact = root / "artifacts" / "generated-missions" / artifact_name
    preview = root / "client" / "src" / "lib" / "traffic" / "missions" / "generated-loop-preview.json"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text(content, encoding="utf-8")
    if args.stop == 2:
        preview.write_text(content, encoding="utf-8")
    print(f"review sample: {artifact}")
    print(f"validated after {outcome.attempts} attempt(s) with {outcome.model_name}")


if __name__ == "__main__":
    main()
