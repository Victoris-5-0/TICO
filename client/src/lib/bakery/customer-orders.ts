import { CUSTOMER_IDS, CUSTOMER_ORDER_SIZES, customerOrderSize, type BakeryState, type CustomerId } from "./simulation";

export type CustomerUrgency = "calm" | "hurry" | "rush" | "served";

export type CustomerOrderProfile = {
  id: CustomerId;
  nameEn: string;
  nameAr: string;
  tagEn: string;
  tagAr: string;
  loaves: number;
  maxPatience: number; // in seconds
  storyEn: string;
  storyAr: string;
  emotes: {
    calm: string;
    hurry: string;
    rush: string;
    served: string;
  };
};

export type CustomerOrderState = {
  id: CustomerId;
  loaves: number;
  patience: number;
  maxPatience: number;
  urgency: CustomerUrgency;
  emote: string;
  orderTag: string;
  customerName: string;
  story: string;
};

export const CUSTOMER_PROFILES: Record<CustomerId, CustomerOrderProfile> = {
  mariam: {
    id: "mariam",
    nameEn: "Mariam",
    nameAr: "مريم",
    tagEn: "Breakfast",
    tagAr: "الفطار",
    loaves: CUSTOMER_ORDER_SIZES.mariam,
    maxPatience: 24,
    storyEn: "Mariam is picking up warm bread for breakfast at home.",
    storyAr: "مريم بتجيب عيش سخن لفطار البيت.",
    emotes: {
      calm: "😊",
      hurry: "😅",
      rush: "🏃‍♀️",
      served: "🥰",
    },
  },
  nour: {
    id: "nour",
    nameEn: "Nour",
    nameAr: "نور",
    tagEn: "College",
    tagAr: "الجامعة",
    loaves: CUSTOMER_ORDER_SIZES.nour,
    maxPatience: 32,
    storyEn: "Nour needs fresh bread before heading to an early university lecture.",
    storyAr: "نور محتاجة عيش سخن قبل محاضرة الصبح في الكلية.",
    emotes: {
      calm: "📚",
      hurry: "⏱️",
      rush: "😰",
      served: "✨",
    },
  },
  amina: {
    id: "amina",
    nameEn: "Amina",
    nameAr: "أمينة",
    tagEn: "Family",
    tagAr: "الفطار",
    loaves: CUSTOMER_ORDER_SIZES.amina,
    maxPatience: 28,
    storyEn: "Amina is getting breakfast ready for the family before everyone wakes up.",
    storyAr: "أمينة بتجهّز فطار العيلة وعايزة ترجع بسرعة للأولاد.",
    emotes: {
      calm: "🧕",
      hurry: "⏰",
      rush: "😅",
      served: "💖",
    },
  },
  omar: {
    id: "omar",
    nameEn: "Omar",
    nameAr: "عمر",
    tagEn: "Crisp",
    tagAr: "مقمر",
    loaves: CUSTOMER_ORDER_SIZES.omar,
    maxPatience: 36,
    storyEn: "Omar's mom sent him with exact change for warm, crusty baladi bread.",
    storyAr: "ماما بعتت عمر يجيب رغيفين مقمرين وريحتهم طالعة من الفرن.",
    emotes: {
      calm: "😋",
      hurry: "🏃‍♂️",
      rush: "💦",
      served: "🌟",
    },
  },
  dina: {
    id: "dina",
    nameEn: "Dina",
    nameAr: "دينا",
    tagEn: "Clinic",
    tagAr: "العيادة",
    loaves: CUSTOMER_ORDER_SIZES.dina,
    maxPatience: 18,
    storyEn: "Dr. Dina is on a tight schedule before her morning clinic shift starts.",
    storyAr: "د. دينا وراها نبطشية في العيادة ومحتاجة تطلب وتمشي فوراً.",
    emotes: {
      calm: "👩‍⚕️",
      hurry: "⚡",
      rush: "🏃‍♀️",
      served: "🎉",
    },
  },
  youssef: {
    id: "youssef",
    nameEn: "Youssef",
    nameAr: "يوسف",
    tagEn: "Work",
    tagAr: "الورشة",
    loaves: CUSTOMER_ORDER_SIZES.youssef,
    maxPatience: 42,
    storyEn: "Youssef stepped out of the carpentry workshop for breakfast fuel.",
    storyAr: "الأسطى يوسف خارج من الورشة يجيب عيش للإفطار مع الشاي.",
    emotes: {
      calm: "☕",
      hurry: "⏱️",
      rush: "⏳",
      served: "🤝",
    },
  },
  hoda: {
    id: "hoda",
    nameEn: "Hoda",
    nameAr: "هدى",
    tagEn: "Grandma",
    tagAr: "الحاجة",
    loaves: CUSTOMER_ORDER_SIZES.hoda,
    maxPatience: 56,
    storyEn: "Grandmother Hoda takes her time, greeting all the neighbors in line.",
    storyAr: "الحاجة هدى بتبتسم للجيران في الطابور وبتدعي للفرّان بالبركة.",
    emotes: {
      calm: "👵",
      hurry: "🌸",
      rush: "⏳",
      served: "🤲",
    },
  },
  farid: {
    id: "farid",
    nameEn: "Farid",
    nameAr: "عم فريد",
    tagEn: "Sa'idi",
    tagAr: "الصعيدي",
    loaves: CUSTOMER_ORDER_SIZES.farid,
    maxPatience: 50,
    storyEn: "Uncle Farid in his Sa'idi turban appreciates patience and good craft.",
    storyAr: "عم فريد الصعيدي بجلابيته بيحب أصول الصنعة والعيش البلدي التمام.",
    emotes: {
      calm: "👳‍♂️",
      hurry: "☀️",
      rush: "⏱️",
      served: "👏",
    },
  },
};

export function getInitialCustomerOrders(locale: string = "en"): Record<CustomerId, CustomerOrderState> {
  const isAr = locale.startsWith("ar");
  const orders: Partial<Record<CustomerId, CustomerOrderState>> = {};

  for (const id of CUSTOMER_IDS) {
    const profile = CUSTOMER_PROFILES[id];
    orders[id] = {
      id,
      loaves: profile.loaves,
      patience: profile.maxPatience,
      maxPatience: profile.maxPatience,
      urgency: "calm",
      emote: profile.emotes.calm,
      orderTag: isAr ? profile.tagAr : profile.tagEn,
      customerName: isAr ? profile.nameAr : profile.nameEn,
      story: isAr ? profile.storyAr : profile.storyEn,
    };
  }

  return orders as Record<CustomerId, CustomerOrderState>;
}

/** Derive orders from the same bounded clock as the bakery; never start another timer. */
export function getCustomerOrders(
  state: BakeryState,
  locale: string = "en",
): Record<CustomerId, CustomerOrderState> {
  const orders = getInitialCustomerOrders(locale);
  const elapsed = Math.max(0, state.playbackElapsed ?? 0) / 1000;

  for (const id of CUSTOMER_IDS) {
    const order = orders[id];
    const profile = CUSTOMER_PROFILES[id];
    order.loaves = customerOrderSize(state, id);
    // A handoff is still in progress until bread has reached the customer's bag.
    const served = state.served.includes(id) || (state.active === id && state.phase === "exiting");
    order.patience = Math.max(0, order.maxPatience - elapsed);
    const ratio = order.patience / order.maxPatience;
    order.urgency = served ? "served" : ratio <= 0.28 ? "rush" : ratio <= 0.6 ? "hurry" : "calm";
    order.emote = profile.emotes[order.urgency];
  }

  return orders;
}

export function customerMoodLabel(urgency: CustomerUrgency, locale: string): string {
  const labels = locale.startsWith("ar")
    ? { calm: "براحة", hurry: "مستعجل", rush: "مستعجل جداً", served: "شكراً!" }
    : { calm: "Patient", hurry: "Hurry", rush: "In a hurry!", served: "Thanks!" };
  return labels[urgency];
}

export function customerTimeLabel(order: CustomerOrderState, locale: string): string {
  if (order.urgency === "served" || order.patience <= 0) return customerMoodLabel(order.urgency, locale);
  const seconds = new Intl.NumberFormat(locale).format(Math.ceil(order.patience));
  return locale.startsWith("ar") ? `${seconds} ث` : `${seconds}s`;
}
