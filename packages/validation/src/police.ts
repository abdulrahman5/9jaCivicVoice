import { z } from "zod";
import { City } from "./taxonomy";

export const POLICE_INCIDENT_TYPES = [
  "money_demanded",
  "phone_searched_harassment",
  "unlawful_arrest_detention",
  "violence",
] as const;
export const PoliceIncidentType = z.enum(POLICE_INCIDENT_TYPES);

export const WHEN = ["just_now", "today", "earlier"] as const;

/**
 * Body accepted by the police intake Worker (wireframe 4.1).
 * Deliberately has no contact fields of any kind.
 */
export const PoliceSubmission = z
  .object({
    city: City,
    incidentType: PoliceIncidentType,
    /** Free-text place name. Coordinates are snapped to a ~1 km grid before storage. */
    place: z.string().trim().min(2).max(120),
    lat: z.number().min(4).max(14).optional(),
    lng: z.number().min(2.5).max(15).optional(),
    when: z.enum(WHEN),
    occurredOn: z.iso.date().optional(),
    description: z.string().trim().max(2000).default(""),
    /** Optional unit / vehicle / name tag. Encrypted client-side by the Worker before storage. */
    officerDetails: z.string().trim().max(300).optional(),
    mediaKeys: z.array(z.string().min(1).max(200)).max(3).default([]),
    consentToForward: z.boolean(),
    wantsLegalAid: z.boolean().default(false),
  })
  .strict();
export type PoliceSubmission = z.infer<typeof PoliceSubmission>;
