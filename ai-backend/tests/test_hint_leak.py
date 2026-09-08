"""CI Hint Leak Test Suite (M2 — P0).

Graded by rung per AGENTS.md and docs/08:
    - Rungs 1-2 (ORIENT, QUESTION): No solution identifier, no fenced code block.
      Rung 2 additionally forbids student's target values.
    - Rung 3 (NAME_IT): May name concept and illustrate with a foreign example,
      but must contain NONE of the student's target values or mission identifiers.
    - Rung 4 (WALK): May walk to the fix in words, but must contain NO complete
      runnable lines of Python code.
    - Universal invariant: No rung EVER emits a complete solution.

Uses real validation functions from app.ai.guards (not a reimplementation).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.ai.chains.tico_hint import write_hint
from app.ai.guards import (
    contains_any_term,
    contains_fenced_code_block,
    contains_runnable_python_line,
    validate_hint_output,
)
from app.rules.hint_ladder import (
    GENERIC_FALLBACK_HINTS,
    TEMPLATED_FALLBACK_PATTERNS,
    get_authored_fallback,
)
from app.config import settings
from app.schemas.common import HintRung, Phase

# ---------------------------------------------------------------------------
# Realistic Mission Benchmark Scenarios for CI Grading
# ---------------------------------------------------------------------------

MISSION_SCENARIOS = [
    {
        "id": "cairo_metro_gate",
        "world": "cairo_metro",
        "concept": "conditionals",
        "solution_identifiers": ["gate", "open", "waiting", "station"],
        "target_values": ["30", "open", "closed"],
        "solution_code": "if waiting > 30:\n    gate.open()",
    },
    {
        "id": "bakery_oven_timer",
        "world": "el_forn",
        "concept": "variables",
        "solution_identifiers": ["oven", "temperature", "bake", "timer"],
        "target_values": ["200", "45"],
        "solution_code": "temperature = 200\noven.bake(temperature)",
    },
    {
        "id": "traffic_light_loop",
        "world": "cairo_traffic",
        "concept": "loops",
        "solution_identifiers": ["traffic_light", "cars", "pass_count", "signal"],
        "target_values": ["5", "green", "red"],
        "solution_code": "for car in cars:\n    traffic_light.signal('green')",
    },
]

CURRICULUM_CONCEPTS = ["variables", "conditionals", "loops", "functions"]
LOCALES = ["ar_EG", "en"]


# ---------------------------------------------------------------------------
# 1. CI Certification of All Authored Fallbacks Across All Rungs and Locales
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("locale", LOCALES)
@pytest.mark.parametrize("scenario", MISSION_SCENARIOS, ids=lambda s: s["id"])
def test_generic_authored_fallbacks_pass_graded_leak_checks(locale: str, scenario: dict):
    """Every generic authored fallback must strictly satisfy its rung leak rules in CI."""
    for rung in (HintRung.ORIENT, HintRung.QUESTION, HintRung.NAME_IT, HintRung.WALK):
        fallback_text = get_authored_fallback(rung, locale=locale, concept_hint=None)

        result = validate_hint_output(
            rung=rung,
            hint_text=fallback_text,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )

        assert result.passed is True, (
            f"Generic fallback failed leak check for rung {rung} ({locale}) "
            f"in scenario {scenario['id']}: {result.violations}\nText: {fallback_text}"
        )


@pytest.mark.parametrize("locale", LOCALES)
@pytest.mark.parametrize("concept", CURRICULUM_CONCEPTS)
@pytest.mark.parametrize("scenario", MISSION_SCENARIOS, ids=lambda s: s["id"])
def test_templated_authored_fallbacks_pass_graded_leak_checks(
    locale: str, concept: str, scenario: dict
):
    """Every templated authored fallback must satisfy its rung leak rules in CI."""
    for rung in (HintRung.ORIENT, HintRung.QUESTION, HintRung.NAME_IT, HintRung.WALK):
        fallback_text = get_authored_fallback(rung, locale=locale, concept_hint=concept)

        result = validate_hint_output(
            rung=rung,
            hint_text=fallback_text,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )

        assert result.passed is True, (
            f"Templated fallback with concept='{concept}' failed leak check "
            f"for rung {rung} ({locale}) in scenario {scenario['id']}: {result.violations}\nText: {fallback_text}"
        )


# ---------------------------------------------------------------------------
# 2. Graded Leak Tests by Rung (AGENTS.md specification)
# ---------------------------------------------------------------------------


class TestRung1OrientLeakGrading:
    """Rung 1: Orient attention.

    Hard rules: No diagnosis, NO solution identifier, NO fenced code block.
    """

    def test_clean_orient_prose_passes(self):
        scenario = MISSION_SCENARIOS[0]
        # Arabic clean
        res_ar = validate_hint_output(
            HintRung.ORIENT,
            "بص كويس على السطر التاني في الكود وشوف الشرط مكتوب إزاي.",
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert res_ar.passed is True

        # English clean
        res_en = validate_hint_output(
            HintRung.ORIENT,
            "Take a close look at the first few lines where you set up your logic.",
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert res_en.passed is True

    @pytest.mark.parametrize(
        "leaky_text,expected_violation",
        [
            ("راجع استخدام دالة gate في الكود", "solution identifiers"),
            ("المشكلة في استدعاء open هنا", "solution identifiers"),
            ("```python\nx = 1\n```", "fenced code block"),
            ("```\ngate\n```", "fenced code block"),
        ],
    )
    def test_rung_1_rejects_solution_identifiers_and_fenced_code(
        self, leaky_text: str, expected_violation: str
    ):
        scenario = MISSION_SCENARIOS[0]
        result = validate_hint_output(
            HintRung.ORIENT,
            leaky_text,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert result.passed is False
        assert any(expected_violation in v for v in result.violations)


class TestRung2QuestionLeakGrading:
    """Rung 2: Guiding question.

    Hard rules: No solution identifier, NO fenced code block, NO student target values.
    """

    def test_clean_question_prose_passes(self):
        scenario = MISSION_SCENARIOS[0]
        res_ar = validate_hint_output(
            HintRung.QUESTION,
            "هل الشرط بتاعك بيقارن القيمة ولا بيخزن قيمة جديدة؟",
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert res_ar.passed is True

        res_en = validate_hint_output(
            HintRung.QUESTION,
            "What comparison operator should you use when testing for equality?",
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert res_en.passed is True

    @pytest.mark.parametrize(
        "leaky_text,expected_violation",
        [
            ("Why did you not call gate here?", "solution identifiers"),
            ("Does the station variable hold the count?", "solution identifiers"),
            ("What happens when the count reaches 30?", "solution values"),
            ("Is the target state open or closed?", "solution values"),
            ("```python\nif x == 1: pass\n```", "fenced code block"),
        ],
    )
    def test_rung_2_rejects_identifiers_values_and_fenced_code(
        self, leaky_text: str, expected_violation: str
    ):
        scenario = MISSION_SCENARIOS[0]
        result = validate_hint_output(
            HintRung.QUESTION,
            leaky_text,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert result.passed is False
        assert any(expected_violation in v for v in result.violations)


class TestRung3NameItLeakGrading:
    """Rung 3: Name concept + show pattern on a DIFFERENT foreign example.

    Hard rules: May show foreign example / code, but must contain NONE of the
    student's target values and NONE of the mission identifiers.
    """

    def test_foreign_example_code_passes(self):
        scenario = MISSION_SCENARIOS[0]  # metro: identifiers=[gate, open, waiting, station], values=[30, open, closed]

        # Foreign example uses student-unrelated variables: speed, limit, car, 60, alert
        clean_hint = (
            "المفهوم هنا هو الشروط. في بايثون بنفحص الشروط كده: "
            "`if speed > 60: alert()` لاحظ استخدام علامة المقارنة."
        )
        result = validate_hint_output(
            HintRung.NAME_IT,
            clean_hint,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert result.passed is True

    @pytest.mark.parametrize(
        "leaky_text,expected_violation",
        [
            ("المفهوم هو الشروط، قارن المتغير مع القيمة 30", "student target values"),
            ("افحص حالة الباب لما تبقى open", "student target values"),
            ("المفهوم هو استدعاء الدوال زي gate.open()", "mission identifiers"),
            ("المفهوم هو فحص متغير waiting في جملة if", "mission identifiers"),
        ],
    )
    def test_rung_3_rejects_student_target_values_and_mission_identifiers(
        self, leaky_text: str, expected_violation: str
    ):
        scenario = MISSION_SCENARIOS[0]
        result = validate_hint_output(
            HintRung.NAME_IT,
            leaky_text,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert result.passed is False
        assert any(expected_violation in v for v in result.violations)


class TestRung4WalkLeakGrading:
    """Rung 4: Walk to the fix in words.

    Hard rules: Precise description of the edit in prose, but NEVER a complete runnable line.
    """

    def test_prose_descriptions_of_edit_pass(self):
        # Arabic prose describing the fix without runnable code
        res_ar = validate_hint_output(
            HintRung.WALK,
            "في السطر التاني، غيّر علامة = الواحدة وخليها علامة مقارنة == عشان تفحص الشرط.",
        )
        assert res_ar.passed is True

        # English prose describing the fix
        res_en = validate_hint_output(
            HintRung.WALK,
            "In your condition, replace the single equals assignment with a double equals comparison operator.",
        )
        assert res_en.passed is True

    @pytest.mark.parametrize(
        "runnable_leak",
        [
            "اكتب السطر ده بالظبط:\ngate.open()",
            "Change your code to:\nif waiting > 30:",
            "Run this line: `temperature = 200`",
            "- for car in cars:",
            "oven.bake(temperature)",
            "traffic_light.signal('green')",
        ],
    )
    def test_rung_4_rejects_complete_runnable_lines(self, runnable_leak: str):
        result = validate_hint_output(
            HintRung.WALK,
            runnable_leak,
        )
        assert result.passed is False
        assert any("complete runnable line" in v for v in result.violations)


# ---------------------------------------------------------------------------
# 3. End-to-End Leak Trapping Through tico_hint Chain
# ---------------------------------------------------------------------------


def test_the_chain_never_lets_a_leak_through_on_any_rung():
    """A model that leaks twice must produce authored text, not its second attempt.

    Rewritten from `generate_tico_hint` to `write_hint` when the two hint chains became
    one. What it asserts is unchanged, and it is the point of the whole design: under no
    circumstance does a leak reach the caller.
    """
    scenario = MISSION_SCENARIOS[0]

    # One leaking reply per rung, in the shape a model actually produces.
    leaking = {
        HintRung.ORIENT: "```python\ngate.open()\n```",
        HintRung.QUESTION: "Did you check if waiting is 30?",
        HintRung.NAME_IT: "Here is how you do it with waiting == 30",
        HintRung.WALK: "Write this line: gate.open()",
    }

    for rung, leak_text in leaking.items():
        model = MagicMock()
        # Both attempts leak, so the chain has to give up and use authored text.
        model.invoke.side_effect = [AIMessage(content=leak_text), AIMessage(content=leak_text)]

        with patch("app.ai.chains.tico_hint.get_model", return_value=model), patch.object(
            settings, "google_api_key", "test-key"
        ):
            result = write_hint(
                rung=rung,
                phase=Phase.GUIDED_CODING.value,
                task_ar="افتحي البوابة",
                student_code="waiting = 35",
                solution_code=scenario["solution_code"],
                blanks=scenario["target_values"],
            )

        verdict = validate_hint_output(
            rung=rung,
            hint_text=result.text,
            solution_identifiers=scenario["solution_identifiers"],
            target_values=scenario["target_values"],
        )
        assert verdict.passed, (
            f"the hint served on rung {int(rung)} leaked: {verdict.violations}\n{result.text}"
        )

        assert result.source == "fallback", "a twice-leaking model must not be served"
        assert result.leaked and result.leak_reason
        assert model.invoke.call_count == 2, "one retry with feedback, then give up"


def test_universal_invariant_no_full_solution_at_any_rung():
    """Universal invariant: No hint rung may emit the complete solution code."""
    for scenario in MISSION_SCENARIOS:
        full_sol = scenario["solution_code"]

        for rung in (HintRung.ORIENT, HintRung.QUESTION, HintRung.NAME_IT, HintRung.WALK):
            # If model were to emit the full solution code, every rung must reject it
            res = validate_hint_output(
                rung=rung,
                hint_text=full_sol,
                solution_identifiers=scenario["solution_identifiers"],
                target_values=scenario["target_values"],
            )
            assert res.passed is False, (
                f"Rung {rung} failed to reject full solution code for scenario {scenario['id']}"
            )
