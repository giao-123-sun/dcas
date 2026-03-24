import { zh } from "./zh.js";
import type { Locale } from "./zh.js";

let currentLocale: Locale = zh;

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export { zh } from "./zh.js";
export { en } from "./en.js";
export type { Locale } from "./zh.js";
