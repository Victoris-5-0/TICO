/**
 * What TICO says as he walks the progress page, and which panel he says it beside.
 *
 * He is a real element that moves between the cards rather than an illustration parked in
 * a corner: he scrolls to a panel, the panel lifts, and he says what its numbers mean. A
 * dashboard is the one screen a learner is most likely to misread, and a number nobody
 * explains is a number that worries them.
 *
 * Three rules it follows:
 *
 *   - He is there on arrival, not behind a button. He is the guide for the rest of the
 *     journey and this page should not be the one place you have to summon him. Skip and
 *     Escape both dismiss him, and he does not come back until the page is reloaded.
 *   - Every line is authored, in both languages. No model call, so there is nothing to
 *     fail and nothing to review at runtime.
 *   - `prefers-reduced-motion` removes the walk and the scroll animation but keeps the
 *     tour, because the words are the point and the movement is decoration.
 */

/** The four drawings that exist. Anything else would be a missing image. */
type Pose = "neutral" | "thinking" | "determined" | "celebrating";

export type Stop = {
  /** `data-tour` on the panel he should stand beside. */
  target: string;
  pose: Pose;
  ar: string;
  en: string;
};

/**
 * What he says, and where. Authored rather than generated: these explain a fixed layout,
 * so there is nothing for a model to work out, and a first-run explanation is not the
 * place to discover the model is having a bad afternoon.
 */
export const TOUR: Stop[] = [
  {
    target: "stats",
    pose: "neutral",
    ar: "أهلاً! أنا تيكو. الصفحة دي بتحكيلك إنت بتتعلّم إزاي — مش بس إنت عملت كام. تعالى أوريك.",
    en: "Hi! I'm TICO. This page tells you *how* you're learning, not just how much. Let me show you.",
  },
  {
    target: "streak",
    pose: "determined",
    ar: "كل مربع يوم. كل ما ترجع أكتر، المربع بيغمق. المهم إنك ترجع تاني — مش إنك تقعد ساعات مرة واحدة.",
    en: "Each square is a day, and it darkens the more you come back. Returning matters more than one long sitting.",
  },
  {
    target: "concepts",
    pose: "determined",
    ar: "كل مفهوم ليه ٣ محطات. لو محتاج وقت أكتر، الطريق بيطوّل لحد ٦ — وبعدها بنكمّل على أي حال، مش هنسيبك واقف.",
    en: "Each concept has 3 stops. If you need longer the path grows to 6 — then we move on anyway. Nobody gets stuck.",
  },
  {
    target: "tags",
    pose: "celebrating",
    ar: "دي أحلى حاجة هنا. الأخضر معناه غلطة كنت بتعملها وبعدين بطّلت. ده مش حظ — ده إنك فهمت.",
    en: "This is the best part. Green means a mistake you used to make and then stopped. That isn't luck — that's you understanding it.",
  },
  {
    target: "split",
    pose: "thinking",
    ar: "الغلطات بتاعتك في كتابة بايثون نفسها، ولا في التفكير في الحل؟ الاتنين طبيعيين، بس كل واحد محتاج مساعدة مختلفة.",
    en: "Are your mistakes in writing Python, or in working out the answer? Both are normal — but each needs different help.",
  },
  {
    target: "hints",
    pose: "neutral",
    ar: "طلب التلميح مش ضعف. بس لو بتوصل للدرجة ٤ كتير، يبقى المهمة صعبة زيادة — ودي مشكلتنا إحنا مش مشكلتك.",
    en: "Asking for a hint isn't weakness. But if you reach rung 4 a lot, the mission is too hard — and that's our problem, not yours.",
  },
  {
    target: "sessions",
    pose: "celebrating",
    ar: "وأخيراً، آخر المهام اللي لعبتها. كل رقم هنا متعدّ من شغلك الحقيقي — مفيش حاجة متخمّنة. يلا نكمّل!",
    en: "And finally, your recent missions. Every number here is counted from your real work — nothing estimated. Let's keep going!",
  },
];
