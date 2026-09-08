"""Load and cache the world manifests.

One place reads `content/worlds/*.yaml`. Everything else asks this module.

Loading is cached because manifests never change at runtime — they change when someone
edits a file and redeploys. Re-parsing four YAML files on every mission request would be
waste on the path a child is waiting on.

`load()` raises on a malformed manifest, and `app.main` calls it at import time, so a bad
edit fails the deploy rather than the first request.
"""

from __future__ import annotations

import logging
import pathlib
from functools import lru_cache

import yaml

from app.manifests.models import Mechanic, World

log = logging.getLogger(__name__)

WORLDS_DIR = pathlib.Path(__file__).resolve().parents[2] / "content" / "worlds"


class ManifestError(RuntimeError):
    """A manifest is missing, malformed, or internally inconsistent."""


@lru_cache(maxsize=1)
def load() -> dict[str, World]:
    """Every world, keyed by `world.id`. Cached for the life of the process.

    Files starting with `_` are skipped, which is how `_TEMPLATE.yaml` stays in the
    directory as documentation without pretending to be a playable world.
    """
    if not WORLDS_DIR.is_dir():
        raise ManifestError(f"no manifest directory at {WORLDS_DIR}")

    worlds: dict[str, World] = {}
    for path in sorted(WORLDS_DIR.glob("*.yaml")):
        if path.name.startswith("_"):
            continue
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            raise ManifestError(f"{path.name} is not valid YAML: {exc}") from exc

        try:
            world = World.model_validate(raw)
        except Exception as exc:  # noqa: BLE001 - re-raised with the filename attached
            raise ManifestError(f"{path.name}: {exc}") from exc

        if world.id in worlds:
            raise ManifestError(f"two manifests both declare world id '{world.id}'")
        worlds[world.id] = world

    if not worlds:
        raise ManifestError(f"no manifests found in {WORLDS_DIR}")

    # Two worlds pointing at one track would make `for_track` ambiguous, and the wrong
    # world's vocabulary would leak into a mission.
    slugs: dict[str, str] = {}
    for w in worlds.values():
        if w.track_slug in slugs:
            raise ManifestError(
                f"worlds '{slugs[w.track_slug]}' and '{w.id}' both claim "
                f"track_slug '{w.track_slug}'"
            )
        slugs[w.track_slug] = w.id

    log.info(
        "loaded %d world manifests: %s",
        len(worlds),
        ", ".join(f"{w.id}({len(w.mechanics)} mechanics)" for w in worlds.values()),
    )
    return worlds


# --------------------------------------------------------------------------- lookups


def get(world_id: str) -> World:
    worlds = load()
    if world_id not in worlds:
        raise ManifestError(f"no manifest for world '{world_id}' (have: {sorted(worlds)})")
    return worlds[world_id]


def for_track(track_slug: str) -> World:
    """The manifest for a track slug — how a database row finds its world."""
    for world in load().values():
        if world.track_slug == track_slug:
            return world
    raise ManifestError(
        f"no manifest for track '{track_slug}' "
        f"(have: {sorted(w.track_slug for w in load().values())})"
    )


def all_worlds() -> list[World]:
    """Every world in roadmap order."""
    return sorted(load().values(), key=lambda w: w.world.order)


def find_mechanic(world_id: str, mechanic_id: str) -> Mechanic:
    world = get(world_id)
    mechanic = world.mechanic(mechanic_id)
    if mechanic is None:
        raise ManifestError(
            f"world '{world_id}' has no mechanic '{mechanic_id}' "
            f"(have: {[m.id for m in world.mechanics]})"
        )
    return mechanic


def mechanics_teaching(concept_slug: str) -> list[tuple[World, Mechanic]]:
    """Every way to teach a concept, across all worlds, easiest first.

    Used when the planner knows what a student needs next but not where to set it.
    """
    found = [
        (world, mechanic)
        for world in all_worlds()
        for mechanic in world.mechanics_for(concept_slug)
    ]
    return sorted(found, key=lambda pair: pair[1].difficulty_band)


def reload() -> dict[str, World]:
    """Drop the cache and re-read. For tests and for a manifest edit in dev."""
    load.cache_clear()
    return load()
