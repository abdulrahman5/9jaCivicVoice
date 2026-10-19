import { t, type Locale, type MessageKey } from "@civicvoice/i18n";
import type { Category, City } from "@civicvoice/validation";
import type { BotInput } from "../whatsapp/payload";

/**
 * WhatsApp bot as a pure state machine (wireframe 2.1).
 * step(state, input) never does I/O: it returns the next state, the replies to
 * send and the side effects for the worker to perform. That keeps the
 * conversation logic unit-testable without WhatsApp or a database.
 */

export type BotState =
  | { step: "idle"; locale: Locale }
  | { step: "menu"; locale: Locale }
  | { step: "choose_language"; locale: Locale }
  | { step: "await_category"; locale: Locale }
  | { step: "await_location"; locale: Locale; category: Category }
  | { step: "await_city"; locale: Locale; category: Category; location: { text: string } }
  | {
      step: "await_details";
      locale: Locale;
      category: Category;
      city: City;
      location: { lat: number; lng: number } | { text: string };
    }
  | { step: "await_ref"; locale: Locale };

export type Effect =
  | {
      type: "create_report";
      city: City;
      category: Category;
      location: { lat: number; lng: number } | { text: string };
      description?: string;
      media?: { mediaType: "image" | "audio"; mediaId: string };
    }
  | { type: "lookup_status"; ref: string };

export interface StepResult {
  state: BotState;
  replies: string[];
  effects: Effect[];
}

const CATEGORY_BY_CHOICE: Record<string, Category | "police"> = {
  "1": "roads",
  "2": "electricity",
  "3": "water",
  "4": "health",
  "5": "public_service",
  "6": "police",
};

const REF_PATTERN = /^(LAG|FCT)-\d{4,}$/i;

/** Rough bounding boxes of the pilot areas. Points outside both are turned away politely. */
const PILOT_AREAS: Record<City, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  lagos: { minLat: 6.2, maxLat: 6.8, minLng: 2.7, maxLng: 4.4 },
  fct: { minLat: 8.4, maxLat: 9.5, minLng: 6.7, maxLng: 7.7 },
};

export function cityFromPoint(lat: number, lng: number): City | null {
  for (const [city, b] of Object.entries(PILOT_AREAS) as [City, (typeof PILOT_AREAS)[City]][]) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return city;
  }
  return null;
}

export const initialState = (locale: Locale = "en"): BotState => ({ step: "idle", locale });

export function step(state: BotState, input: BotInput, policeFormUrl: string): StepResult {
  const say = (key: MessageKey, vars?: Record<string, string>) => t(state.locale, key, vars);
  const text = input.kind === "text" ? input.text.trim() : input.kind === "button" ? input.id : "";

  // "menu" or "0" always returns to the main menu.
  if (/^(menu|0|hi|hello)$/i.test(text) && state.step !== "idle") {
    return { state: { step: "menu", locale: state.locale }, replies: [say("bot.welcome")], effects: [] };
  }

  switch (state.step) {
    case "idle":
      return { state: { step: "menu", locale: state.locale }, replies: [say("bot.welcome")], effects: [] };

    case "menu":
      if (text === "1") return next({ step: "await_category", locale: state.locale }, say("bot.askCategory"));
      if (text === "2") return next({ step: "await_ref", locale: state.locale }, say("bot.askRef"));
      if (text === "3") return next({ step: "choose_language", locale: state.locale }, say("bot.chooseLanguage"));
      return retry(state, say);

    case "choose_language": {
      const locale: Locale | undefined = text === "1" ? "en" : text === "2" ? "pcm" : undefined;
      if (!locale) return retry(state, say);
      return next({ step: "menu", locale }, t(locale, "bot.languageSet"), t(locale, "bot.welcome"));
    }

    case "await_category": {
      const choice = CATEGORY_BY_CHOICE[text];
      if (!choice) return retry(state, say);
      if (choice === "police") {
        // Never take police reports on WhatsApp: it exposes the phone number.
        return next({ step: "menu", locale: state.locale }, say("bot.policeRedirect", { url: policeFormUrl }));
      }
      return next({ step: "await_location", locale: state.locale, category: choice }, say("bot.askLocation"));
    }

    case "await_location": {
      if (input.kind === "location") {
        const city = cityFromPoint(input.lat, input.lng);
        if (!city) return next(state, say("bot.outsidePilot"));
        const location = { lat: input.lat, lng: input.lng };
        return next({ ...state, step: "await_details", city, location }, say("bot.askDetails"));
      }
      if (input.kind === "text" && text.length >= 3) {
        return next({ ...state, step: "await_city", location: { text } }, say("bot.askCity"));
      }
      return retry(state, say, "bot.askLocation");
    }

    case "await_city": {
      const city: City | undefined = text === "1" ? "lagos" : text === "2" ? "fct" : undefined;
      if (!city) return retry(state, say, "bot.askCity");
      return next({ ...state, step: "await_details", city }, say("bot.askDetails"));
    }

    case "await_details": {
      const base = {
        type: "create_report" as const,
        city: state.city,
        category: state.category,
        location: state.location,
      };
      let effect: Effect | undefined;
      if (input.kind === "media") effect = { ...base, media: { mediaType: input.mediaType, mediaId: input.mediaId } };
      else if (input.kind === "text" && text.length > 0) effect = { ...base, description: text };
      if (!effect) return retry(state, say, "bot.askDetails");
      // The worker sends bot.received with the reference number once the report exists.
      return { state: { step: "menu", locale: state.locale }, replies: [], effects: [effect] };
    }

    case "await_ref":
      if (!REF_PATTERN.test(text)) return retry(state, say, "bot.askRef");
      return {
        state: { step: "menu", locale: state.locale },
        replies: [],
        effects: [{ type: "lookup_status", ref: text.toUpperCase() }],
      };
  }
}

function next(state: BotState, ...replies: string[]): StepResult {
  return { state, replies, effects: [] };
}

function retry(state: BotState, say: (k: MessageKey) => string, reprompt?: MessageKey): StepResult {
  return {
    state,
    replies: reprompt ? [say(reprompt)] : [say("bot.didNotUnderstand")],
    effects: [],
  };
}
