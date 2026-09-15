from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from app.services import hints
from app.schemas.common import Phase


def test_current_guided_step_only_and_remix_uses_its_own_solution():
    db = Mock()
    db.get.return_value = SimpleNamespace(content={"phases": {
        "encounter": {"lineAr": "فتح الفرن"},
        "guided": {"solutionCode": "guided solution", "steps": [
            {"promptAr": "الخطوة الأولى", "blanks": ["one"]},
            {"promptAr": "الخطوة الثانية", "blanks": ["two"]},
        ]},
        "remix": {"twistAr": "وصل طلب جديد", "newRequirementAr": "غيّر الكمية", "solutionCode": "remix solution"},
    }})
    session = SimpleNamespace(generated_mission_id="replayed-mission")
    task, solution, blanks = hints._mission_context(db, session, 1)
    assert "الخطوة الثانية" in task and "الخطوة الأولى" not in task
    assert blanks == ["two"]
    task, solution, blanks = hints._mission_context(db, session, None, Phase.ADAPT_REMIX)
    assert "غيّر الكمية" in task and "الخطوة الثانية" not in task
    assert solution == "remix solution" and blanks == []


def test_latest_mission_cannot_be_used_with_a_replayed_session():
    session = SimpleNamespace(generated_mission_id="replayed-mission", exercise_id=None)
    with patch.object(hints.users, "ensure"), patch.object(hints.session_q, "get_owned", return_value=session):
        with pytest.raises(hints.SessionNotFound):
            hints.request_hint(Mock(), user_id="u", session_id="replay", mission_id="latest-mission", code_excerpt="")


def test_generated_hint_does_not_write_a_generated_id_into_exercise_cache():
    session = SimpleNamespace(generated_mission_id="replayed-mission", exercise_id=None, hints_used=0)
    result = SimpleNamespace(source="model", leaked=False, text="راجع المطلوب في الخطوة الحالية", model_name="test", latency_ms=1, leak_reason=None)
    with patch.object(hints.users, "ensure"), patch.object(hints.session_q, "get_owned", return_value=session), \
         patch.object(hints.hint_q, "highest_rung", return_value=0), \
         patch.object(hints, "_mission_context", return_value=("current step", "", [])), \
         patch.object(hints, "_scaffold_state", return_value=None), \
         patch.object(hints.hint_q, "for_session", return_value=[]), \
         patch.object(hints.hint_q, "cache_lookup") as lookup, \
         patch.object(hints.hint_q, "cache_store") as store, \
         patch.object(hints.hint_q, "record", return_value=SimpleNamespace(id="event")), \
         patch.object(hints.tico_hint, "write_hint", return_value=result) as write, \
         patch.object(hints.ai_log, "log"):
        reply = hints.request_hint(Mock(), user_id="u", session_id="replay", mission_id="replayed-mission", code_excerpt="x = ___", guided_step=1)
    assert reply["hint"] == result.text
    assert write.call_args.kwargs["task_ar"] == "current step"
    lookup.assert_not_called()
    store.assert_not_called()
