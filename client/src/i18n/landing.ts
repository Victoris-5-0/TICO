import "server-only";
import type { Locale } from "@/i18n/config";

type LandingCopy = {
  signUp: string; login: string; contact: string; social: string; payments: string;
  contactIntro: string; helpCenter: string; furtherQuestions: string; contactPending: string; comingSoon: string;
  home: string; navigation: string; play: string; challenges: string; about: string;
  start: string; title: readonly [string, string, string]; subtitle: string; body: string;
  how: string; howBefore: string; howAfter: string;
  steps: readonly { title: string; body: string }[];
  previewTitle: string; previewBody: string; previewAction: string; deviceNote: string;
  worldsTitle: string; world: string; quest: string; ctaTitle: string; ctaBody: string;
  explore: string; questionsTitle: string; faqs: readonly { question: string; answer: string }[];
  footerBody: string;
};

export const landingCopy = {
  en: {
    signUp: "Sign Up", login: "Log In", contact: "Contact Us", social: "Social Links", payments: "Payment methods",
    contactIntro: "For answers to frequently asked questions visit our", helpCenter: "help center",
    furtherQuestions: "For further questions", contactPending: "Our contact details will be available here soon.", comingSoon: "Coming soon",
    home: "TICO home", navigation: "Main navigation", play: "Play", challenges: "Challenges", about: "About",
    start: "Start Playing", title: ["Learn Coding", "Through Challenges", "& Games With"],
    subtitle: "Play and Code With Tico",
    body: "TICO turns coding from memorization into adventure. Solve real-world problems by writing code that brings each scene to life.",
    how: "How It Works", howBefore: "How", howAfter: "Works",
    steps: [
      { title: "Start", body: "Start your journey with your first coding challenge. Understand the problem and work your way to the solution." },
      { title: "Solve", body: "Write real Python to solve everyday problems and watch the results play out right in front of you." },
      { title: "Get a Hint", body: "TICO offers step-by-step hints to help you find your own solution to each challenge." },
      { title: "Level Up", body: "Build your skills, unlock the next lesson, and take on increasingly complex problems." },
    ],
    previewTitle: "See your code come to life",
    previewBody: "Your journey begins at the neighborhood bakery. Meet the world behind your first Python adventure.",
    previewAction: "Explore the first world",
    deviceNote: "Explore on any device. For coding, use a laptop or a tablet in landscape.",
    worldsTitle: "Explore Some of Our Challenges", world: "WORLD", quest: "JOIN THE QUEST",
    ctaTitle: "Ready to Start Your Coding Adventure?",
    ctaBody: "Learn real Python with TICO. Solve everyday problems, build your confidence, and follow your own progress through Egypt.",
    explore: "Explore Map", questionsTitle: "Frequently asked questions",
    faqs: [
      { question: "Do I need any coding experience?", answer: "Start with your first variable, then work through conditions, loops, and functions. Each mission introduces a clear problem with examples and hints." },
      { question: "Can I learn in Arabic?", answer: "Yes. TICO supports Egyptian Arabic and English. Python keywords and code stay in English in both versions." },
      { question: "What happens if I get stuck?", answer: "Try again as often as you need and ask for a hint. Hints do not reduce your XP, and TICO helps you reason through the problem without giving away the solution." },
    ],
    footerBody: "TICO teaches programming by applying real Python to everyday problems. Through games and challenges, learners explore coding concepts and see them come to life in Egyptian worlds.",
  },
  "ar-EG": {
    signUp: "حساب جديد", login: "دخول", contact: "تواصل معنا", social: "تابعنا", payments: "طرق الدفع",
    contactIntro: "للإجابة عن الأسئلة الشائعة، زور", helpCenter: "مركز المساعدة",
    furtherQuestions: "لو عندك أسئلة تانية", contactPending: "بيانات التواصل هتكون متاحة هنا قريبًا.", comingSoon: "قريبًا",
    home: "الصفحة الرئيسية لتيكو", navigation: "التنقل الرئيسي", play: "العب", challenges: "التحديات", about: "عن تيكو",
    start: "ابدأ اللعب", title: ["اتعلّم البرمجة", "بالتحديات والألعاب", "مع"],
    subtitle: "العب واكتب كود مع تيكو",
    body: "تيكو بيحوّل البرمجة من حفظ لمغامرة. حل مشاكل من الحياة اليومية بكود بيخلّي كل مشهد يتحرك قدامك.",
    how: "إزاي بنلعب؟", howBefore: "إزاي", howAfter: "بيساعدك؟",
    steps: [
      { title: "ابدأ", body: "ابدأ رحلتك بأول تحدي برمجة. افهم المشكلة وجرّب توصل للحل خطوة بخطوة." },
      { title: "حل المشكلة", body: "اكتب بايثون حقيقي عشان تحل مشاكل من الحياة اليومية، وشوف نتيجة الكود قدامك." },
      { title: "اطلب تلميح", body: "تيكو بيساعدك بتلميحات تدريجية عشان تفكّر وتوصل لحل كل تحدي بنفسك." },
      { title: "طوّر مهاراتك", body: "ثبّت اللي اتعلّمته، وافتح الدرس اللي بعده، وجرّب تحل مشاكل أصعب مع كل خطوة." },
    ],
    previewTitle: "شوف الكود بيغيّر العالم قدامك",
    previewBody: "رحلتك بتبدأ من فرن العيش في الحي. اتعرّف على أول عالم في رحلة بايثون.",
    previewAction: "اتعرف على اول عالم",
    deviceNote: "استكشف من أي جهاز. لكتابة الكود، استخدم لابتوب أو تابلت بالعرض.",
    worldsTitle: "استكشف بعض تحدياتنا", world: "العالم", quest: "انضم للمغامرة",
    ctaTitle: "جاهز تبدأ مغامرتك في البرمجة؟",
    ctaBody: "اتعلّم بايثون حقيقي مع تيكو. حل مشاكل من يومك، وابني ثقتك، وتابع تقدّمك في رحلة من قلب مصر.",
    explore: "استكشف الخريطة", questionsTitle: "أسئلة شائعة",
    faqs: [
      { question: "محتاج أعرف برمجة قبل ما أبدأ؟", answer: "هتبدأ من أول متغيّر، وبعده الشروط والحلقات والدوال. كل مهمة بتقدّم مشكلة واضحة مع أمثلة وتلميحات تساعدك." },
      { question: "ينفع أتعلّم بالعربي؟", answer: "أيوه، تيكو بيدعم العربي المصري والإنجليزي. كلمات بايثون والكود بيفضلوا بالإنجليزي في النسختين." },
      { question: "أعمل إيه لو وقفت في مشكلة؟", answer: "جرّب تاني براحتك واطلب تلميح. التلميحات مش بتقلّل نقاط خبرتك، وتيكو بيساعدك تفكّر في المشكلة من غير ما يديك الحل." },
    ],
    footerBody: "تيكو بيعلّم البرمجة باستخدام بايثون لحل مشاكل من الحياة اليومية. من خلال الألعاب والتحديات، بتفهم مفاهيم البرمجة وبتشوفها بتتحرك في عوالم مصرية.",
  },
} as const satisfies Record<Locale, LandingCopy>;
