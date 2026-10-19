import "server-only";
import { z } from "zod";

/**
 * Server environment, validated on first use. Grouped by feature so a missing
 * WhatsApp secret fails the webhook loudly but doesn't stop the public site.
 */
const groups = {
  supabase: z.object({
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  }),
  whatsapp: z.object({
    WHATSAPP_VERIFY_TOKEN: z.string().min(16),
    WHATSAPP_APP_SECRET: z.string().min(16),
    WHATSAPP_ACCESS_TOKEN: z.string().min(20),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(5),
  }),
  secrets: z.object({
    CONTACT_HASH_PEPPER: z.string().min(32),
    CONTACT_ENC_KEY: z.base64().length(44),
    AGENCY_TOKEN_KEY: z.string().min(32),
  }),
  jobs: z.object({
    JOBS_SECRET: z.string().min(32),
  }),
  police: z.object({
    NEXT_PUBLIC_POLICE_FORM_URL: z.url(),
  }),
} as const;

type Groups = typeof groups;
const cache = new Map<keyof Groups, unknown>();

export function env<G extends keyof Groups>(group: G): z.infer<Groups[G]> {
  if (!cache.has(group)) {
    const parsed = groups[group].safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables for "${group}": ${missing}`);
    }
    cache.set(group, parsed.data);
  }
  return cache.get(group) as z.infer<Groups[G]>;
}

/**
 * The site's public origin, for links we send out (agency links). Explicit
 * NEXT_PUBLIC_SITE_URL wins; on Vercel preview deployments, which each get
 * their own address, it falls back to that deployment's URL.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return z.url().parse(explicit).replace(/\/$/, "");
  const vercel = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  throw new Error("Set NEXT_PUBLIC_SITE_URL");
}

/** True when the given feature is configured; used to render friendly empty states in development. */
export function isConfigured(group: keyof Groups): boolean {
  return groups[group].safeParse(process.env).success;
}
