import type { Locale } from "@/i18n/config";

type LocalizedText = Record<Locale, string>;

/**
 * The curriculum's chapters — the islands on the "Select your world" map (Figma 23:52).
 *
 * A chapter groups worlds (`Track` rows) by the programming ideas they teach. Only the
 * first has worlds built; the other three are drawn on the map so a student can see the
 * road ahead, and stay locked until their worlds exist. Adding a world to a chapter is a
 * matter of listing its track slug here, in curriculum order.
 */
export type Chapter = {
  slug: "programming-basics" | "oop" | "data-structures" | "algorithms";
  title: LocalizedText;
  /** The kind of Egyptian worlds inside, named under the title. */
  kicker: LocalizedText;
  /** Island art in `public/assets/chapters-map/`, with its intrinsic size. */
  island: { src: string; width: number; height: number };
  /** Track slugs in curriculum order. Empty while the chapter's worlds are not built. */
  worlds: readonly string[];
};

export const chapters: readonly Chapter[] = [
  {
    slug: "programming-basics",
    title: { en: "Programming Basics", "ar-EG": "أساسيات البرمجة" },
    kicker: { en: "Egyptian Streets Worlds", "ar-EG": "عوالم الشوارع المصرية" },
    island: { src: "/assets/chapters-map/island-programming-basics.webp", width: 1024, height: 782 },
    worlds: ["el-forn", "isharet-cairo", "el-mahatta"],
  },
  {
    slug: "oop",
    title: { en: "Object Oriented Programming (OOP)", "ar-EG": "البرمجة كائنية التوجه (OOP)" },
    kicker: { en: "Buildings Worlds", "ar-EG": "عوالم المباني" },
    island: { src: "/assets/chapters-map/island-oop.webp", width: 955, height: 777 },
    worlds: [],
  },
  {
    slug: "data-structures",
    title: { en: "Data Structure", "ar-EG": "هياكل البيانات" },
    kicker: { en: "Egyptian Streets Worlds", "ar-EG": "عوالم الشوارع المصرية" },
    island: { src: "/assets/chapters-map/island-data-structures.webp", width: 944, height: 907 },
    worlds: [],
  },
  {
    slug: "algorithms",
    title: { en: "Algorithms & Problem solving", "ar-EG": "الخوارزميات وحل المشكلات" },
    kicker: { en: "Puzzle World", "ar-EG": "عالم الألغاز" },
    island: { src: "/assets/chapters-map/island-algorithms.webp", width: 979, height: 778 },
    worlds: [],
  },
] as const;

export const isChapterSlug = (value: string): value is Chapter["slug"] =>
  chapters.some((chapter) => chapter.slug === value);
