import type { Locale } from "@/i18n/config";

type LocalizedText = Record<Locale, string>;

export type World = {
  slug: "el-forn" | "el-mahatta" | "isharet-cairo";
  number: string;
  icon: string;
  accent: "coral" | "blue" | "green";
  image: string;
  imageAlt: LocalizedText;
  title: LocalizedText;
  kicker: LocalizedText;
  description: LocalizedText;
  concepts: LocalizedText;
  missions: readonly LocalizedText[];
};

export const worlds: readonly World[] = [
  {
    slug: "el-forn",
    number: "01",
    icon: "عيش",
    accent: "coral",
    image: "/assets/worlds/bakery/establishing-v1.webp",
    imageAlt: { "ar-EG": "فرن عيش بلدي مصري حديث", en: "A contemporary Egyptian baladi bakery" },
    title: { "ar-EG": "الفرن", en: "El Forn" },
    kicker: { "ar-EG": "مخبز العيش البلدي", en: "The baladi bakery" },
    description: { "ar-EG": "نظّم الطلبات واحسب الصواني وساعد الطابور يمشي بعدل.", en: "Count trays, organize orders, and help the queue move fairly." },
    concepts: { "ar-EG": "متغيّرات · شروط · حلقات · دوال", en: "Variables · conditions · loops · functions" },
    missions: [
      { "ar-EG": "رسالة الفتح", en: "Opening Message" },
      { "ar-EG": "عدّ الصواني", en: "Count the Trays" },
      { "ar-EG": "طلب العيلة", en: "Family Order" },
      { "ar-EG": "النصيب العادل", en: "Fair Share" },
      { "ar-EG": "دفعات الصبح", en: "Morning Batches" },
      { "ar-EG": "حاسبة الفرن", en: "Bakery Calculator" },
    ],
  },
  {
    slug: "isharet-cairo",
    number: "02",
    icon: "إشارة",
    accent: "green",
    image: "/assets/traffic-v2/background/full.png",
    imageAlt: { "ar-EG": "تقاطع مروري آمن مستوحى من القاهرة", en: "A safe Cairo-inspired traffic intersection" },
    title: { "ar-EG": "إشارة القاهرة", en: "Isharet Cairo" },
    kicker: { "ar-EG": "مركز التحكم في المرور", en: "Cairo traffic control" },
    description: { "ar-EG": "نظّم دور العربيات والمشاة باستخدام حلقة for خطوة بخطوة.", en: "Guide cars and pedestrians through the junction with a for loop." },
    concepts: { "ar-EG": "حلقات تكرار for", en: "For loops" },
    missions: [
      { "ar-EG": "دور كل عربية", en: "Every Car's Turn" },
      { "ar-EG": "دور المشاة", en: "Pedestrians' Turn" },
    ],
  },
  {
    slug: "el-mahatta",
    number: "03",
    icon: "قطر",
    accent: "blue",
    image: "/assets/worlds/station/establishing-v1.webp",
    imageAlt: { "ar-EG": "رصيف محطة قطار مصرية", en: "An Egyptian railway station platform" },
    title: { "ar-EG": "المحطة", en: "El Mahatta" },
    kicker: { "ar-EG": "محطة القطر", en: "The railway station" },
    description: { "ar-EG": "رتّب شباك التذاكر ووجّه الركاب للرصيف الصح.", en: "Manage the ticket queue and guide passengers to the right platform." },
    concepts: { "ar-EG": "قوائم · طوابير · قواميس · بيانات", en: "Lists · queues · dictionaries · data" },
    missions: [
      { "ar-EG": "قائمة الركاب", en: "Passenger List" },
      { "ar-EG": "طابور التذاكر", en: "Ticket Queue" },
      { "ar-EG": "لوحة الوجهات", en: "Destination Board" },
      { "ar-EG": "الرصيف الصح", en: "Right Platform" },
      { "ar-EG": "صفوف الكراسي", en: "Seat Rows" },
      { "ar-EG": "مسؤول المحطة", en: "Station Dispatcher" },
    ],
  },
] as const;
