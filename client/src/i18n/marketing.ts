import "server-only";
import type { Locale } from "@/i18n/config";

type MarketingCopy = {
  aboutTitle: string;
  about: readonly { title: string; body: string }[];
  pricingTitle: string; preview: string; experience: string;
  plans: readonly { name: string; subtitle: string; action: string }[];
  features: readonly string[]; unavailable: readonly string[];
  availability: string; availabilityBody: string; close: string; explore: string;
};

export const marketingCopy = {
  en: {
    aboutTitle: "About TICO",
    about: [
      { title: "ABOUT US", body: "Tico is an interactive coding learning platform designed to make programming simple, engaging, and enjoyable for students. Through game-based learning, interactive lessons, coding challenges, projects, and AI-powered guidance, Tico helps learners build real coding skills while learning at their own pace." },
      { title: "OUR MISSION", body: "To transform the way students learn programming by combining interactive education, gamification, practical projects, and personalized AI guidance, helping them build skills, stay motivated, and become independent problem-solvers." },
      { title: "OUR VISION", body: "To create a future where every student can learn programming with confidence, curiosity, and enjoyment, making coding accessible and exciting for everyone." },
    ],
    pricingTitle: "TICO plans",
    preview: "Plan preview · Paid subscriptions are coming soon. Prices and plan details will be confirmed before purchase.",
    experience: "The TICO learning experience",
    plans: [
      { name: "Free Plan", subtitle: "Start your coding journey", action: "Explore TICO" },
      { name: "Premium", subtitle: "More room for discovery", action: "Get Premium" },
      { name: "Pro", subtitle: "Take your learning further", action: "Get Pro" },
    ],
    features: ["Real Python in your browser", "Interactive coding missions", "Contemporary Egyptian worlds", "Arabic and English", "Step-by-step learning", "Examples with each mission", "Hints when you need them", "Feedback on your code", "Learn at your own pace"],
    unavailable: ["Paid subscriptions coming soon", "Billing details to be announced"],
    availability: "Your next adventure is on its way",
    availabilityBody: "Paid plans are not available yet. We’ll confirm the billing period, included features, and final price before subscriptions open. You can explore TICO’s learning map in the meantime.",
    close: "Close", explore: "Explore the map",
  },
  "ar-EG": {
    aboutTitle: "عن تيكو",
    about: [
      { title: "عن تيكو", body: "تيكو منصة تفاعلية لتعلّم البرمجة، هدفها تخلي البرمجة بسيطة وممتعة وقريبة من الطلاب. من خلال التعلّم بالألعاب، والدروس التفاعلية، وتحديات البرمجة، والمشروعات، والمساعدة بالذكاء الاصطناعي، تيكو بيساعد كل متعلّم يبني مهارات برمجة حقيقية بالسرعة اللي تناسبه." },
      { title: "رسالتنا", body: "نغيّر طريقة تعلّم البرمجة عن طريق الجمع بين التعليم التفاعلي والألعاب والمشروعات العملية والمساعدة المخصصة بالذكاء الاصطناعي، عشان الطلاب يطوّروا مهاراتهم، ويفضل عندهم حماس، ويتعلّموا يحلّوا المشاكل بنفسهم." },
      { title: "رؤيتنا", body: "نبني مستقبل يقدر فيه كل طالب يتعلّم البرمجة بثقة وفضول واستمتاع، ونخلي البرمجة متاحة ومشوّقة للجميع." },
    ],
    pricingTitle: "خطط تيكو",
    preview: "معاينة الخطط · الاشتراكات المدفوعة قريبًا. هنأكد الأسعار وتفاصيل كل خطة قبل الشراء.",
    experience: "تجربة التعلّم مع تيكو",
    plans: [
      { name: "مجاني", subtitle: "ابدأ رحلتك في البرمجة", action: "استكشف تيكو" },
      { name: "بريميوم", subtitle: "مساحة أكبر للاكتشاف", action: "اختار بريميوم" },
      { name: "برو", subtitle: "خد تعلّمك لخطوة أبعد", action: "اختار برو" },
    ],
    features: ["بايثون حقيقي في المتصفح", "مهمات برمجة تفاعلية", "عوالم من مصر المعاصرة", "بالعربي والإنجليزي", "تعلّم خطوة بخطوة", "أمثلة مع كل مهمة", "تلميحات وقت ما تحتاج", "نتائج واضحة للكود", "اتعلّم بالسرعة اللي تناسبك"],
    unavailable: ["الاشتراكات المدفوعة قريبًا", "تفاصيل الدفع هتتعلن قريبًا"],
    availability: "مغامرتك الجاية في الطريق",
    availabilityBody: "الخطط المدفوعة لسه مش متاحة. هنوضح مدة الاشتراك، والمميزات، والسعر النهائي قبل فتح الاشتراكات. لحد وقتها، تقدر تستكشف خريطة التعلّم مع تيكو.",
    close: "إغلاق", explore: "استكشف الخريطة",
  },
} as const satisfies Record<Locale, MarketingCopy>;
