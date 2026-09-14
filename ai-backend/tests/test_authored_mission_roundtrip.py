"""Prepared mission selection must not discard the client's authored interactions."""
import json
import ast
from pathlib import Path

import pytest

from app.schemas.phases import PhasedMissionOut

PREBUILT = Path(__file__).resolve().parents[1] / "content" / "prebuilt"
FILES = sorted(p for p in PREBUILT.glob("*.json") if p.name.split("-")[:2] in [
    ["variables", "1"], ["variables", "2"], ["conditionals", "1"], ["conditionals", "2"],
])


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_authored_interactions_survive_api_serialization(path):
    content = json.loads(path.read_text(encoding="utf-8"))["data"]
    serialized = PhasedMissionOut.model_validate(content).model_dump(mode="json", by_alias=True)
    assert serialized["phases"]["encounter"]["world"]["props"]["press"] == content["phases"]["encounter"]["world"]["props"]["press"]
    for name in ("worldChange", "onRun"):
        assert serialized["phases"]["remix"][name]["steps"] == content["phases"]["remix"][name]["steps"]
    assert serialized["phases"]["encounter"]["world"]["interactions"] == content["phases"]["encounter"]["world"]["interactions"]


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.stem)
def test_each_authored_coding_stop_runs_as_real_python(path):
    phases = json.loads(path.read_text(encoding="utf-8"))["data"]["phases"]
    programs = []
    for step in phases["guided"]["steps"]:
        code = step["code"]
        for answer in step["blanks"]:
            code = code.replace("___", answer, 1)
        programs.append((code, step["tests"]))
    programs.append((phases["remix"]["solutionCode"], phases["remix"]["tests"]))
    assert 3 <= len(programs) <= 4
    for source, tests in programs:
        tree = ast.parse(source)
        assert not any(isinstance(node, (ast.FunctionDef, ast.Lambda, ast.For, ast.While)) for node in ast.walk(tree))
        namespace = {}
        exec(compile(tree, str(path), "exec"), {"__builtins__": {}}, namespace)
        for check in tests:
            assert str(namespace[check["call"]]) == check["expected"]
        if path.name.startswith("conditionals"):
            assert any(isinstance(node, ast.If) for node in tree.body)


@pytest.mark.parametrize("stock,order,expected", [(0, 3, 0), (2, 3, 2), (3, 3, 3), (8, 3, 3)])
def test_fair_share_branch_handles_shortage_equality_and_surplus(stock, order, expected):
    path = next(PREBUILT.glob("conditionals-2-*.json"))
    phases = json.loads(path.read_text(encoding="utf-8"))["data"]["phases"]
    branch = next(node for node in ast.parse(phases["guided"]["solutionCode"]).body if isinstance(node, ast.If))
    namespace = {"stock": stock, "order": order}
    exec(compile(ast.Module(body=[branch], type_ignores=[]), "authored-branch", "exec"), {"__builtins__": {}}, namespace)
    assert namespace["give"] == expected
