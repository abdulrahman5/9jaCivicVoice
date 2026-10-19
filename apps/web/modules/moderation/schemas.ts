import { z } from "zod";
import { CategorySchema, isValidSubcategory } from "@civicvoice/validation";

/** Inputs for the moderation server actions. Kept pure so they're unit-tested. */

const IssueId = z.uuid();

export const RouteInput = z.object({
  issueId: IssueId,
  agencyId: z.uuid({ message: "Choose an agency" }),
});

export const REJECT_REASONS = {
  spam: "Not a genuine report.",
  off_topic: "This isn't about a public service we can follow up.",
  outside_pilot: "This location is outside Lagos and FCT Abuja, which CivicVoice covers for now.",
  personal_attack: "Reports can't target private individuals or contain abuse.",
  not_enough_detail: "There isn't enough detail to act on. You're welcome to report again with more information.",
  other: "",
} as const;

export const RejectInput = z
  .object({
    issueId: IssueId,
    reason: z.enum(Object.keys(REJECT_REASONS) as [keyof typeof REJECT_REASONS, ...(keyof typeof REJECT_REASONS)[]]),
    note: z.string().trim().max(500).default(""),
  })
  .transform((v) => ({ ...v, publicNote: [REJECT_REASONS[v.reason], v.note].filter(Boolean).join(" ") }))
  .refine((v) => v.publicNote.length >= 5, { message: "Add a note explaining the reason", path: ["note"] });

export const MergeInput = z.object({
  issueId: IssueId,
  targetRef: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(LAG|FCT)-\d{4,}$/, "Enter a reference like LAG-1000"),
});

const optionalNumber = z.preprocess((v) => (v === "" || v === null ? undefined : Number(v)), z.number().optional());

export const EditInput = z
  .object({
    issueId: IssueId,
    category: CategorySchema,
    subcategory: z.string().min(1),
    lat: optionalNumber.pipe(z.number().min(4).max(14).optional()),
    lng: optionalNumber.pipe(z.number().min(2.5).max(15).optional()),
  })
  .refine((v) => isValidSubcategory(v.category, v.subcategory), {
    message: "That sub-category doesn't belong to the category",
    path: ["subcategory"],
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: "Enter both latitude and longitude, or neither",
    path: ["lat"],
  });

/** Turns a Postgres error from the moderation functions into something a moderator can act on. */
export function friendlyDbError(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "Something went wrong. Try again.";
  if (err.code === "P0001" || err.code === "P0002") return capitalise(err.message ?? "That isn't allowed.");
  return "Something went wrong saving that. Try again, or tell an admin if it keeps happening.";
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith(".") ? "" : ".");
