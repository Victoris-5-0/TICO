/**
 * The opening of the game: Am Hassan walks a child around his bakery.
 *
 * No code, no editor, no blanks, and — deliberately — **no model call**. Every line below
 * is authored. This is the first ninety seconds a child and a judge ever see, and the plan
 * for it was settled on 12 September 2026: author the beats, generate the dressing. There
 * is nothing here for a model to work out, so there is nothing here to fail.
 *
 * ## How it plays
 *
 * Two kinds of stop, alternating:
 *
 *   ask    Am Hassan says "press the oven". That prop, and only that prop, lights up and
 *          can be clicked. Nothing else moves until the child clicks it.
 *   say    he explains what they just pressed. Next, or a click anywhere, moves on.
 *
 * The child does something before they are told anything, every single time. That is the
 * whole design: a ten-year-old is not reading a tour, they are pressing things in a shop
 * and being told what they found.
 *
 * ## Rules this file follows
 *
 * **The camera never moves.** There is no zoom and no pan — the scene is one wide stage,
 * every prop is on it from the first frame, and pointing at something is done by lighting
 * it up. A stage that rearranges itself is a stage nobody can learn the shape of, and a
 * child who is hunting for where the picture went is not listening.
 *
 * **One line per stop.** It lets the child set the pace, and it lets Hassan and TICO trade
 * lines without either of them interrupting the other.
 *
 * **Variables, conditionals and loops only.** Functions are out of scope for this mechanic
 * and must not be added here.
 *
 * ## The arc
 *
 * Each station plants one idea and never names it as a lesson:
 *
 *   flour      how many        counting
 *   oven       press it        a command
 *   gauge      one number      a value
 *   tray       always eight    a constant
 *   board      left too long   a condition
 *   tickets    in order        sequence
 *   till       up and down     a variable
 *   clipboard  one by one      a loop
 *
 * ## Editing this file
 *
 * It is meant to be edited by a person, not generated. `ar` is the line as spoken; `en` is
 * a working translation so an English-locale judge is not shown a screen they cannot read.
 * The two opening lines are Ahmed's own words, reproduced exactly as written — do not
 * smooth them.
 */

import type { Script, Stop } from "./script";

export type { Script, Stop, Speaker, TicoPose, LessonPhase } from "./script";
/** The old name for a stop, kept because the tour's tests and player both use it. */
export type TourStop = Stop;

/** What the one scripted customer in the tour buys, and what it costs her. */
export const ORDER_LOAVES = 5;
export const ORDER_TOTAL = 25;

export const TOUR: Script = [
  // ------------------------------------------------------------------ arrival
  // The shop is open and everything is already out on the tables — but nobody is in it
  // except Hassan and TICO. The eight customers arrive with the missions, not before.
  {
    id: "tico-hello",
    speaker: "tico",
    pose: "neutral",
    kind: "say",
    ar: "ازيكم يا اصحابي انا تيكو صاحبكم ال هيعلمكم البرمجة وهيخليكم تمشوا معايا في عوالم ومغامرات كتير ونحل مشاكل بلدنا حبيبتنا مصر اول عالم هنقابله هيكون معانا عالم فرن عم حسن",
    en: "Hey friends! I'm TICO, and I'm the one who's going to teach you programming — we'll travel through all kinds of worlds and adventures together, and solve problems in our beloved Egypt. The first world we'll meet is Am Hassan's bakery.",
  },
  {
    id: "hassan-hello",
    speaker: "hassan",
    kind: "say",
    look: "hassan",
    ar: "ازيك يا تيكو ازيكوا يا عيال انا عم حسن عندي فرن وبيجلي ناس كتير وبيحصل مشاكل عاوزكم تحلوها معايا بالبرمجة بس قبل اي حاجة عاوز اوريكم كل حاجة بتحصل في الفرن",
    en: "Welcome, TICO! Welcome, kids. I'm Am Hassan. I've got a bakery — plenty of people come through, and plenty of problems come with them, and I want you to solve them with me using programming. But before anything else, I want to show you everything that happens in this bakery.",
  },
  {
    id: "hassan-rules",
    speaker: "hassan",
    kind: "say",
    ar: "هقولكم على كل حاجة هنا، بس مش هتفرّجوا بس. كل شوية هقولكم اضغطوا على حاجة — اضغطوا عليها وأنا أحكيلكم هي بتعمل إيه.",
    en: "I'll tell you about everything in here — but you're not just going to watch. Every so often I'll ask you to press something. Press it, and I'll tell you what it does.",
  },

  // -------------------------------------------------------------------- flour
  {
    id: "ask-flour",
    speaker: "hassan",
    kind: "ask",
    look: "flour-sacks",
    ar: "نبدأ من الأول خالص. اضغط على شوالات الدقيق اللي واقفة على ناحية الشمال.",
    en: "Let's start right at the beginning. Press the flour sacks standing over on the left.",
  },
  {
    id: "flour",
    speaker: "hassan",
    kind: "say",
    look: "flour-sacks",
    ar: "كل رغيف عيش في مصر بيبدأ من هنا. وأول سؤال بسأله لنفسي كل يوم الصبح: الشوال ده هيطلّع كام رغيف؟",
    en: "Every loaf of bread in Egypt starts right here. And the first question I ask myself every morning is this: how many loaves will this sack make?",
  },
  {
    id: "flour-tico",
    speaker: "tico",
    pose: "thinking",
    kind: "say",
    look: "flour-sacks",
    ar: "خد بالك من الكلمة دي — «كام». أي حاجة تقدر تعدّها، البرمجة تقدر تمسكها.",
    en: "Listen to that word — how many. Anything you can count, programming can hold on to.",
  },

  // -------------------------------------------------------------------- dough
  {
    id: "ask-dough",
    speaker: "hassan",
    kind: "ask",
    look: "dough-table",
    ar: "دلوقتي اضغط على ترابيزة العجين اللي جنب الفرن.",
    en: "Now press the dough table next to the oven.",
  },
  {
    id: "dough",
    speaker: "hassan",
    kind: "say",
    look: "dough-table",
    ar: "بنعجن الدقيق بالميّة والملح، وبنقسّمه كور. كل كورة من دول هتبقى رغيف واحد.",
    en: "We mix the flour with water and salt, then split it into balls. Every one of these becomes exactly one loaf.",
  },

  // --------------------------------------------------------------------- oven
  {
    id: "ask-oven",
    speaker: "hassan",
    kind: "ask",
    look: "oven",
    ar: "اضغط على الفرن نفسه — الطوبة الكبيرة اللي فيها النار.",
    en: "Press the oven itself — the big brick one with the fire in it.",
  },
  {
    id: "oven",
    speaker: "hassan",
    kind: "say",
    look: "oven",
    ar: "ودي أغلى حاجة عندي في المحل. بدخّل العجين جوّه، وبعد شوية يطلع عيش.",
    en: "And this is the most precious thing I own. The dough goes in, and a little while later, bread comes out.",
  },
  {
    id: "ask-gauge",
    speaker: "hassan",
    kind: "ask",
    look: "oven-gauge",
    ar: "بص فوق شوية. اضغط على الساعة الصغيرة اللي على وش الفرن.",
    en: "Look a bit higher. Press the little gauge on the front of the oven.",
  },
  {
    id: "gauge",
    speaker: "hassan",
    kind: "say",
    look: "oven-gauge",
    ar: "دي بتقولّي الفرن سخن قد إيه. رقم واحد بس — وعليه العيش كله.",
    en: "This tells me how hot the oven is. Just one number — and all the bread depends on it.",
  },

  // ----------------------------------------------------------- the first press
  {
    id: "bake",
    speaker: "tico",
    pose: "determined",
    kind: "ask",
    look: "oven",
    ar: "تعالى نجرّب حاجة. اضغط على الفرن تاني — بس المرة دي هو هيشتغل فعلاً.",
    en: "Let's try something. Press the oven again — only this time it's actually going to work.",
  },
  {
    id: "bake-run",
    speaker: "tico",
    pose: "determined",
    kind: "watch",
    action: "bake",
    look: "oven",
    ar: "أهو! العجين داخل الفرن، والنار شغّالة. استنى شوية وهيطلع عيش.",
    en: "There it goes! The dough is in and the fire is up. Give it a moment and bread comes out.",
  },
  {
    id: "bake-after",
    speaker: "tico",
    pose: "celebrating",
    kind: "say",
    look: "tray",
    ar: "شوفت؟ إنت لسه قلت للفرن يعمل حاجة، وهو عملها. دي البرمجة بالظبط، مفيش حاجة تانية.",
    en: "See that? You just told the oven to do something, and it did it. That is exactly what programming is — there's nothing more to it.",
  },

  // --------------------------------------------------------------------- tray
  {
    id: "ask-tray",
    speaker: "hassan",
    kind: "ask",
    look: "tray",
    ar: "اضغط على الصينية اللي نزل عليها العيش.",
    en: "Press the tray the bread landed on.",
  },
  {
    id: "tray",
    speaker: "hassan",
    kind: "say",
    look: "tray",
    ar: "الصينية دي بتشيل تمن أرغفة. لا أكتر ولا أقل، من ساعة ما اشتريتها.",
    en: "This tray holds eight loaves. No more, no less — it has since the day I bought it.",
  },
  {
    id: "tray-tico",
    speaker: "tico",
    pose: "neutral",
    kind: "say",
    look: "tray",
    ar: "تمنية. رقم ثابت مش بيتغيّر أبدًا. افتكره، هنحتاجه كتير.",
    en: "Eight. A fixed number that never changes. Remember it — we'll need it a lot.",
  },

  // ------------------------------------------------------------- the order list
  {
    id: "ask-clipboard",
    speaker: "hassan",
    kind: "ask",
    look: "order-clipboard",
    ar: "اضغط على الورقة المعلّقة على الحيطة جوّه المحل.",
    en: "Press the sheet hanging on the wall inside the shop.",
  },
  {
    id: "clipboard",
    speaker: "hassan",
    kind: "say",
    look: "order-clipboard",
    ar: "دي فيها طلبات النهاردة كلها. بمشي عليها واحدة واحدة لحد ما تخلص.",
    en: "That has all of today's orders on it. I work my way down it, one by one, until it's finished.",
  },
  {
    id: "clipboard-tico",
    speaker: "tico",
    pose: "determined",
    kind: "say",
    look: "order-clipboard",
    ar: "واحدة واحدة لحد ما تخلص — الحاجة دي اسمها تكرار. ومن أقوى حاجة هتتعلمها.",
    en: "One by one until it's finished — that's called a loop. And it's one of the most powerful things you'll ever learn.",
  },

  // ------------------------------------------------------------------ tickets
  {
    id: "ask-tickets",
    speaker: "hassan",
    kind: "ask",
    look: "ticket-stand",
    ar: "اضغط على العمود النحاس الصغير اللي في آخر الكاونتر.",
    en: "Press the little brass stand at the end of the counter.",
  },
  {
    id: "tickets",
    speaker: "hassan",
    kind: "say",
    look: "ticket-stand",
    ar: "دي أرقام الدور. كل واحد بياخد رقم، وأنا بنادي بالترتيب. محدش بياخد دور حد.",
    en: "Those are the turn numbers. Everyone takes one, and I call them in order. Nobody takes anybody else's turn.",
  },
  {
    id: "tickets-tico",
    speaker: "tico",
    pose: "neutral",
    kind: "say",
    look: "ticket-stand",
    ar: "بالترتيب — واحد ورا التاني. الكمبيوتر بيشتغل كده بالظبط، سطر ورا سطر.",
    en: "In order — one after another. That's exactly how a computer works: line after line.",
  },

  // --------------------------------------------------------------------- till
  {
    id: "ask-till",
    speaker: "hassan",
    kind: "ask",
    look: "till",
    ar: "تعالى على الترابيزة اللي برّه. اضغط على الخزنة الخضرا.",
    en: "Come over to the table outside. Press the green till.",
  },
  {
    id: "till",
    speaker: "hassan",
    kind: "say",
    look: "till",
    ar: "كل بيعة بتزوّد اللي جوّه دي، وكل شوال دقيق بشتريه بيقلّله.",
    en: "Every sale adds to what's inside it, and every sack of flour I buy takes from it.",
  },
  {
    id: "till-tico",
    speaker: "tico",
    pose: "thinking",
    kind: "say",
    look: "till",
    ar: "رقم بيزيد وبيقلّ على طول. ده اللي إحنا بنسميه متغيّر.",
    en: "A number that keeps going up and down. That's what we call a variable.",
  },

  // -------------------------------------------------------------------- scale
  {
    id: "ask-scale",
    speaker: "hassan",
    kind: "ask",
    look: "scale",
    ar: "اضغط على الميزان اللي على الترابيزة التانية.",
    en: "Press the scale on the second table.",
  },
  {
    id: "scale",
    speaker: "hassan",
    kind: "say",
    look: "scale",
    ar: "والميزان ده مش زينة. الزبون بيدفع على الوزن، مش على الكلام.",
    en: "And that scale isn't decoration. A customer pays by weight, not by talk.",
  },

  // --------------------------------------------------------------------- bags
  {
    id: "ask-bags",
    speaker: "hassan",
    kind: "ask",
    look: "paper-bag-stack",
    ar: "اضغط على رزمة الورق اللي جنب الميزان.",
    en: "Press the stack of paper next to the scale.",
  },
  {
    id: "bags",
    speaker: "hassan",
    kind: "say",
    look: "paper-bag-stack",
    ar: "العيش السخن لازم يتلفّ. شنطة ورق لكل زبون، عشان يوصل بيته وهو لسه دافي.",
    en: "Hot bread has to be wrapped. A paper bag for every customer, so it's still warm when they get home.",
  },

  // -------------------------------------------------------------- burnt bread
  {
    id: "ask-board",
    speaker: "hassan",
    kind: "ask",
    look: "bread-board",
    ar: "بص على اللوح اللي على الأرض قدام الترابيزة. اضغط عليه.",
    en: "Look at the board on the ground in front of the table. Press it.",
  },
  {
    id: "board",
    speaker: "hassan",
    kind: "say",
    look: "bread-board",
    ar: "شايف الرغيف الأسود ده؟ ده نسيته جوّه الفرن. وقت أطول من اللازم، وخلاص.",
    en: "See that black loaf? I forgot that one inside the oven. A little longer than it should have been, and that was that.",
  },
  {
    id: "board-tico",
    speaker: "tico",
    pose: "thinking",
    kind: "say",
    look: "bread-board",
    ar: "لو الوقت زاد، العيش يتحرق. الحاجة دي اسمها شرط — «لو».",
    en: "If the time goes over, the bread burns. That thing right there is a condition — an if.",
  },

  // ----------------------------------------------------------------- delivery
  {
    id: "ask-scooter",
    speaker: "hassan",
    kind: "ask",
    look: "scooter-crate",
    ar: "آخر حاجة. اضغط على الموتوسيكل اللي في آخر الشارع.",
    en: "Last thing. Press the scooter at the end of the street.",
  },
  {
    id: "scooter",
    speaker: "hassan",
    kind: "say",
    look: "scooter-crate",
    ar: "واللي مش قادر ييجي لحد عندنا، إحنا بنوصّله. الصندوق ده بيلف الحارة كلها.",
    en: "And whoever can't make it to us, we deliver to. That crate goes round the whole neighbourhood.",
  },

  // -------------------------------------------------------------------- close
  {
    id: "close",
    speaker: "hassan",
    kind: "say",
    ar: "أهو كده تكون شوفت الفرن كله. وكل حاجة هنا إمّا رقم، أو ترتيب، أو شرط.",
    en: "There — now you've seen the whole bakery. And everything in here is either a number, an order, or a condition.",
  },
  {
    id: "close-tico",
    speaker: "tico",
    pose: "celebrating",
    kind: "say",
    ar: "وإحنا هنتعلّم نقول للفرن يعمل ده كله بالكود. بدل ما نلعب بالزراير، هنبنيه بالبرمجة.",
    en: "And we're going to learn how to tell the bakery all of it in code. Instead of playing with buttons — we'll build it with programming.",
  },

  // ====================================================== the first customer
  // Everything here runs on the real reducer: she walks in on `arriving`, the loaves move
  // to her hands on `handover`, the note goes into the till on `paying`, and she walks out
  // on `exiting`. None of it is mimed.
  //
  // She is served from the batch baked earlier in the tour rather than a fresh one. The
  // tray still holds those eight and a second bake would be refused as a full tray — and
  // it earns the subtraction TICO does once she has gone.
  {
    id: "customer-coming",
    speaker: "hassan",
    kind: "say",
    ar: "استنى بس… أهو جه أول زبون النهاردة. تعالى نشوف الشغل بيمشي إزاي من الأول للآخر.",
    en: "Hold on — here comes the first customer of the day. Let's watch how the work goes, start to finish.",
  },
  {
    id: "customer-arrives",
    speaker: "hassan",
    kind: "watch",
    action: "arrive",
    ar: "أهلاً وسهلاً يا مدام مريم! اتفضلي يا ستي.",
    en: "Welcome, Madam Mariam! Come right in.",
  },
  {
    id: "customer-order",
    speaker: "mariam",
    kind: "say",
    note: { ar: "الطلب: ٥ أرغفة — ٢٥ جنيه", en: "Order: 5 loaves — 25 EGP" },
    ar: "ازيك يا عم حسن، كنت عاوزة خمس أرغفة عيش بلدي لو سمحت.",
    en: "Morning, Am Hassan. I'd like five loaves of baladi bread, please.",
  },
  {
    id: "ask-order-sheet",
    speaker: "hassan",
    kind: "ask",
    look: "order-clipboard",
    note: { ar: "الطلب: ٥ أرغفة — ٢٥ جنيه", en: "Order: 5 loaves — 25 EGP" },
    ar: "حاضر يا ستي. اضغط على ورقة الطلبات عشان أكتبلها الطلب.",
    en: "Right away. Press the order sheet so I can write her order down.",
  },
  {
    id: "order-written",
    speaker: "hassan",
    kind: "say",
    look: "order-clipboard",
    note: { ar: "الطلب: ٥ أرغفة — ٢٥ جنيه", en: "Order: 5 loaves — 25 EGP" },
    ar: "أهو اتكتب: خمس أرغفة، بخمسة وعشرين جنيه. الورقة دي هي اللي بتفكّرني.",
    en: "Written down: five loaves, twenty-five pounds. This sheet is the thing that remembers it for me.",
  },
  {
    id: "stock-tico",
    speaker: "tico",
    pose: "thinking",
    kind: "say",
    look: "tray",
    note: { ar: "الطلب: ٥ أرغفة — ٢٥ جنيه", en: "Order: 5 loaves — 25 EGP" },
    ar: "العيش اللي خبزناه من شوية لسه في الصينية — تمن أرغفة. وهي عاوزة خمسة.",
    en: "The bread we baked a minute ago is still on the tray — eight loaves. And she wants five.",
  },
  {
    id: "ask-handover",
    speaker: "hassan",
    kind: "ask",
    look: "tray",
    note: { ar: "الطلب: ٥ أرغفة — ٢٥ جنيه", en: "Order: 5 loaves — 25 EGP" },
    ar: "اضغط على الصينية عشان أدّيها طلبها.",
    en: "Press the tray so I can hand her the order.",
  },
  {
    id: "handover-run",
    speaker: "hassan",
    kind: "watch",
    action: "serve",
    note: { ar: "الطلب: ٥ أرغفة — ٢٥ جنيه", en: "Order: 5 loaves — 25 EGP" },
    ar: "اتفضلي يا ستي — خمس أرغفة سخنين، والحساب خمسة وعشرين.",
    en: "There you go — five warm loaves, and that will be twenty-five.",
  },
  {
    id: "paid",
    speaker: "mariam",
    kind: "say",
    ar: "تسلم إيدك يا عم حسن. أهو الحساب، وكتر خيرك.",
    en: "Thank you, Am Hassan. Here is the money — much appreciated.",
  },
  {
    id: "money-tico",
    speaker: "tico",
    pose: "celebrating",
    kind: "say",
    look: "till",
    ar: "وبص على الخزنة فوق — زادت خمسة وعشرين جنيه. كل بيعة بتغيّر الرقم ده، وده اللي قلنا عليه متغيّر.",
    en: "And look at the till total up there — it went up by twenty-five pounds. Every sale changes that number, and that is the variable we talked about.",
  },
  {
    id: "left-over",
    speaker: "tico",
    pose: "thinking",
    kind: "say",
    look: "tray",
    ar: "وكان في تمنية، وخدت خمسة. فضل تلاتة. الحسبة دي بالظبط هي اللي هتخلّي الكود يعملها بدالك.",
    en: "There were eight, she took five, so three are left. That little sum is exactly the kind of thing your code will do for you.",
  },
  {
    id: "goodbye",
    speaker: "hassan",
    kind: "watch",
    action: "leave",
    ar: "مع السلامة يا ستي، وحشتينا!",
    en: "Goodbye, madam — see you soon!",
  },
  {
    id: "wrap",
    speaker: "tico",
    pose: "celebrating",
    kind: "say",
    ar: "أهو ده الشغل كله: طلب، عيش، فلوس. وإحنا هنتعلّم نخلّي الكود يمشّي الدايرة دي كلها لوحدها.",
    en: "That is the whole job: an order, the bread, the money. And we are going to learn how to make code run that whole loop by itself.",
  },
];

/**
 * What each thing is called, for the accessible name on a prop the child has to click.
 *
 * `oven`, `tray` and `hassan` are in here too: the tour points at them, but they are drawn
 * by `bakeryScene` as fixtures and actors rather than by `worldProps`.
 */
export const PROP_NAMES: Record<string, { ar: string; en: string }> = {
  hassan: { ar: "عم حسن", en: "Am Hassan" },
  mariam: { ar: "مدام مريم", en: "Madam Mariam" },
  oven: { ar: "الفرن", en: "the oven" },
  tray: { ar: "الصينية", en: "the tray" },
  "flour-sacks": { ar: "شوالات الدقيق", en: "the flour sacks" },
  "dough-table": { ar: "ترابيزة العجين", en: "the dough table" },
  "oven-gauge": { ar: "ساعة الفرن", en: "the oven gauge" },
  "bread-board": { ar: "لوح العيش", en: "the bread board" },
  scale: { ar: "الميزان", en: "the scale" },
  "ticket-stand": { ar: "أرقام الدور", en: "the ticket stand" },
  till: { ar: "الخزنة", en: "the till" },
  "paper-bag-stack": { ar: "شنط الورق", en: "the paper bags" },
  "order-clipboard": { ar: "ورقة الطلبات", en: "the order sheet" },
  "scooter-crate": { ar: "موتوسيكل التوصيل", en: "the delivery scooter" },
};

export const propName = (name: string, ar: boolean) =>
  PROP_NAMES[name] ? (ar ? PROP_NAMES[name].ar : PROP_NAMES[name].en) : name;
