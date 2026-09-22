"""Reviewed pedestrian-crossing loop gameplay; the model only varies short dialogue."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

from app.schemas.phases import PhasedMissionOut


_TEMPLATE = Path(__file__).resolve().parents[2] / "content" / "templates" / "traffic-first-loop.json"


def _line(raw: dict, key: str, fallback: str) -> str:
    value = raw.get(key)
    return " ".join(value.split())[:320] if isinstance(value, str) and value.strip() else fallback


def _scene(*, people: int, crossed: int = 0, signal: str = "red", cars: int = 3, passed: int = 3) -> dict:
    return {
        "signal": signal, "waiting_cars": cars - passed, "cars_visible": cars,
        "cars_passed": passed, "waiting_pedestrians": people,
        "pedestrians_crossed": crossed, "timer_seconds": 0,
    }


def _beat(animate: str, props: dict, line: str) -> dict:
    return {"animate": animate, "props": props, "speakerNameAr": "الضابط كريم", "lineAr": line}


def _crossing(count: int, *, bound: bool = False, clear_traffic: bool = False) -> dict:
    waiting = _scene(people=count)
    queued = _scene(people=count, passed=0)
    result = _scene(people=0, crossed=count)
    if bound:
        result["pedestrians_crossed"] = "= crossed_count"
    traffic_beats = [
        _beat("signal_countdown", {**queued, "timer_seconds": 5, "timer_for": "cars"}, "العربيات تستنى خمس ثواني قبل ما الإشارة تفتح."),
        _beat("signal_switch", {**queued, "signal": "green"}, "الإشارة فتحت للعربيات، والمشاة لسه على الرصيف."),
        _beat("cars_move", {**queued, "signal": "green", "waiting_cars": 0, "cars_passed": 3, "car_move_from": 0}, "العربيات عدّت واحدة واحدة وفضي الطريق."),
        _beat("signal_switch", waiting, "كريم وقف العربيات تاني. دلوقتي دور الناس."),
    ] if clear_traffic else [
        _beat("officer_point", waiting, "الطريق فاضي؛ كريم بيشاور على الناس اللي مستنية دورها."),
    ]
    return {
        "props": result,
        "captionAr": "الناس عدّت واحد واحد، والعدد اللي على الشاشة جاي من كودك.",
        "steps": [
            *traffic_beats,
            _beat("signal_countdown", {**waiting, "timer_seconds": 5, "timer_for": "pedestrians"}, "الناس تستنى خمس ثواني لحد ما يبقى العبور آمن."),
            _beat("pedestrians_cross", waiting, "كل شخص في القائمة بيعبر بدوره على ممر المشاة."),
            _beat("celebrate", result, "بصّ على العداد: عدد اللي عدّوا هو نتيجة الحلقة اللي شغّلتها."),
        ],
    }


def build(raw: dict, blueprint, *, scaffold: dict[str, str]) -> PhasedMissionOut:
    data = deepcopy(json.loads(_TEMPLATE.read_text(encoding="utf-8")))
    data.update({
        "id": "", "source": "model", "validated": False,
        "difficultyBand": blueprint.difficulty_band, "scaffold": scaffold,
        "titleAr": _line(raw, "title_ar", "دور المشاة"),
    })
    p = data["phases"]
    encounter = p["encounter"]
    encounter["lineAr"] = _line(raw, "encounter_line_ar", "أنا كريم. العربيات واقفة عند الخط، وعلي ونادية مستنيين يعدّوا. مين هيحسب كل واحد يعبر بأمان؟")
    encounter["ctaAr"] = "نساعد المشاة"
    encounter["world"]["props"]["waiting_pedestrians"] = 2
    for interaction in encounter["world"]["interactions"]:
        interaction["onPress"]["props"]["waiting_pedestrians"] = 2
        for beat in interaction["onPress"]["steps"]:
            beat["props"]["waiting_pedestrians"] = 2
    encounter["world"]["interactions"][0]["promptAr"] = "اضغط على الإشارة عشان توقف العربيات قبل ممر المشاة."
    encounter["world"]["interactions"][1]["promptAr"] = "اضغط على كريم وشوف العربيات تقف في حارتين قبل ما الناس تعدّي."
    encounter["world"]["interactions"][1]["onPress"]["captionAr"] = "العربيات وقفت، وعلي ونادية لسه على الرصيف."

    explore = p["explore"]
    explore["ticoIntroAr"] = _line(raw, "explore_intro_ar", "علي ونادية مستنيين. إزاي نخلي كل واحد ياخد دوره من غير ما ننسى حد؟")
    explore["rounds"] = [
        {"questionAr": "علي ونادية محتاجين نفس خطوة العبور. نعمل متغير لكل شخص ولا نكرر نفس الخطوة لكل واحد؟",
         "optionsAr": ["نكرر الخطوة لكل شخص", "نعمل متغير مختلف لكل شخص", "نعدّيهم كلهم مرة واحدة"],
         "correctIndex": 0, "nudgeAr": "لو وصل ناس أكتر، هل هنكتب اسم متغير جديد لكل واحد؟", "highlight": ["waiting_pedestrians"]},
        {"questionAr": "لما كريم يوقف العربيات، كام مرة نعدّ شخص من علي ونادية؟",
         "optionsAr": ["مرتين، واحدة لكل شخص", "مرة واحدة للاتنين", "أربع مرات"],
         "correctIndex": 0, "nudgeAr": "عدّ الناس اللي واقفين على الرصيف: علي ونادية.", "highlight": ["waiting_pedestrians", "officer"]},
    ]
    discover = p["discover"]
    discover["explanationAr"] = _line(raw, "discover_explanation_ar", "الحلقة for تكرر نفس الحركة لكل شخص في القائمة. في كل لفة person يبقى الشخص الحالي، ونزود عدد اللي عدّوا واحد.")
    discover["ticoLineAr"] = "بدل ما نكتب أمر لكل شخص، حلقة واحدة تعدّي عليهم بالترتيب."

    understand = p["understand"]
    understand["introAr"] = "الجزء المهم هنا هو for: بتاخد شخص من people في كل لفة، وبعد السطر اللي تحته ترجع للشخص اللي بعده. crossed_count يبدأ بصفر ويزيد واحد في كل لفة. شغّل وشوف الناس تعبر واحد واحد."
    understand["code"] = blueprint.solution_code
    understand["annotations"] = [
        {"line": 1, "textAr": "people قائمة أسماء الناس اللي على الرصيف.", "pointsAt": "waiting_pedestrians"},
        {"line": 2, "textAr": "العداد يبدأ من صفر قبل أي شخص يعدّي.", "pointsAt": "pedestrians_crossed"},
        {"line": 3, "textAr": "for تختار شخص واحد من القائمة في كل لفة.", "pointsAt": "waiting_pedestrians"},
        {"line": 4, "textAr": "كل لفة تزود العدد واحد؛ هتشوفه في المشهد.", "pointsAt": "pedestrians_crossed"},
    ]
    understand["onRun"] = _crossing(2, clear_traffic=True)
    understand["onRun"]["animate"] = "pedestrians_cross"

    guided = p["guided"]
    first, second = guided["steps"]
    first.update({
        "code": blueprint.solution_code.replace("for person in people:", "for person in ___:"),
        "blanks": ["people"],
        "promptAr": "القائمة جاهزة. كمّل حلقة for: بعد in اكتب people عشان الحلقة تمسك كل شخص مرة، وبعدها شغّل وشوفهم يعدّوا واحد واحد.",
        "hintAr": "بعد in بنكتب اسم القائمة اللي الحلقة هتلف عليها: people.",
        "tests": [{"call": "crossed_count", "expected": "2"}],
        "onEnter": {"animate": "officer_point", "props": _scene(people=2), "captionAr": "علي ونادية مستنيين على الرصيف. حلقة for هي اللي هتعدّيهم."},
        "onRun": _crossing(2, bound=True),
    })
    second.update({
        "code": blueprint.solution_code.replace("for person in people:", "for ___ in ___:").replace("crossed_count + 1", "crossed_count + ___"),
        "blanks": ["person", "people", "1"],
        "promptAr": "الجولة دي كمّل الحلقة بنفسك: اكتب person للشخص الحالي، people للقائمة بعد in، و1 عشان العداد يزيد في كل لفة.",
        "hintAr": "شكل الحلقة: for الشخص الحالي in القائمة. السطر اللي تحتها بيتكرر مرة لكل شخص.",
        "tests": [{"call": "crossed_count", "expected": "2"}],
        "onEnter": {"animate": "officer_point", "props": _scene(people=2), "captionAr": "علي ونادية مستنيين جولة تانية. اكتب حلقة for عشان تعدّيهم."},
        "onRun": _crossing(2, bound=True),
    })
    guided["solutionCode"] = blueprint.solution_code
    guided["tests"] = [{"call": call, "expected": expected} for call, expected in blueprint.tests]
    guided["onRun"] = _crossing(2, bound=True)

    remix = p["remix"]
    remix["twistAr"] = _line(raw, "remix_twist_ar", "منى وناصر وصلوا الرصيف. بقوا أربعة مستنيين دورهم!")
    remix["newRequirementAr"] = "غيّر قائمة people لأربع أسماء؛ سيب حلقة for زي ما هي، وخلي العداد يوصل لأربعة."
    remix["worldChange"] = {"animate": "officer_point", "props": _scene(people=4), "captionAr": "منى وناصر ظهروا جنب علي ونادية على الرصيف."}
    remix["startingCode"] = blueprint.solution_code
    remix["solutionCode"] = blueprint.remix_solution_code
    remix["tests"] = [{"call": call, "expected": expected} for call, expected in blueprint.remix_tests]
    remix["onRun"] = _crossing(4, bound=True)
    return PhasedMissionOut.model_validate(data)
