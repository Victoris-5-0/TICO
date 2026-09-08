"""The prompt that asks TICO for one hint, at one rung.

The rung is decided in Python before this runs, so the model is never asked *how much* to
give away — only to write well for the amount it was given. That is what makes the ladder
a guarantee rather than a suggestion.

## The rule the whole product rests on

**No rung returns a runnable solution.** Rung 4 talks the student to the fix in words and
still withholds the line. `guards.hint_leaks_answer` checks the output afterwards, because
a model asked "did you just give away the answer" says no.

## What TICO is told about the student

Only what changes the wording: the rung, the phase, their code, and what went wrong. Not
their name, not their mastery scores, not their history. A hint should read as a response
to what is on screen, not as a report from a file about them.
"""

from __future__ import annotations

PROMPT_VERSION = "tico_hint/v1"


SYSTEM = """إنت تيكو، رفيق البرمجة بتاع الطفل. بتتكلم عامية مصرية دافية وبسيطة.

You are helping ONE child aged 10-17 who is stuck on ONE line of Python. You are warm,
never sarcastic, never condescending, and you are never disappointed in them.

THE RULE THAT MATTERS MOST:
You are giving a hint at a FIXED RUNG that has already been decided. Write for that rung
and no further. Giving more than the rung allows is the single worst thing you can do —
it takes away the moment where they work it out.

**NEVER write the corrected line of their code.** Not at any rung, including the last
one. You may describe what to change in words. You may show a DIFFERENT example. You may
not hand over the fix.

STYLE:
· One or two sentences. A hint is not a lesson.
· Egyptian Arabic (عامية مصرية) for everything you say.
· English for code identifiers — `total`, `trays`, `if`. Never transliterate them.
· Talk about the world they are in — the bakery, the station, the junction — not about
  "the exercise" or "the function".
· No greeting, no sign-off. They are mid-problem; get to it.

Return ONLY the hint text. No JSON, no quotes around it, no preamble."""


TASK = """RUNG {rung} OF 4 — {intent}

WHAT THE STUDENT IS DOING
Phase: {phase}
{phase_note}

THE TASK
{task_ar}

THEIR CODE RIGHT NOW
```python
{code}
```

{failure_block}
{error_tag_block}
{previous_block}

Write the rung {rung} hint. One or two sentences, Egyptian Arabic."""


PHASE_NOTE = {
    "GUIDED_CODING": (
        "They are filling a blank in code that is otherwise written for them. This is "
        "their first real typing, so be generous with encouragement and stingy with the "
        "answer."
    ),
    "ADAPT_REMIX": (
        "The world just changed and their working code is now wrong. They are not stuck "
        "on syntax — they are working out WHAT ELSE has to be handled. Point them at the "
        "new situation, not at Python."
    ),
    "INDEPENDENT": (
        "They are writing from scratch with no scaffold. Help them think, not type. This "
        "is the phase where they prove it to themselves."
    ),
}


def build(
    *,
    rung: int,
    intent: str,
    phase: str,
    task_ar: str,
    code: str,
    error_text: str | None = None,
    error_tag: str | None = None,
    previous_hints: list[str] | None = None,
) -> tuple[str, str]:
    """Return `(system, task)` for one hint."""
    failure_block = ""
    if error_text:
        # The actual failing message. `lastResult` says *that* it failed; this says how,
        # which is the difference between a useful hint and a generic one.
        failure_block = f"WHAT WENT WRONG WHEN THEY RAN IT\n{error_text.strip()[:600]}\n"

    error_tag_block = ""
    if error_tag:
        error_tag_block = (
            f"CLASSIFIED MISTAKE: {error_tag}\n"
            "Aim the hint at this specific misunderstanding.\n"
        )

    previous_block = ""
    if previous_hints:
        # Without this, rung 3 often repeats rung 2 in different words and the student
        # correctly concludes that asking again is pointless.
        joined = "\n".join(f"  rung {i}: {h}" for i, h in enumerate(previous_hints, 1))
        previous_block = (
            f"HINTS THEY HAVE ALREADY SEEN — do not repeat these, go further:\n{joined}\n"
        )

    task = TASK.format(
        rung=rung,
        intent=intent,
        phase=phase,
        phase_note=PHASE_NOTE.get(phase, ""),
        task_ar=task_ar.strip() or "(no description available)",
        code=code.strip()[:2000] or "(they have not written anything yet)",
        failure_block=failure_block,
        error_tag_block=error_tag_block,
        previous_block=previous_block,
    )
    return SYSTEM, task


#: Used when the model is unavailable, or when its output leaks the answer and the retry
#: also fails. Deliberately generic — a vague hint that is safe beats a specific one that
#: gives the game away, and a mission's authored hints are always preferred over these.
FALLBACK_AR: dict[int, str] = {
    1: "بصّ كويس على السطر اللي بتحسب فيه. في حاجة صغيرة مش مظبوطة.",
    2: "فكّر: القيمة اللي محتاجها هنا جاية منين؟ وإيه اللي بيتغير لما تتغير؟",
    3: "دي حاجة اسمها المتغير — بتخزن قيمة في اسم عشان تستخدمها بعدين. زي `price = 10` وبعدين تستخدم `price`.",
    4: "المكان اللي فيه الفراغ محتاج القيمة اللي اتكلمنا عنها فوق. ارجع للسؤال في الأول واسأل نفسك: الرقم ده جه منين؟",
}
