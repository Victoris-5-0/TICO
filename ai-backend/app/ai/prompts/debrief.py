"""The one sentence TICO says at the end of a mission.

## The model contributes exactly one field

Every number on the debrief screen — attempts, hints, time, stars, which errors stopped
happening — is counted in Python from `submissions` and `hint_events`. The model is never
asked for a count, because it would guess, and a wrong attempt count in front of a child is
worse than no debrief at all.

What the model is good at is noticing what the numbers *mean*: that the same mistake
happened twice and then stopped is a fact Python can extract, but "you caught it yourself
the third time" is the sentence that makes the child feel it.

## Why the counts go into the prompt

They are given to the model as facts it must not contradict, not as things to work out. A
debrief that says "you did it first try" to a student who took nine attempts is worse than
generic praise: it proves nobody was watching.
"""

from __future__ import annotations

#: Bumped when the wording changes, so `ai_interactions.prompt_version` can explain why
#: two debriefs from different weeks do not sound alike.
PROMPT_VERSION = "debrief/v1"

SYSTEM = """إنت تيكو، رفيق البرمجة بتاع الطفل. الطفل لسه خلص مهمة، وإنت هتقول له جملة واحدة عن اللي حصل.

قواعد:
- جملة أو جملتين بالعامية المصرية. مش أكتر.
- اتكلم عن حاجة **محددة** حصلت في المهمة دي. ممنوع كلام عام زي «برافو» أو «شاطر» لوحده.
- لو غلط في حاجة وبعدين ظبطها، ده أهم حاجة تقولها. ده اللي بيفرق بين اللي بيحفظ واللي بيفهم.
- لو استعمل تلميحات، ماتعيّرش. طلب المساعدة مهارة مش ضعف.
- لو المهمة مخلصتش، اقفل بحاجة تخليه عايز يرجع. من غير كذب إنه نجح.
- ممنوع أرقام من عندك. الأرقام اللي في المعطيات بس، ولو مش هتستعملها بلاش.
- ممنوع كود.
- كلمه بصيغة المؤنث لو الاسم بيقول كده، وإلا استعمل صيغة محايدة.

اكتب الجملة بس. من غير مقدمة ومن غير علامات تنصيص."""

TASK = """المهمة: <<mission>>
المفهوم: <<concept>>
النتيجة: <<outcome>>
عدد المحاولات: <<attempts>>
عدد التلميحات: <<hints>>
الوقت: <<minutes>> دقيقة
أخطاء ظهرت وبعدين اختفت: <<overcome>>

اكتب جملة تيكو."""

#: Served when the model is unavailable, or says something with a number in it that the
#: counts do not support. Deliberately warm and vague: a fallback that invents a detail is
#: worse than one that does not have any.
FALLBACK_AR = {
    True: "خلصت المهمة! كل مرة بتحاول فيها، حاجة صغيرة بتثبت في دماغك.",
    False: "مخلصتهاش دلوقتي، وده عادي. المرة الجاية هتبقى أقرب — جرب تاني لما تكون جاهز.",
}


def build(
    *,
    mission: str,
    concept: str,
    solved: bool,
    attempts: int,
    hints: int,
    time_spent_ms: int,
    errors_overcome: list[str],
) -> tuple[str, str]:
    """`(system, task)`. Placeholders are `<<name>>` — `{name}` collides with f-strings."""
    overcome = "، ".join(errors_overcome) if errors_overcome else "مفيش"

    task = TASK
    for key, value in {
        "mission": mission or "مهمة",
        "concept": concept or "—",
        "outcome": "خلصها" if solved else "مخلصهاش",
        "attempts": str(attempts),
        "hints": str(hints),
        "minutes": str(max(1, round(time_spent_ms / 60_000))),
        "overcome": overcome,
    }.items():
        task = task.replace(f"<<{key}>>", value)

    return SYSTEM, task
