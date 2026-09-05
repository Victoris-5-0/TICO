"""Unit tests for Python World Manifest & Solution Validator (app.ai.guards)."""

import ast
import inspect
import pytest

import app.ai.guards as guards
from app.ai.graphs.mission_gen import load_world_manifest
from app.ai.guards import (
    GuardResult,
    create_manifest_sandbox,
    extract_manifest_allowed_apis,
    validate_manifest_and_solution,
)


@pytest.fixture
def cairo_manifest():
    return load_world_manifest("cairo_metro")


@pytest.fixture
def valid_conditionals_draft():
    return {
        "world_id": "cairo_metro",
        "scene_id": "platform_day",
        "target_concept_id": "conditionals",
        "brief": "افتح البوابة لما عدد الركاب يزيد عن 30.",
        "params": {
            "reading": "station.passengers",
            "threshold": 30,
            "comparison": ">",
        },
        "starter_code": "waiting = station.passengers\n# TODO: open gate if condition met",
        "solution_code": "waiting = station.passengers\nif waiting > 30:\n    gate.open()",
        "tests": [
            {
                "name": "gate opens above threshold",
                "setup": "station.passengers = 35",
                "call": "gate.state",
                "expected": "open",
            },
            {
                "name": "gate stays closed below threshold",
                "setup": "station.passengers = 25",
                "call": "gate.state",
                "expected": "closed",
            },
        ],
    }


def test_validator_valid_mission_passes(cairo_manifest, valid_conditionals_draft):
    """Clean, correct mission draft passes all validation checks."""
    result = validate_manifest_and_solution(valid_conditionals_draft, cairo_manifest)
    assert result.passed is True
    assert len(result.violations) == 0


def test_validator_rejects_unknown_world(cairo_manifest, valid_conditionals_draft):
    """Rejects mission referencing a world ID that does not match the manifest."""
    draft = dict(valid_conditionals_draft, world_id="alexandria_tram")
    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("world_id mismatch" in v for v in result.violations)


def test_validator_rejects_unknown_scene(cairo_manifest, valid_conditionals_draft):
    """Rejects mission referencing an invented scene ID not in the manifest."""
    draft = dict(valid_conditionals_draft, scene_id="space_station")
    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("unknown scene_id" in v for v in result.violations)


def test_validator_rejects_unsupported_concept(cairo_manifest, valid_conditionals_draft):
    """Rejects mission with concept not supported in manifest mechanics."""
    draft = dict(valid_conditionals_draft, target_concept_id="recursion")
    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("not supported in manifest mechanics" in v for v in result.violations)


def test_validator_rejects_invented_verbs(cairo_manifest, valid_conditionals_draft):
    """Rejects code using invented verbs on props not declared in the manifest."""
    # Invented verb 'gate.unlock()' instead of legal 'gate.open()'
    draft_unlock = dict(
        valid_conditionals_draft,
        solution_code="gate.unlock()",
    )
    res_unlock = validate_manifest_and_solution(draft_unlock, cairo_manifest)
    assert res_unlock.passed is False
    assert any("illegal API call: 'gate.unlock'" in v for v in res_unlock.violations)

    # Invented verb 'machine.dispense_ticket()'
    draft_dispense = dict(
        valid_conditionals_draft,
        solution_code="machine.dispense_ticket()",
    )
    res_dispense = validate_manifest_and_solution(draft_dispense, cairo_manifest)
    assert res_dispense.passed is False
    assert any("illegal API call: 'machine.dispense_ticket'" in v for v in res_dispense.violations)


def test_validator_rejects_solution_failing_tests(cairo_manifest, valid_conditionals_draft):
    """Rejects when reference solution fails its own test assertions."""
    # Inverted logic (< 30 instead of > 30) causes tests to fail
    failing_solution = "waiting = station.passengers\nif waiting < 30:\n    gate.open()"
    draft = dict(valid_conditionals_draft, solution_code=failing_solution)

    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("failed" in v for v in result.violations)


def test_validator_rejects_solution_with_runtime_error(cairo_manifest, valid_conditionals_draft):
    """Rejects when solution raises a runtime exception during test execution."""
    broken_solution = "waiting = station.passengers / 0"
    draft = dict(valid_conditionals_draft, solution_code=broken_solution)

    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("runtime exception" in v for v in result.violations)


def test_validator_rejects_premature_answer_leak(cairo_manifest, valid_conditionals_draft):
    """Rejects when starter code is identical to solution code."""
    sol = valid_conditionals_draft["solution_code"]
    draft = dict(valid_conditionals_draft, starter_code=sol)

    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("premature answer leak" in v for v in result.violations)


def test_validator_enforces_param_schema_bounds(cairo_manifest, valid_conditionals_draft):
    """Rejects parameter values exceeding bounds defined in mechanic param_schema."""
    # Threshold in cairo_metro conditional_gate mechanic has min: 3, max: 50
    # Test value exceeding max (e.g. 100)
    draft_high = dict(
        valid_conditionals_draft,
        params={"reading": "station.passengers", "threshold": 100, "comparison": ">"},
    )
    res_high = validate_manifest_and_solution(draft_high, cairo_manifest)
    assert res_high.passed is False
    assert any("exceeds maximum" in v for v in res_high.violations)

    # Test value below min (e.g. 1)
    draft_low = dict(
        valid_conditionals_draft,
        params={"reading": "station.passengers", "threshold": 1, "comparison": ">"},
    )
    res_low = validate_manifest_and_solution(draft_low, cairo_manifest)
    assert res_low.passed is False
    assert any("below minimum" in v for v in res_low.violations)

    # Test invalid enum comparison (e.g. '!=')
    draft_enum = dict(
        valid_conditionals_draft,
        params={"reading": "station.passengers", "threshold": 30, "comparison": "!="},
    )
    res_enum = validate_manifest_and_solution(draft_enum, cairo_manifest)
    assert res_enum.passed is False
    assert any("not in allowed options" in v for v in res_enum.violations)


def test_validator_extract_manifest_allowed_apis(cairo_manifest):
    """Verify API extractor discovers all declared verbs and reads from manifest props."""
    apis = extract_manifest_allowed_apis(cairo_manifest)
    assert ("gate", "open") in apis
    assert ("gate", "close") in apis
    assert ("station", "passengers") in apis
    assert ("machine", "set_price") in apis
    assert ("board", "show") in apis
    assert ("train", "delay_minutes") in apis
    assert ("train", "is_arriving") in apis


def test_validator_pure_python_zero_io():
    """Verify validator in guards.py contains zero I/O and no framework imports."""
    source = inspect.getsource(guards)
    tree = ast.parse(source)

    forbidden = (
        "langchain",
        "sqlalchemy",
        "httpx",
        "requests",
        "psycopg",
        "urllib",
        "aiohttp",
        "fastapi",
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                for f in forbidden:
                    assert not alias.name.startswith(f), f"Forbidden import: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                for f in forbidden:
                    assert not node.module.startswith(f), f"Forbidden import: {node.module}"
