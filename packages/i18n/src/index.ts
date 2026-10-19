import { en } from "./messages/en";
import { pcm } from "./messages/pcm";

export type Locale = "en" | "pcm" | "ha" | "yo" | "ig";
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

/**
 * Hausa, Yorùbá and Igbo are P1 (PRD F12). Until a native speaker has
 * reviewed them they fall back to English, key by key.
 */
const catalogs: Record<Locale, Partial<Messages>> = {
  en,
  pcm,
  ha: {},
  yo: {},
  ig: {},
};

export function t(locale: Locale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = catalogs[locale][key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  pcm: "Pidgin",
  ha: "Hausa",
  yo: "Yorùbá",
  ig: "Igbo",
};
