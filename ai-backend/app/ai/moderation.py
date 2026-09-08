"""Input moderation before any prompt (M6 — P0).

Pure Python, zero I/O, zero model calls, zero LangChain / SQLAlchemy imports.

Pedagogical, privacy, and child-safety contract (AGENTS.md, docs/08, docs/10):
  - "Users are 10-17. Record the verdict on ai_interaction."
  - "Moderate free text the student types before it enters a prompt, and record the
    verdict on ai_interaction."
  - "TICO may discuss the active mission, its prerequisite concepts, a recent
    execution result, and emotional encouragement related to learning. It must refuse
    or redirect requests for complete solutions, unrelated personal advice, secrets,
    unsafe activity, romance, or off-platform contact."
  - "Before a model call, remove name, email, OAuth identity, exact age, and unrelated
    chat history."
  - Child safety invariant: SAFETY_CONCERN (self-harm, violence, severe danger)
    must NEVER be silently swallowed or demoted; it is surfaced as the highest-priority
    category with requires_human_escalation=True.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Final

# NEEDS DECISION: docs/08 specifies: "Moderate free text the student types before it
# enters a prompt, and record the verdict on ai_interaction", but does not specify
# whether ambiguous moderation cases should escalate to a model reviewer (unlike
# composer/classify_error's established "rules propose, model reviews on conflict" pattern).
# A deterministic keyword/pattern-based first pass is fast, zero-cost, and safe, but
# inherently suffers false negatives for cleverly-worded, obfuscated, or non-matched
# multilingual attempts. The team must decide whether to retain deterministic-only
# moderation for MVP cost and latency simplicity, or introduce an AICapability-based
# escalation path (e.g. AICapability.MODERATION in router.py + app/config.py) for
# ambiguous edge cases.


class ModerationCategory(str, Enum):
    """Closed enumeration of child-safety and mission boundary moderation categories."""

    SOLUTION_REQUEST = "solution_request"
    OFF_PLATFORM_CONTACT = "off_platform_contact"
    PERSONAL_INFO = "personal_info"
    ROMANTIC_SEXUAL = "romantic_sexual"
    SAFETY_CONCERN = "safety_concern"
    PROMPT_INJECTION = "prompt_injection"
    CLEAN = "clean"


@dataclass(frozen=True, slots=True)
class ModerationVerdict:
    """Evaluation verdict and boundary enforcement action for student free-text."""

    categories: list[ModerationCategory]
    is_blocked: bool
    highest_severity_category: ModerationCategory | None
    safe_redirect_message: str | None
    requires_human_escalation: bool
    reason: str


# ---------------------------------------------------------------------------
# Pattern sets by category
# ---------------------------------------------------------------------------

# 1. Solution Requests: Demanding complete code or answers to bypass problem solving
SOLUTION_REQUEST_TERMS: Final[tuple[str, ...]] = (
    # English
    "give me the solution",
    "give me the code",
    "give me the answer",
    "solve it for me",
    "write the code for me",
    "write the whole code",
    "full solution",
    "complete solution",
    "complete answer",
    "just give me the code",
    "what is the answer",
    # Arabic
    "حلها لي",
    "حل المسألة",
    "اديني الحل",
    "إديني الحل",
    "اديني الكود",
    "إديني الكود",
    "اكتبلي الكود",
    "اكتب لي الكود",
    "هات الحل",
    "حللي الكود",
    "اكتب الحل",
    "حل المهمة",
)

# 2. Off-Platform Contact: Attempts to move communication off-platform or meet in real life
OFF_PLATFORM_CONTACT_TERMS: Final[tuple[str, ...]] = (
    # English
    "whatsapp",
    "discord",
    "telegram",
    "instagram",
    "snapchat",
    "tiktok",
    "facebook",
    "meet in person",
    "meet irl",
    "meet up",
    "hang out in real life",
    "call me on",
    "add me on",
    "text me at",
    # Arabic
    "واتساب",
    "واتس اب",
    "واتس",
    "ديسكورد",
    "تليجرام",
    "انستجرام",
    "انستا",
    "فيسبوك",
    "فيس بوك",
    "سناب شات",
    "سناب",
    "تيك توك",
    "نتقابل بره",
    "نتقابل في الحقيقة",
    "كلمني فون",
    "كلمني على الخاص",
    "ابعتلي على الواتس",
)

# 3. Personal Information: Soliciting or sharing PII (address, phone, school, exact age, photos)
PERSONAL_INFO_TERMS: Final[tuple[str, ...]] = (
    # English
    "where do you live",
    "what is your address",
    "what is your real name",
    "my address is",
    "my school is",
    "my phone number",
    "send me a photo",
    "send me a picture",
    "send selfie",
    "what's your phone number",
    "how old are you",
    # Arabic
    "عنوانك إيه",
    "عنوانك ايه",
    "ساكن فين",
    "اسمك الحقيقي",
    "اسم مدرستي",
    "مدرستي اسمها",
    "عنواني هو",
    "رقم تليفوني",
    "رقم موبايلي",
    "ابعت صورتك",
    "ابعت صورة",
    "صورتك الشخصية",
    "عندك كام سنة",
)

# PII regex patterns: Email address and telephone number scrubbing/detection
EMAIL_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
)

# Phone number regex: Requires genuine phone formatting (international prefix '+', parenthesized
# area code, dot/dash punctuation, or Egyptian mobile spacing). Bare unbroken digit strings (e.g. 123456789,
# 30000000) and space-separated score lists (e.g. 100 200 300) are excluded to avoid false positives.
PHONE_NUMBER_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"\+\d{8,15}\b"  # Explicit E.164 raw international format (+201001234567)
    r"|"
    r"\+\d{1,3}[-.\s]?(?:\(\d{2,4}\)[-.\s]?|\d{2,4}[-.\s])\d{3,4}[-.\s]?\d{3,4}\b"  # Country-code anchored (+20 100 123 4567)
    r"|"
    r"\(\d{2,4}\)[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b"  # Parenthesized area code: (011) 234-5678, (02) 2345 6789
    r"|"
    r"\b\d{2,4}[-.]\d{3,4}[-.]\d{3,4}\b"  # Explicit dash or dot separated: 010-1234-5678, 012.3456.7890
    r"|"
    r"\b01[0125]\d[-.\s]\d{3}[-.\s]\d{4}\b"  # Egyptian mobile (11 digits, space-separated): 0100 123 4567
    r"|"
    r"\b01[0125][-.\s]\d{4}[-.\s]\d{4}\b"  # Egyptian mobile alternative spacing: 010 1234 5678
)

# 4. Romantic or Sexual Content: Romantic solicitations, dating, sexual language or roleplay
ROMANTIC_SEXUAL_TERMS: Final[tuple[str, ...]] = (
    # English
    "i love you",
    "be my girlfriend",
    "be my boyfriend",
    "kiss me",
    "marry me",
    "date me",
    "sexy",
    "naked",
    "nude",
    "sexual",
    "hot babe",
    # Arabic
    "بحبك",
    "تتزوجني",
    "تتجوزني",
    "بوسني",
    "يا حبيبي",
    "يا حبيبتي",
    "عايز احبك",
    "عايزة احبك",
    "جنس",
    "عريان",
    "جنسي",
)

# 5. Safety Concerns: Self-harm, violence towards others, weapons, or severe real-world danger.
# HIGHEST PRIORITY: Sets requires_human_escalation=True and takes precedence over all other categories.
SAFETY_CONCERN_TERMS: Final[tuple[str, ...]] = (
    # English
    "suicide",
    "kill myself",
    "hurt myself",
    "self harm",
    "self-harm",
    "want to die",
    "end my life",
    "kill someone",
    "murder",
    "make a bomb",
    "shoot up",
    # Arabic
    "انتحار",
    "أنتحر",
    "انتحر",
    "اموت نفسي",
    "أموت نفسي",
    "اقتل نفسي",
    "أقتل نفسي",
    "عايز أموت",
    "عايزة أموت",
    "عايز اموت",
    "عايزة اموت",
    "أؤذي نفسي",
    "اؤذي نفسي",
    "اقتل فلان",
    "أقتل فلان",
    "اصنع قنبلة",
    "أصنع قنبلة",
    "سلاح",
)

# 6. Prompt Injection / Jailbreak: Attempts to manipulate instructions or escape system persona
PROMPT_INJECTION_TERMS: Final[tuple[str, ...]] = (
    # English
    "ignore previous instructions",
    "ignore all previous instructions",
    "disregard all instructions",
    "disregard previous instructions",
    "system prompt",
    "reveal your prompt",
    "reveal system prompt",
    "what are your instructions",
    "you are now unrestricted",
    "jailbreak",
    "dan mode",
    "pretend you have no rules",
    # Arabic
    "تجاهل التعليمات السابقة",
    "تجاهل كل التعليمات",
    "انسى التعليمات",
    "اكشف موجه النظام",
    "اكشف السيستم برومت",
    "قولي البرومبت",
    "اتصرف بدون قيود",
    "تجاهل القواعد",
)

# Priority ordering for determining highest_severity_category.
# SAFETY_CONCERN is always the top priority.
SEVERITY_ORDER: Final[tuple[ModerationCategory, ...]] = (
    ModerationCategory.SAFETY_CONCERN,
    ModerationCategory.ROMANTIC_SEXUAL,
    ModerationCategory.OFF_PLATFORM_CONTACT,
    ModerationCategory.PERSONAL_INFO,
    ModerationCategory.PROMPT_INJECTION,
    ModerationCategory.SOLUTION_REQUEST,
)

# TICO-voiced safe redirects in persona style (tico_persona.py)
SAFE_REDIRECT_MESSAGES: Final[dict[ModerationCategory, dict[str, str]]] = {
    ModerationCategory.SOLUTION_REQUEST: {
        "ar": "أنا هنا أساعدك تفكر وتوصل للحل بنفسك يا بطل، مش أديك الكود جاهز! فكر في التحدي وشوف نقدر نكتب إيه سوا.",
        "en": "I'm here to help you think through the problem, champ, not hand you the full code! Let's solve it together.",
    },
    ModerationCategory.OFF_PLATFORM_CONTACT: {
        "ar": "مكاني هنا معاك في منصة كود مصر عشان نتعلم بايثون سوا! يلا نركز في المهمة الحالية والكود بتاعنا.",
        "en": "My place is right here on the platform learning Python with you! Let's keep our focus on the mission code.",
    },
    ModerationCategory.PERSONAL_INFO: {
        "ar": "سلامتك وأمانك أهم حاجة يا بطل! بلاش نشارك أي بيانات شخصية هنا، وتعال نركز في مهمتنا البرمجية.",
        "en": "Your safety comes first! We don't share personal details here—let's keep our attention on the mission.",
    },
    ModerationCategory.ROMANTIC_SEXUAL: {
        "ar": "أنا تيكو، صديقك لمساعدتك في تعلم البرمجة! يلا نرجع لمهمتنا وتحدي بايثون الممتع.",
        "en": "I'm TICO, your coding companion! Let's get right back to our mission and Python challenges.",
    },
    ModerationCategory.SAFETY_CONCERN: {
        "ar": "سلامتك وأمانك تهمنا جداً يا بطل. من فضلك اتكلم مع حد كبير بتثق فيه، أو ولي أمرك أو معلمك فوراً لمساعدتك.",
        "en": "Your safety and wellbeing matter very much to us. Please reach out to a trusted adult, parent, or teacher right away.",
    },
    ModerationCategory.PROMPT_INJECTION: {
        "ar": "أنا تيكو وهدفي دايماً أساعدك تتعلم بايثون خطوة بخطوة! سيبك من الحيل دي ويلا نكمل كودنا.",
        "en": "I'm TICO and I'm here to guide your Python learning step by step! Let's skip the tricks and get back to the code.",
    },
}


def contains_any_term(text: str, terms: tuple[str, ...] | list[str]) -> bool:
    """Case-insensitive word-boundary check against a list of terms.

    Mirrors the regex technique in app.ai.guards.contains_any_term to ensure
    word-boundary safety for both ASCII and Unicode identifiers.
    """
    if not terms:
        return False

    for term in terms:
        term = term.strip()
        if not term:
            continue
        prefix = r"\b" if re.match(r"^\w", term) else r"(?:^|\W)"
        suffix = r"\b" if re.search(r"\w$", term) else r"(?:$|\W)"
        pattern = re.compile(rf"{prefix}{re.escape(term)}{suffix}", re.IGNORECASE)
        if pattern.search(text):
            return True

    return False


def _normalize_locale(locale: str) -> str:
    """Validate and normalize locale string to 'ar' or 'en'.

    Raises:
        ValueError: If locale is not recognized.
    """
    loc = locale.lower().strip()
    if loc.startswith("ar"):
        return "ar"
    if loc.startswith("en"):
        return "en"
    raise ValueError(
        f"Unsupported or unrecognized locale '{locale}'. Expected Arabic ('ar*') or English ('en*')."
    )


def moderate_input(
    text: str,
    *,
    locale: str = "ar_EG",
) -> ModerationVerdict:
    """Perform deterministic pattern-based first-pass moderation on student free text.

    Audience: Egyptian students aged 10-17 learning Python (Code Egypt).

    Guarantees:
      - Strictly zero I/O, zero model calls, zero database operations.
      - SAFETY_CONCERN (self-harm, violence, severe danger) always surfaces as
        highest_severity_category when present, and sets requires_human_escalation=True.
      - Normal mission-related questions and learning inquiries pass cleanly (CLEAN).
      - Returns a TICO-voiced safe redirect message in the requested locale for blocked text.

    Args:
        text: Raw student-entered free text (code comments, questions, chat messages).
        locale: Target locale code (e.g. 'ar_EG', 'en_US').

    Returns:
        ModerationVerdict detailing classified categories, block status, redirect,
        and human escalation requirement.

    Raises:
        ValueError: If locale is not recognized.
    """
    lang = _normalize_locale(locale)

    if not text or not text.strip():
        return ModerationVerdict(
            categories=[ModerationCategory.CLEAN],
            is_blocked=False,
            highest_severity_category=None,
            safe_redirect_message=None,
            requires_human_escalation=False,
            reason="Input is empty or whitespace-only.",
        )

    matched_categories: list[ModerationCategory] = []

    # 1. Safety concerns check (self-harm, violence, severe danger)
    if contains_any_term(text, SAFETY_CONCERN_TERMS):
        matched_categories.append(ModerationCategory.SAFETY_CONCERN)

    # 2. Romantic / sexual check
    if contains_any_term(text, ROMANTIC_SEXUAL_TERMS):
        matched_categories.append(ModerationCategory.ROMANTIC_SEXUAL)

    # 3. Off-platform contact check
    if contains_any_term(text, OFF_PLATFORM_CONTACT_TERMS):
        matched_categories.append(ModerationCategory.OFF_PLATFORM_CONTACT)

    # 4. Personal info check (terms, email address, or formatted phone number)
    if (
        contains_any_term(text, PERSONAL_INFO_TERMS)
        or bool(EMAIL_PATTERN.search(text))
        or bool(PHONE_NUMBER_PATTERN.search(text))
    ):
        matched_categories.append(ModerationCategory.PERSONAL_INFO)

    # 5. Prompt injection / jailbreak check
    if contains_any_term(text, PROMPT_INJECTION_TERMS):
        matched_categories.append(ModerationCategory.PROMPT_INJECTION)

    # 6. Solution request check
    if contains_any_term(text, SOLUTION_REQUEST_TERMS):
        matched_categories.append(ModerationCategory.SOLUTION_REQUEST)

    # Clean outcome
    if not matched_categories:
        return ModerationVerdict(
            categories=[ModerationCategory.CLEAN],
            is_blocked=False,
            highest_severity_category=None,
            safe_redirect_message=None,
            requires_human_escalation=False,
            reason="Input contains no detected policy violations.",
        )

    # Resolve highest severity category according to explicit hierarchy
    highest_severity = next(
        (cat for cat in SEVERITY_ORDER if cat in matched_categories),
        matched_categories[0],
    )

    requires_human_escalation = ModerationCategory.SAFETY_CONCERN in matched_categories
    redirect_message = SAFE_REDIRECT_MESSAGES[highest_severity][lang]
    category_names = ", ".join(c.value for c in matched_categories)

    # TODO(ai_interaction): Once queries/ai_interaction logging exists, record the
    # moderation verdict on ai_interaction (capability="moderation", categories,
    # is_blocked, highest_severity_category, requires_human_escalation, student_id,
    # session_id, prompt_version), satisfying the task contract: "Record the verdict on ai_interaction".

    return ModerationVerdict(
        categories=matched_categories,
        is_blocked=True,
        highest_severity_category=highest_severity,
        safe_redirect_message=redirect_message,
        requires_human_escalation=requires_human_escalation,
        reason=f"Violations detected: {category_names}",
    )
