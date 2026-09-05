import "server-only";

import type { Locale } from "@/i18n/config";

const dictionaries = {
  "ar-EG": {
    skip: "تخطّى للمحتوى",
    brandTagline: "اتعلّم بايثون وإنت بتحل مشاكل من مصر",
    nav: { worlds: "العوالم", method: "طريقة التعلّم", signIn: "تسجيل الدخول" },
    hero: {
      eyebrow: "مغامرة برمجة مصرية",
      titleStart: "اكتب بايثون بجد.",
      titleAccent: "وساعد مصر تتحرك.",
      body: "من طابور العيش لشباك التذاكر وإشارات القاهرة — كل سطر كود بيحل مشكلة واضحة ويغيّر العالم قدامك.",
      primary: "ابدأ الرحلة",
      secondary: "شوف العوالم",
      codeLabel: "مهمة النهارده",
      run: "شغّل الكود",
      output: "النتيجة",
      success: "تمام! ٤٠ رغيف جاهزين للطابور.",
    },
    proof: ["بايثون حقيقي", "عربي وإنجليزي", "تعلّم على مهلك"],
    worlds: {
      eyebrow: "٣ عوالم · ١٨ مهمة",
      title: "كل محطة بتعلّمك فكرة جديدة",
      body: "رحلة مترتبة من أول متغيّر لحد محاكاة كاملة. مفيش أرواح بتخلص ولا خصم على طلب المساعدة.",
      missions: "مهمات",
      enter: "استكشف العالم",
    },
    method: {
      eyebrow: "إزاي TICO بيساعدك؟",
      title: "جرّب، شوف اللي حصل، وعدّل",
      steps: [
        { number: "٠١", title: "افهم المشكلة", body: "قصة قصيرة من مكان مصري مألوف، ومثال واضح للنتيجة المطلوبة." },
        { number: "٠٢", title: "اكتب بايثون", body: "Syntax حقيقي في محرر سريع، مش بلوكات ولا كود مزيف." },
        { number: "٠٣", title: "اتعلّم من المحاولة", body: "اختبارات فورية وتلميحات تدريجية من غير ما TICO يديك الحل." },
      ],
    },
    finalCta: { title: "أول رغيف مستني أول سطر كود.", body: "ابدأ بمهمة صغيرة، وخلّي TICO معاك خطوة بخطوة.", button: "افتح خريطة التعلّم" },
    footer: "صُمّم للتعلّم الآمن الممتع — من قلب مصر.",
    roadmap: {
      eyebrow: "خريطة التعلّم",
      title: "رحلتك في بايثون",
      body: "ابدأ بالفرن، وبعد ما تثبّت الأساسيات كمّل للمحطة وإشارات القاهرة.",
      back: "الرئيسية",
      progress: "٠ من ١٨ مهمة",
      current: "ابدأ من هنا",
      locked: "بيتفتح بعد العالم اللي قبله",
      lesson: "المهمة",
    },
  },
  en: {
    skip: "Skip to content",
    brandTagline: "Learn Python by solving problems from Egypt",
    nav: { worlds: "Worlds", method: "How it works", signIn: "Sign in" },
    hero: {
      eyebrow: "An Egyptian coding adventure",
      titleStart: "Write real Python.",
      titleAccent: "Help Egypt move.",
      body: "From the bread queue to the ticket window and Cairo traffic lights—every line of code solves a clear problem and changes the world in front of you.",
      primary: "Start the journey",
      secondary: "Meet the worlds",
      codeLabel: "Today’s mission",
      run: "Run code",
      output: "Output",
      success: "Great! 40 loaves are ready for the queue.",
    },
    proof: ["Real Python", "Arabic & English", "Learn at your pace"],
    worlds: {
      eyebrow: "3 worlds · 18 missions",
      title: "Every stop teaches a new idea",
      body: "A guided journey from your first variable to a complete simulation. No lives to lose and no penalty for asking for help.",
      missions: "missions",
      enter: "Explore world",
    },
    method: {
      eyebrow: "How does TICO help?",
      title: "Try, observe, and improve",
      steps: [
        { number: "01", title: "Understand the problem", body: "A short story from a familiar Egyptian place and a clear example of the goal." },
        { number: "02", title: "Write Python", body: "Real syntax in a fast editor—not blocks and not pretend code." },
        { number: "03", title: "Learn from the attempt", body: "Immediate tests and progressive hints without TICO handing over the answer." },
      ],
    },
    finalCta: { title: "The first loaf is waiting for your first line.", body: "Begin with one small mission and let TICO guide you step by step.", button: "Open the learning map" },
    footer: "Designed for safe, joyful learning—from the heart of Egypt.",
    roadmap: {
      eyebrow: "Learning map",
      title: "Your Python journey",
      body: "Begin at the bakery, then carry your foundations into the station and Cairo traffic control.",
      back: "Home",
      progress: "0 of 18 missions",
      current: "Start here",
      locked: "Unlocks after the previous world",
      lesson: "Mission",
    },
  },
} as const;

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
