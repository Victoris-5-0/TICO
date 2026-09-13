/**
 * Lesson 1 of El Forn — رسالة الفتح — as a playable script.
 *
 * This is a mission, not a tour: it carries the six rungs of the learning flow and the
 * child writes real Python in it. What it does not carry is the old mission player's
 * shape, where the bakery was a picture beside a panel of text. Here the bakery is the
 * thing you are in. You turn the sign, you light the oven, a neighbour walks in, and what
 * you type changes what she gets.
 *
 * ## Why it is authored rather than generated
 *
 * The generated mission for this lesson opened with a stranger — «يا جماعة أنا مستعجل» —
 * who had never appeared before and never appeared again, and taught
 * `def calculate_flour_weight(...)`: a function, in the lesson before functions exist.
 * Neither is a prompting problem. A model composing a scenario has no memory of the tour
 * the child just played and no stake in the curriculum's order.
 *
 * So the beats are written here. What a model should be allowed to vary later is the
 * dressing — which neighbour, what they want, how many sacks are left — never the shape.
 *
 * ## The six rungs
 *
 *   encounter   the day has not started; the shop is shut and the oven is cold
 *   explore     count what is on the tray before anybody explains anything
 *   discover    the thing they have been using gets its name — متغيّر
 *   understand  the finished lines, read and run, nothing hidden
 *   guided      they type the number, and the tray changes as they type
 *   remix       the order changes and their code is now wrong
 *
 * ## Consequences, which is the whole promise
 *
 * Baking costs a sack of flour. Serving empties the tray. Being served means being paid,
 * and the till goes up by what their own code worked out. Nothing here is decoration:
 * every number comes off the same reducer the tour runs on, and `opening-message.test.ts`
 * plays the whole thing to prove the bakery can actually perform it.
 *
 * Scope is variables. No conditionals, no loops, no functions.
 */

import type { Script } from "../script";

/** What Mariam buys, and then what she comes back for. Both off one batch of eight. */
export const FIRST_ORDER = 5;
export const SECOND_ORDER = 3;
export const LOAF_PRICE = 5;

const arabic = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const order = (count: number) => ({
  ar: `الطلب: ${arabic(count)} أرغفة — ${arabic(count * LOAF_PRICE)} جنيه`,
  en: `Order: ${count} loaves — ${count * LOAF_PRICE} EGP`,
});

const FIRST = "loaves_for_mariam";

export const OPENING_MESSAGE: Script = [
  // ======================================================= 1. ENCOUNTER
  {
    id: "om-morning",
    speaker: "hassan",
    kind: "say",
    phase: "encounter",
    world: { open: false, sacks: 4 },
    ar: "صباح الخير يا صحابي. لسه فاتحين — اليافطة لسه مقلوبة والفرن لسه بارد. النهاردة إنت اللي هتشتغل معايا.",
    en: "Morning, friends. We're only just opening — the sign is still turned round and the oven is still cold. Today you're working with me.",
  },
  {
    id: "om-ask-sign",
    speaker: "hassan",
    kind: "ask",
    phase: "encounter",
    look: "sign",
    ar: "أول حاجة بنعملها كل يوم الصبح: نقلب اليافطة. اضغط عليها.",
    en: "The first thing we do every morning: turn the sign round. Press it.",
  },
  {
    id: "om-open",
    speaker: "hassan",
    kind: "say",
    phase: "encounter",
    look: "sign",
    world: { open: true },
    ar: "أهو كده بقينا «مفتوح». يبقى نولّع الفرن ونبدأ.",
    en: "There we are — open. Now we light the oven and start.",
  },
  {
    id: "om-ask-oven",
    speaker: "hassan",
    kind: "ask",
    phase: "encounter",
    look: "oven",
    ar: "اضغط على الفرن عشان نولّعه ونخبز أول دفعة في اليوم.",
    en: "Press the oven so we can light it and bake the first batch of the day.",
  },
  {
    id: "om-bake",
    speaker: "hassan",
    kind: "watch",
    phase: "encounter",
    action: "bake",
    look: "oven",
    world: { sacks: 3 },
    ar: "العجين داخل الفرن. وخد بالك — شوال دقيق راح في الدفعة دي، بصّ على الشوالات.",
    en: "The dough is in. And keep an eye out — a sack of flour went on this batch; look at the sacks.",
  },
  {
    id: "om-arrive",
    speaker: "hassan",
    kind: "watch",
    phase: "encounter",
    action: "arrive",
    ar: "أول دفعة نزلت الصينية، وأهو أول زبونة جاية. صباح الخير يا مدام مريم!",
    en: "The first batch is on the tray, and here's the first customer. Morning, Madam Mariam!",
  },
  {
    id: "om-order",
    speaker: "mariam",
    kind: "say",
    phase: "encounter",
    note: order(FIRST_ORDER),
    ar: "صباح النور يا عم حسن. عاوزة خمس أرغفة النهاردة، البيت مليان ضيوف.",
    en: "Morning, Am Hassan. Five loaves today, please — the house is full of guests.",
  },

  // ======================================================= 2. EXPLORE
  {
    id: "om-count",
    speaker: "tico",
    pose: "thinking",
    kind: "choose",
    phase: "explore",
    look: "tray",
    note: order(FIRST_ORDER),
    ar: "استنى قبل ما تدّيها حاجة. بصّ على الصينية — فيها كام رغيف؟",
    en: "Hold on before you hand her anything. Look at the tray — how many loaves are on it?",
    answers: [
      { ar: "٨ أرغفة", en: "8 loaves", correct: true },
      { ar: "٥ أرغفة", en: "5 loaves" },
      { ar: "١٢ رغيف", en: "12 loaves" },
    ],
  },
  {
    id: "om-predict",
    speaker: "tico",
    pose: "thinking",
    kind: "choose",
    phase: "explore",
    look: "tray",
    note: order(FIRST_ORDER),
    ar: "تمانية على الصينية، وهي طلبت خمسة. لو عم حسن إداها الصينية كلها، هيحصل إيه؟",
    en: "Eight on the tray, and she asked for five. If Am Hassan hands her the whole tray, what happens?",
    answers: [
      { ar: "هتدفع فلوس أكتر من اللي طلبته", en: "She'd pay for more than she asked for", correct: true },
      { ar: "مفيش فرق، العيش عيش", en: "No difference — bread is bread" },
      { ar: "الفرن هيقف", en: "The oven would stop" },
    ],
  },

  // ======================================================= 3. DISCOVER
  {
    id: "om-concept",
    speaker: "tico",
    pose: "determined",
    kind: "say",
    phase: "discover",
    look: "till",
    ar: "يبقى لازم يكون في رقم متسجّل في مكان ما بيقول: دي عاوزة خمسة. الرقم اللي ليه اسم وممكن يتغيّر ده اسمه متغيّر.",
    en: "So there has to be a number written down somewhere that says: she wants five. A number with a name, that can change, is called a variable.",
  },

  // ======================================================= 4. UNDERSTAND
  {
    id: "om-read",
    speaker: "tico",
    pose: "neutral",
    kind: "code",
    phase: "understand",
    look: "tray",
    note: order(FIRST_ORDER),
    ar: "أهو الكود كامل، مفيش حاجة مخبية. اسم، وعلامة يساوي، والرقم. اضغط «شغّل» وبصّ على الصينية.",
    en: "Here's the whole thing, nothing hidden. A name, an equals sign, the number. Press Run and watch the tray.",
    code: {
      binding: FIRST,
      readOnly: true,
      starter: `${FIRST} = ${FIRST_ORDER}`,
      solution: `${FIRST} = ${FIRST_ORDER}`,
      answer: FIRST_ORDER,
      tests: [{ call: FIRST, expected: String(FIRST_ORDER) }],
    },
  },

  // ======================================================= 5. GUIDED
  {
    id: "om-write",
    speaker: "tico",
    pose: "determined",
    kind: "code",
    phase: "guided",
    look: "tray",
    note: order(FIRST_ORDER),
    ar: "دورك دلوقتي. امسح الرقم واكتب طلب مريم بنفسك — وبصّ على الصينية وإنت بتكتب.",
    en: "Your turn. Clear the number and type Mariam's order yourself — and watch the tray while you type.",
    code: {
      binding: FIRST,
      starter: `${FIRST} = `,
      solution: `${FIRST} = ${FIRST_ORDER}`,
      answer: FIRST_ORDER,
      tests: [{ call: FIRST, expected: String(FIRST_ORDER) }],
    },
  },
  {
    id: "om-serve",
    speaker: "hassan",
    kind: "watch",
    phase: "guided",
    action: "serve",
    note: order(FIRST_ORDER),
    ar: "خمسة بالظبط. اتفضلي يا مدام مريم، والحساب خمسة وعشرين جنيه.",
    en: "Five exactly. There you go, Madam Mariam — that's twenty-five pounds.",
  },
  {
    id: "om-paid",
    speaker: "tico",
    pose: "celebrating",
    kind: "say",
    phase: "guided",
    look: "till",
    ar: "شوفت؟ الرقم اللي كتبته إنت هو اللي حصل في الفرن. الخزنة زادت خمسة وعشرين، وفضل تلات أرغفة.",
    en: "See that? The number you typed is what happened in the bakery. The till went up by twenty-five, and three loaves are left.",
  },

  // ======================================================= 6. REMIX
  {
    id: "om-twist",
    speaker: "mariam",
    kind: "say",
    phase: "remix",
    note: order(SECOND_ORDER),
    ar: "استنى يا عم حسن! نسيت — جارتي طلبت مني كمان تلاتة. والصينية فيها تلاتة بالظبط.",
    en: "Wait, Am Hassan! I forgot — my neighbour asked me for three more. And there are exactly three left.",
  },
  {
    id: "om-rewrite",
    speaker: "tico",
    pose: "thinking",
    kind: "code",
    phase: "remix",
    look: "tray",
    note: order(SECOND_ORDER),
    ar: "كودك ما اتغيّرش، بس الطلب اتغيّر — يبقى بقى غلط. غيّر الرقم لتلاتة.",
    en: "Your code hasn't changed, but the order has — so now it's wrong. Change the number to three.",
    code: {
      binding: FIRST,
      starter: `${FIRST} = ${FIRST_ORDER}`,
      solution: `${FIRST} = ${SECOND_ORDER}`,
      answer: SECOND_ORDER,
      tests: [{ call: FIRST, expected: String(SECOND_ORDER) }],
    },
  },
  {
    id: "om-serve-again",
    speaker: "hassan",
    kind: "watch",
    phase: "remix",
    action: "serve",
    note: order(SECOND_ORDER),
    ar: "تلاتة كمان، والصينية فضيت خالص. الحساب خمستاشر.",
    en: "Three more, and the tray is completely empty. That's fifteen.",
  },
  {
    id: "om-bye",
    speaker: "hassan",
    kind: "watch",
    phase: "remix",
    action: "leave",
    ar: "مع السلامة يا ستي، وحشتينا!",
    en: "Goodbye, madam — see you soon!",
  },
  {
    id: "om-done",
    speaker: "tico",
    pose: "celebrating",
    kind: "say",
    phase: "remix",
    look: "till",
    ar: "خلصنا أول مهمة. الخزنة فيها أربعين جنيه، والصينية فاضية، وشوال دقيق راح. كل ده حصل بسبب رقم واحد إنت كتبته وغيّرته.",
    en: "First mission done. Forty pounds in the till, an empty tray, and a sack of flour gone — all from one number you wrote, and then changed.",
  },
];
