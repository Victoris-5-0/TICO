export const locales = ["ar-EG", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar-EG";

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export function direction(locale: Locale): "rtl" | "ltr" {
  return locale === "ar-EG" ? "rtl" : "ltr";
}

export function alternateLocale(locale: Locale): Locale {
  return locale === "ar-EG" ? "en" : "ar-EG";
}
