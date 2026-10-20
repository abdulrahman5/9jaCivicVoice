import { z } from "zod";
import { City } from "./taxonomy";

// Police reporting (docs/POLICE.md). Every list here mirrors a check constraint in
// db/vault/supabase/migrations: change both together.

export const POLICE_KINDS = ["misconduct", "commendation"] as const;
export const PoliceKind = z.enum(POLICE_KINDS);
export type PoliceKind = z.infer<typeof PoliceKind>;

export const MISCONDUCT_TYPES = [
  "money_demanded",
  "phone_searched_harassment",
  "unlawful_arrest_detention",
  "violence",
] as const;

export const COMMENDATION_TYPES = ["refused_bribe", "helped_me", "respected_rights", "professional_conduct"] as const;

export const POLICE_INCIDENT_TYPES = [...MISCONDUCT_TYPES, ...COMMENDATION_TYPES] as const;
export const PoliceIncidentType = z.enum(POLICE_INCIDENT_TYPES);
export type PoliceIncidentType = z.infer<typeof PoliceIncidentType>;

const TYPES_BY_KIND: Record<PoliceKind, readonly PoliceIncidentType[]> = {
  misconduct: MISCONDUCT_TYPES,
  commendation: COMMENDATION_TYPES,
};

export const WHEN = ["just_now", "today", "earlier"] as const;

export const TIME_OF_DAY = ["morning", "afternoon", "evening", "night"] as const;
export const TimeOfDay = z.enum(TIME_OF_DAY);

/**
 * Body accepted by the police intake Worker (wireframe 4.1).
 * Deliberately has no contact fields of any kind.
 */
export const PoliceSubmission = z
  .object({
    /** Defaults to misconduct so forms from before commendations keep working. */
    kind: PoliceKind.default("misconduct"),
    city: City,
    incidentType: PoliceIncidentType,
    /** Free-text place name. Coordinates are snapped to a ~1 km grid before storage. */
    place: z.string().trim().min(2).max(120),
    lat: z.number().min(4).max(14).optional(),
    lng: z.number().min(2.5).max(15).optional(),
    when: z.enum(WHEN),
    occurredOn: z.iso.date().optional(),
    timeOfDay: TimeOfDay.optional(),
    description: z.string().trim().max(2000).default(""),
    /** Optional unit / vehicle / name tag. Encrypted client-side by the Worker before storage. */
    officerDetails: z.string().trim().max(300).optional(),
    mediaKeys: z.array(z.string().min(1).max(200)).max(3).default([]),
    consentToForward: z.boolean(),
    wantsLegalAid: z.boolean().default(false),
  })
  .strict()
  .refine((r) => TYPES_BY_KIND[r.kind].includes(r.incidentType), {
    message: "This type doesn't match the kind of report.",
    path: ["incidentType"],
  });
export type PoliceSubmission = z.infer<typeof PoliceSubmission>;

/** Status codes are six words. Accepts any case, and spaces or hyphens between words. */
export const STATUS_CODE_WORDS = 6;
export const StatusCode = z
  .string()
  .max(100)
  .transform((s) => s.trim().toLowerCase().split(/[\s-]+/).filter(Boolean))
  .refine((words) => words.length === STATUS_CODE_WORDS && words.every((w) => /^[a-z]{2,8}$/.test(w)), {
    message: `Enter all ${STATUS_CODE_WORDS} words of your code.`,
  })
  .transform((words) => words.join("-"));

/** A reporter's message from the status page. */
export const ReporterMessage = z
  .object({
    code: StatusCode,
    body: z.string().trim().min(1).max(1000),
  })
  .strict();
export type ReporterMessage = z.infer<typeof ReporterMessage>;

export const POLICE_STATUSES = ["new", "consistent", "forwarded", "closed", "rejected"] as const;
export type PoliceStatus = (typeof POLICE_STATUSES)[number];

/** Forwarding recipients: the Police Complaint Response Unit and the Police Service Commission. */
export const POLICE_RECIPIENTS = ["cru", "psc"] as const;
export type PoliceRecipient = (typeof POLICE_RECIPIENTS)[number];

export const FORWARD_OUTCOMES = ["awaiting", "acknowledged", "action_reported", "no_response"] as const;
export type ForwardOutcome = (typeof FORWARD_OUTCOMES)[number];

/**
 * Statuses a moderator may set directly. Mirrors police.set_status() in SQL;
 * "forwarded" is set only by recording a forward.
 */
const POLICE_TRANSITIONS: Record<PoliceStatus, readonly PoliceStatus[]> = {
  new: ["consistent", "rejected"],
  consistent: ["rejected", "closed"],
  forwarded: ["closed"],
  closed: [],
  rejected: [],
};

export function policeCanTransition(from: PoliceStatus, to: PoliceStatus): boolean {
  return POLICE_TRANSITIONS[from].includes(to);
}
