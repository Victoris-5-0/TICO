"""Unit tests for Python World Manifest & Solution Validator (app.ai.guards)."""

import ast
import inspect
import signal

import pytest

import app.ai.guards as guards
from app.ai.graphs.mission_gen import load_world_manifest
from app.ai.guards import (
    GuardResult,
    create_manifest_sandbox,
    extract_manifest_allowed_apis,
    validate_manifest_and_solution,
)


#: Their execution sandbox is SIGALRM-based and fail-closed — no timer, no execution — so
#: every test below that actually runs a solution is Unix-only. See `execution_timeout` in
#: the LEGACY section of `app/ai/guards.py`.
requires_sigalrm = pytest.mark.skipif(
    not hasattr(signal, "SIGALRM"),
    reason="the manifest sandbox needs SIGALRM to guarantee a timeout; it refuses to run without one",
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


@requires_sigalrm
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


@requires_sigalrm
def test_validator_rejects_solution_failing_tests(cairo_manifest, valid_conditionals_draft):
    """Rejects when reference solution fails its own test assertions."""
    # Inverted logic (< 30 instead of > 30) causes tests to fail
    failing_solution = "waiting = station.passengers\nif waiting < 30:\n    gate.open()"
    draft = dict(valid_conditionals_draft, solution_code=failing_solution)

    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("failed" in v for v in result.violations)


@requires_sigalrm
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


@requires_sigalrm
def test_validator_rejects_infinite_loop_with_timeout(cairo_manifest, valid_conditionals_draft):
    """FIX 1 (b): Solution code containing an infinite loop fails with a timeout violation."""
    infinite_loop_solution = "while True:\n    pass"
    draft = dict(valid_conditionals_draft, solution_code=infinite_loop_solution)

    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("exceeded time limit" in v or "infinite loop" in v for v in result.violations)


@requires_sigalrm
def test_validator_rejects_unauthorized_imports_and_builtins(cairo_manifest, valid_conditionals_draft):
    """FIX 1 (a) & FIX 2: Solution code attempting imports or blocked builtins fails with specific message."""
    # Test 1: `import os`
    draft_import = dict(valid_conditionals_draft, solution_code="import os\ngate.open()")
    res_import = validate_manifest_and_solution(draft_import, cairo_manifest)
    assert res_import.passed is False
    # Strict check: must produce 'unauthorized import' violation, no fallback 'or'
    assert any("unauthorized import" in v for v in res_import.violations)

    # Test 2: `__import__('os')` (intercepted by FIX 4 AST dunder guard before execution)
    draft_dunder = dict(valid_conditionals_draft, solution_code="m = __import__('os')\ngate.open()")
    res_dunder = validate_manifest_and_solution(draft_dunder, cairo_manifest)
    assert res_dunder.passed is False
    assert any("restricted dunder identifier" in v for v in res_dunder.violations)

    # Test 3: `open('/etc/passwd')`
    draft_open = dict(valid_conditionals_draft, solution_code="f = open('/tmp/test', 'w')\ngate.open()")
    res_open = validate_manifest_and_solution(draft_open, cairo_manifest)
    assert res_open.passed is False
    assert any("name 'open' is not defined" in v for v in res_open.violations)


def test_validator_fails_closed_when_timeout_cannot_be_guaranteed(
    cairo_manifest, valid_conditionals_draft, monkeypatch
):
    """FIX 1-CONTINUED: Refuses execution when timeout cannot be guaranteed (fail-closed)."""
    import signal

    def fake_signal(sig, handler):
        raise ValueError("signal only works in main thread of the main interpreter")

    monkeypatch.setattr(signal, "signal", fake_signal)

    result = validate_manifest_and_solution(valid_conditionals_draft, cairo_manifest)
    assert result.passed is False
    assert any("could not be safely time-limited" in v for v in result.violations)


@requires_sigalrm
def test_validator_supports_dynamic_manifest_props():
    """FIX 2: create_manifest_sandbox dynamically supports arbitrary world manifests."""
    synthetic_manifest = {
        "world": {"id": "el_forn", "name_en": "The Bakery"},
        "scenes": [{"id": "kitchen", "supports": ["oven"]}],
        "props": [
            {
                "id": "oven",
                "states": ["cold", "hot"],
                "verbs": ["oven.bake(temperature)", "oven.turn_off()"],
                "reads": ["oven.temperature -> int"],
            }
        ],
        "mechanics": [
            {
                "id": "bake_bread",
                "target_concept": "variables",
                "param_schema": {
                    "temp": {"type": "int", "min": 100, "max": 250},
                },
            }
        ],
    }

    draft = {
        "world_id": "el_forn",
        "scene_id": "kitchen",
        "target_concept_id": "variables",
        "params": {"temp": 200},
        "starter_code": "temp = 0\n# TODO: bake at 200",
        "solution_code": "temp = 200\noven.bake(temp)",
        "tests": [
            {
                "name": "oven heated correctly",
                "setup": "",
                "call": "oven.temperature == 200",
                "expected": "True",
            }
        ],
    }

    result = validate_manifest_and_solution(draft, synthetic_manifest)
    assert result.passed is True, f"Validation failed unexpectedly: {result.violations}"


def test_validator_rejects_undeclared_reads_and_verbs(cairo_manifest, valid_conditionals_draft):
    """FIX 3: Solution code accessing undeclared attributes/verbs is rejected as an illegal API call."""
    draft = dict(
        valid_conditionals_draft,
        solution_code="waiting = station.passengers\nif waiting > 30:\n    gate.secret_bypass()",
    )
    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("illegal API call: 'gate.secret_bypass'" in v for v in result.violations)


def test_validator_rejects_dunder_sandbox_escape_without_executing(
    cairo_manifest, valid_conditionals_draft, monkeypatch
):
    """FIX 4: Gadget chains referencing dunders are rejected and never reach exec()."""
    exploit_code = "classes = ().__class__.__bases__[0].__subclasses__()"
    draft = dict(valid_conditionals_draft, solution_code=exploit_code)

    # Spy on execution_timeout to assert exec() was never attempted
    import app.ai.guards as guards

    original_timeout = guards.execution_timeout
    timeout_entered = []

    def spy_timeout(*args, **kwargs):
        timeout_entered.append(True)
        return original_timeout(*args, **kwargs)

    monkeypatch.setattr(guards, "execution_timeout", spy_timeout)

    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("restricted dunder identifier" in v for v in result.violations)
    assert len(timeout_entered) == 0, "Security failure: exec/eval was reached for dunder exploit!"


def test_validator_rejects_globals_dunder_access(cairo_manifest, valid_conditionals_draft):
    """FIX 4: Code accessing __globals__ is rejected as restricted dunder identifier."""
    draft = dict(
        valid_conditionals_draft,
        solution_code="waiting = station.passengers\ny = waiting.__globals__",
    )
    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is False
    assert any("restricted dunder identifier" in v for v in result.violations)


@requires_sigalrm
def test_validator_permits_curriculum_code_without_dunders(cairo_manifest, valid_conditionals_draft):
    """FIX 4: Legitimate curriculum code (variables, if/else, loops, functions) is unaffected."""
    legit_code = (
        "waiting = station.passengers\n"
        "total = 0\n"
        "for i in range(waiting):\n"
        "    total = total + 1\n"
        "if total > 30:\n"
        "    gate.open()"
    )
    draft = dict(valid_conditionals_draft, solution_code=legit_code)
    result = validate_manifest_and_solution(draft, cairo_manifest)
    assert result.passed is True, f"Legitimate code unexpectedly failed: {result.violations}"


