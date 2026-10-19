import { z } from "zod";
import { CategorySchema, Channel, City, Language, isValidSubcategory } from "./taxonomy";

/** Nigeria's bounding box, used to reject obviously bogus coordinates. */
const NIGERIA_BBOX = { minLat: 4.0, maxLat: 14.0, minLng: 2.5, maxLng: 15.0 };

export const GeoPoint = z.object({
  lat: z.number().min(NIGERIA_BBOX.minLat).max(NIGERIA_BBOX.maxLat),
  lng: z.number().min(NIGERIA_BBOX.minLng).max(NIGERIA_BBOX.maxLng),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

export const SINCE = ["today", "this_week", "over_a_month"] as const;

/** Body of POST /api/reports (web report flow, wireframes 1.2–1.3). */
export const ReportSubmission = z
  .object({
    city: City,
    category: CategorySchema,
    subcategory: z.string().min(1).max(40),
    location: GeoPoint,
    description: z.string().trim().max(1000).default(""),
    since: z.enum(SINCE).optional(),
    /** Storage keys returned by the signed-upload step; at most 3 photos + 1 voice note. */
    mediaKeys: z.array(z.string().min(1).max(200)).max(4).default([]),
    anonymous: z.boolean().default(true),
    /** Optional, only used for status updates. E.164 Nigerian mobile number. */
    phone: z
      .string()
      .regex(/^\+234[789]\d{9}$/, "Use +234 followed by a 10-digit mobile number")
      .optional(),
    language: Language.default("en"),
    channel: Channel.default("web"),
  })
  .refine((r) => isValidSubcategory(r.category, r.subcategory), {
    message: "Subcategory does not belong to category",
    path: ["subcategory"],
  })
  .refine((r) => r.description.length > 0 || r.mediaKeys.length > 0, {
    message: "Add a description, a photo or a voice note",
    path: ["description"],
  });
export type ReportSubmission = z.infer<typeof ReportSubmission>;

/** Body of POST /api/reports/:ref/confirm ("Is it fixed?", wireframe 1.4). */
export const FixConfirmation = z.object({
  token: z.string().min(16).max(128),
  fixed: z.boolean(),
});
