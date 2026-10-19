import { z } from "zod";

/** Pilot cities. Values match the `city` enum in the civic database. */
export const CITIES = ["lagos", "fct"] as const;
export const City = z.enum(CITIES);
export type City = z.infer<typeof City>;

/**
 * v1 civic categories and their sub-types (PRD §v1 scope, wireframe 1.2).
 * Police conduct is deliberately absent: it goes through the police vault,
 * never the civic pipeline. Corruption is v2.
 */
export const TAXONOMY = {
  roads: ["pothole", "flooding", "drainage", "streetlight", "other"],
  electricity: ["outage", "estimated_billing", "meter_request", "fallen_pole", "other"],
  water: ["no_supply", "broken_borehole", "waste", "other"],
  health: ["facility_closed", "no_drugs", "absent_staff", "other"],
  public_service: ["nin", "passport", "licence", "other"],
} as const;

export type Category = keyof typeof TAXONOMY;
export const CATEGORIES = Object.keys(TAXONOMY) as [Category, ...Category[]];
export const CategorySchema = z.enum(CATEGORIES);

export const SUBCATEGORIES = Object.values(TAXONOMY).flat() as [string, ...string[]];

export function isValidSubcategory(category: Category, subcategory: string): boolean {
  return (TAXONOMY[category] as readonly string[]).includes(subcategory);
}

/** Channels a civic report can arrive through. USSD/SMS are v2. */
export const CHANNELS = ["whatsapp", "web"] as const;
export const Channel = z.enum(CHANNELS);
export type Channel = z.infer<typeof Channel>;

export const LANGUAGES = ["en", "pcm", "ha", "yo", "ig"] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;
