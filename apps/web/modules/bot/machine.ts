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
  | { step: "await_ref"; locale: Locale }
  // Election reporting (docs/ELECTIONS.md, task E4)
  | { step: "e_await_unit"; locale: Locale; electionId: string }
  | { step: "e_confirm_unit"; locale: Locale; electionId: string; unit: BotUnit }
  | { step: "e_await_category"; locale: Locale; electionId: string; unit: BotUnit }
  | { step: "e_await_details"; locale: Locale; electionId: string; unit: BotUnit; category: { id: string; label: string } };

export interface BotUnit {
  code: string;
  name: string;
  active: boolean;
  lga: string;
  state: string;
}

/** What the worker knows that the pure machine can't look up itself. */
export interface BotContext {
  policeFormUrl: string;
  /** The election taking reports now, with its categories in menu order; null outside polling. */
  election: { id: string; name: string; categories: { id: string; label: string }[] } | null;
  /** E.g. " It opens on Saturday 16 January at 6:00." Shown when no election is open. */
  nextElectionNote: string;
  /** The web form, for photos and "find your polling unit". */
  electionWebUrl: string;
}

/** Inputs from WhatsApp, plus the worker's answer to a lookup_unit effect. */
export type MachineInput = BotInput | { kind: "unit_result"; code: string; unit: BotUnit | null };

export type Effect =
  | {
      type: "create_report";
      city: City;
      category: Category;
      location: { lat: number; lng: number } | { text: string };
      description?: string;
      media?: { mediaType: "image" | "audio"; mediaId: string };
    }
  | { type: "lookup_status"; ref: string }
  /** The worker looks the code up and steps the machine again with a unit_result input. */
  | { type: "lookup_unit"; code: string }
  | { type: "create_election_report"; electionId: string; puCode: string; category: string; description: string };

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

const REF_PATTERN = /^((LAG|FCT)-\d{4,}|EV-[2-9A-HJ-NP-Z]{7})$/i;

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

export function step(state: BotState, input: MachineInput, ctx: BotContext): StepResult {
  const say = (key: MessageKey, vars?: Record<string, string>) => t(state.locale, key, vars);
  const text = input.kind === "text" ? input.text.trim() : input.kind === "button" ? input.id : "";
  const welcome = (locale: Locale = state.locale) =>
    t(locale, "bot.welcome") + (ctx.election ? `\n${t(locale, "bot.welcomeElectionLine", { election: ctx.election.name })}` : "");
  const toMenu = (...replies: string[]): StepResult => ({ state: { step: "menu", locale: state.locale }, replies, effects: [] });

  // "menu" or "0" always returns to the main menu.
  if (/^(menu|0|hi|hello)$/i.test(text) && state.step !== "idle") return toMenu(welcome());

  // An election step with no election open any more (the window closed mid-conversation).
  if (state.step.startsWith("e_") && !ctx.election) return toMenu(say("bot.electionClosed", { when: ctx.nextElectionNote }));

  switch (state.step) {
    case "idle":
      return toMenu(welcome());

    case "menu":
      if (text === "1") return next({ step: "await_category", locale: state.locale }, say("bot.askCategory"));
      if (text === "2") return next({ step: "await_ref", locale: state.locale }, say(ctx.election ? "bot.askRefAny" : "bot.askRef"));
      if (text === "3") return next({ step: "choose_language", locale: state.locale }, say("bot.chooseLanguage"));
      if (text === "4") {
        if (!ctx.election) return toMenu(say("bot.electionClosed", { when: ctx.nextElectionNote }));
        return next(
          { step: "e_await_unit", locale: state.locale, electionId: ctx.election.id },
          say("bot.electionAskUnit", { url: ctx.electionWebUrl }),
        );
      }
      return retry(state, say);

    case "choose_language": {
      const locale: Locale | undefined = text === "1" ? "en" : text === "2" ? "pcm" : undefined;
      if (!locale) return retry(state, say);
      return next({ step: "menu", locale }, t(locale, "bot.languageSet"), welcome(locale));
    }

    case "await_category": {
      const choice = CATEGORY_BY_CHOICE[text];
      if (!choice) return retry(state, say);
      if (choice === "police") {
        // Never take police reports on WhatsApp: it exposes the phone number.
        return next({ step: "menu", locale: state.locale }, say("bot.policeRedirect", { url: ctx.policeFormUrl }));
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
      if (!REF_PATTERN.test(text)) return retry(state, say, ctx.election ? "bot.askRefAny" : "bot.askRef");
      return {
        state: { step: "menu", locale: state.locale },
        replies: [],
        effects: [{ type: "lookup_status", ref: text.toUpperCase() }],
      };

    case "e_await_unit": {
      if (input.kind === "unit_result") {
        const unit = input.unit;
        if (!unit) return next(state, say("bot.electionUnitNotFound", { code: input.code, url: ctx.electionWebUrl }));
        if (!unit.active) return next(state, say("bot.electionUnitInactive", { code: unit.code }));
        return next(
          { ...state, step: "e_confirm_unit", unit },
          say("bot.electionConfirmUnit", { code: unit.code, name: unit.name, lga: unit.lga, state: unit.state }),
        );
      }
      // Codes are four groups of digits (24/01/01/001) or nine digits in a row.
      if ((text.match(/\d+/g) ?? []).length === 4 || /^\d{9}$/.test(text)) {
        return { state, replies: [], effects: [{ type: "lookup_unit", code: text }] };
      }
      return retry(state, say, "bot.electionAskUnit", { url: ctx.electionWebUrl });
    }

    case "e_confirm_unit":
      if (text === "1") {
        return next({ ...state, step: "e_await_category" }, categoryMenu(say, ctx.election!.categories));
      }
      if (text === "2") {
        return next({ step: "e_await_unit", locale: state.locale, electionId: state.electionId }, say("bot.electionAskUnit", { url: ctx.electionWebUrl }));
      }
      return retry(state, say);

    case "e_await_category": {
      const choice = /^\d{1,2}$/.test(text) ? ctx.election!.categories[Number(text) - 1] : undefined;
      if (!choice) return retry(state, say, undefined, undefined, categoryMenu(say, ctx.election!.categories));
      return next({ ...state, step: "e_await_details", category: choice }, say("bot.electionAskDetails", { url: ctx.electionWebUrl }));
    }

    case "e_await_details": {
      if (input.kind === "media") return next(state, say("bot.electionPhotoOnWeb", { url: ctx.electionWebUrl }));
      if (input.kind !== "text" || !text) return retry(state, say, "bot.electionAskDetails", { url: ctx.electionWebUrl });
      const skipped = /^skip$/i.test(text);
      if (skipped && state.category.id === "other") return next(state, say("bot.electionNeedsDetails"));
      return {
        state: { step: "menu", locale: state.locale },
        replies: [],
        // The worker replies with the reference, or why it couldn't be saved.
        effects: [
          {
            type: "create_election_report",
            electionId: state.electionId,
            puCode: state.unit.code,
            category: state.category.id,
            description: skipped ? "" : text,
          },
        ],
      };
    }
  }
}

function categoryMenu(say: (k: MessageKey, v?: Record<string, string>) => string, categories: { label: string }[]) {
  return say("bot.electionAskCategory", { options: categories.map((c, i) => `${i + 1} · ${c.label}`).join("\n") });
}

function next(state: BotState, ...replies: string[]): StepResult {
  return { state, replies, effects: [] };
}

function retry(
  state: BotState,
  say: (k: MessageKey, v?: Record<string, string>) => string,
  reprompt?: MessageKey,
  vars?: Record<string, string>,
  text?: string,
): StepResult {
  return {
    state,
    replies: [text ?? (reprompt ? say(reprompt, vars) : say("bot.didNotUnderstand"))],
    effects: [],
  };
}
