"""Reviewed gameplay for the first traffic loop; the model supplies prose only."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

from app.schemas.phases import PhasedMissionOut


_TEMPLATE = Path(__file__).resolve().parents[2] / "content" / "templates" / "traffic-first-loop.json"


def _line(raw: dict, key: str, default: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        return default
    value = " ".join(value.strip().split())
    return value[:320]


def _bind_release(change: dict) -> None:
    change["props"]["cars_passed"] = "= released_count"
    if change.get("steps"):
        # Earlier beats show the physical one-by-one movement; the settled frame is
        # still supplied by the learner's actual Python result.
        change["steps"][-1]["props"]["cars_passed"] = "= released_count"


def _keep_arrival_at_new_queue_only(change: dict) -> None:
    change["steps"] = [beat for beat in change.get("steps", []) if beat.get("animate") != "cars_arrive"]


def build(raw: dict, blueprint, *, scaffold: dict[str, str]) -> PhasedMissionOut:
    data = deepcopy(json.loads(_TEMPLATE.read_text(encoding="utf-8")))
    phases = data["phases"]
    data.update({
        "id": "",
        "source": "model",
        "validated": False,
        "difficultyBand": blueprint.difficulty_band,
        "scaffold": scaffold,
        "titleAr": _line(raw, "title_ar", data["titleAr"]),
    })

    encounter = phases["encounter"]
    explore = phases["explore"]
    discover = phases["discover"]
    understand = phases["understand"]
    guided = phases["guided"]
    remix = phases["remix"]

    opening = _line(raw, "encounter_line_ar", encounter["lineAr"])
    if "حمرا" in opening or "حمراء" in opening or "خضرا" in opening:
        opening = encounter["lineAr"]
    encounter["lineAr"] = opening
    explore["ticoIntroAr"] = _line(raw, "explore_intro_ar", explore["ticoIntroAr"])
    first_question = _line(
        raw, "explore_first_question_ar",
        "عشان نعدّي كل عربية بدورها، نعمل متغير لكل عربية ولا نستخدم التكرار لنفس الحركة؟",
    )
    if "متغير" not in first_question or "تكر" not in first_question:
        first_question = "عشان نعدّي كل عربية بدورها، نعمل متغير لكل عربية ولا نستخدم التكرار لنفس الحركة؟"
    explore["rounds"][0].update({
        "questionAr": first_question,
        "optionsAr": ["نكرر نفس الحركة لكل عربية", "نعمل متغير مختلف لكل عربية"],
        "correctIndex": 0,
        "nudgeAr": "لو الطابور كبر، هل هنحتاج اسم جديد لكل عربية؟",
    })
    # The second question predicts a larger queue; its reviewed choices stay together.
    explore["rounds"][1]["questionAr"] = "لو الطابور كبر لخمس عربيات، إزاي نستخدم نفس أمر المرور؟"
    discover["explanationAr"] = _line(
        raw, "discover_explanation_ar",
        "التكرار معناه نكتب الحركة مرة واحدة ونخليها تحصل لكل عربية بالترتيب. "
        "في بايثون كلمة for تبدأ الحلقة، وcar هي العربية الحالية في كل لفة.",
    )
    understand["introAr"] = (
        "المتغير cars زي علبة شايلة قائمة العربيات بالترتيب، والمتغير released_count "
        "عداد يبدأ من صفر. كلمة for تمر على القائمة عربية عربية؛ كل لفة تزود العداد "
        "واحد. شغّل المثال وراقب وصول العربيات ومرورها."
    )
    understand["code"] = blueprint.solution_code
    understand["annotations"] = [
        {"line": 1, "textAr": "cars متغير شايل قائمة العربيات بالترتيب.", "pointsAt": "waiting_cars"},
        {"line": 2, "textAr": "released_count عداد يبدأ من صفر قبل أول عربية.", "pointsAt": "cars_passed"},
        {"line": 3, "textAr": "for تمسك عربية واحدة من cars في كل لفة.", "pointsAt": "waiting_cars"},
        {"line": 4, "textAr": "كل لفة تزود العداد واحد؛ النتيجة تظهر على الطريق.", "pointsAt": "cars_passed"},
    ]
    understand["onRun"]["animate"] = "cars_move"
    understand["onRun"]["props"]["cars_passed"] = 3
    _keep_arrival_at_new_queue_only(understand["onRun"])

    first, second = guided["steps"]
    first["code"] = 'cars = [___]\nreleased_count = 0'
    first["blanks"] = ['"taxi", "minibus", "tuktuk"']
    first["promptAr"] = (
        "اكتب عناصر متغير اسمه cars. ده قائمة فيها أسماء التاكسي والميني باص والتوكتوك "
        "بالترتيب، وكل اسم نص بين علامتي تنصيص."
    )
    first["hintAr"] = "كل اسم يتحط بين علامتي تنصيص، وبين كل اسم والتاني فاصلة."
    first["tests"] = [{"call": "len(cars)", "expected": "3"}]

    second["code"] = blueprint.solution_code.replace("for car in cars:", "for car in ___:").replace(
        "released_count + 1", "released_count + ___"
    )
    second["blanks"] = ["cars", "1"]
    second["promptAr"] = (
        "كمّل حلقة التكرار: بعد in اكتب اسم القائمة cars. وبعد + اكتب 1 عشان "
        "المتغير released_count يزيد مرة لكل عربية."
    )
    second["hintAr"] = "for تلف على القائمة cars؛ كل لفة تزود العداد بمقدار 1."
    second["tests"] = [{"call": "released_count", "expected": "3"}]
    guided["solutionCode"] = blueprint.solution_code
    guided["tests"] = [
        {"call": call, "expected": expected} for call, expected in blueprint.tests
    ]
    _bind_release(second["onRun"])
    _bind_release(guided["onRun"])
    _keep_arrival_at_new_queue_only(second["onRun"])
    _keep_arrival_at_new_queue_only(guided["onRun"])

    remix["twistAr"] = _line(raw, "remix_twist_ar", remix["twistAr"])
    remix["newRequirementAr"] = "الطابور بقى خمس عربيات. غيّر القائمة بس وسيب حلقة for زي ما هي."
    remix["worldChange"]["props"].update({
        "signal": "red", "waiting_cars": 5, "cars_visible": 5, "cars_passed": 0,
        "waiting_pedestrians": 4, "pedestrians_crossed": 0,
    })
    remix["worldChange"]["steps"] = [
        {
            "animate": "officer_point",
            "props": {"signal": "red", "waiting_cars": 0, "cars_visible": 0,
                      "cars_passed": 0, "waiting_pedestrians": 4, "pedestrians_crossed": 0},
            "speakerNameAr": "الضابط كريم",
            "lineAr": "الناس مستنية على الرصيف في الجولة الجديدة.",
        },
        {
            "animate": "cars_arrive",
            "props": {"signal": "red", "waiting_cars": 5, "cars_visible": 5,
                      "cars_passed": 0, "waiting_pedestrians": 4, "pedestrians_crossed": 0},
            "speakerNameAr": "الضابط كريم",
            "lineAr": "العربيات الخمسة بتيجي واحدة واحدة وتقف قبل الخط.",
        },
    ]
    remix["startingCode"] = blueprint.solution_code
    remix["solutionCode"] = blueprint.remix_solution_code
    remix["tests"] = [
        {"call": call, "expected": expected} for call, expected in blueprint.remix_tests
    ]
    _bind_release(remix["onRun"])
    _keep_arrival_at_new_queue_only(remix["onRun"])
    return PhasedMissionOut.model_validate(data)
