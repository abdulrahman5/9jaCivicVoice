import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import type { Category, City, IssueStatus } from "@civicvoice/validation";

/** Reads for the moderation console. Service role: callers must have checked requireStaff(). */

const core = () => civicServiceClient().schema("core");

export const QUEUE_TABS = {
  received: { label: "To verify", statuses: ["received"] },
  verified: { label: "To route", statuses: ["verified"] },
  open: { label: "With agencies", statuses: ["forwarded", "acknowledged", "in_progress"] },
  resolved: { label: "Resolved", statuses: ["resolved", "confirmed_fixed", "unconfirmed"] },
} as const satisfies Record<string, { label: string; statuses: IssueStatus[] }>;
export type QueueTab = keyof typeof QUEUE_TABS;

export interface QueueRow {
  id: string;
  ref_code: string;
  title: string;
  city: City;
  lga: string | null;
  location_text: string | null;
  status: IssueStatus;
  metoo_count: number;
  created_at: string;
}

export async function queue(tab: QueueTab, city?: City): Promise<QueueRow[]> {
  let q = core()
    .from("issues")
    .select("id, ref_code, title, city, lga, location_text, status, metoo_count, created_at")
    .in("status", [...QUEUE_TABS[tab].statuses])
    .order("created_at", { ascending: true })
    .limit(100);
  if (city) q = q.eq("city", city);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as QueueRow[];
}

export interface IssueDetail {
  id: string;
  ref_code: string;
  title: string;
  city: City;
  category: Category;
  subcategory: string;
  status: IssueStatus;
  lat: number | null;
  lng: number | null;
  location_text: string | null;
  lga: string | null;
  ward: string | null;
  metoo_count: number;
  agency: { id: string; name: string } | null;
  created_at: string;
  reports: {
    id: string;
    channel: string;
    description: string;
    since: string | null;
    transcript: string | null;
    language: string;
    has_contact: boolean;
    created_at: string;
  }[];
  events: { to_status: IssueStatus; actor_type: string; public_note: string | null; created_at: string }[];
}

export async function issueDetail(id: string): Promise<IssueDetail | null> {
  const { data: issue, error } = await core()
    .from("issues")
    .select(
      "id, ref_code, title, city, category, subcategory, status, location_text, lga, ward, metoo_count, created_at, location, agency:agencies(id, name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!issue) return null;

  const [{ data: reports }, { data: events }] = await Promise.all([
    core()
      .from("reports")
      .select("id, channel, description, since, transcript, language, contact_hash, created_at")
      .eq("issue_id", id)
      .order("created_at"),
    core()
      .from("status_events")
      .select("to_status, actor_type, public_note, created_at")
      .eq("issue_id", id)
      .order("created_at"),
  ]);

  const point = parsePoint(issue.location as unknown);
  return {
    ...(issue as unknown as Omit<IssueDetail, "lat" | "lng" | "reports" | "events" | "agency">),
    agency: (issue.agency as unknown as IssueDetail["agency"]) ?? null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    // Moderators see whether the reporter can get updates, never the contact itself.
    reports: (reports ?? []).map(({ contact_hash, ...r }) => ({ ...r, has_contact: Boolean(contact_hash) })),
    events: (events ?? []) as IssueDetail["events"],
  };
}

/** PostgREST returns geography as GeoJSON or as EWKB hex depending on version. */
export function parsePoint(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "coordinates" in value) {
    const [lng, lat] = (value as { coordinates: [number, number] }).coordinates;
    return { lat, lng };
  }
  if (typeof value === "string" && /^[0-9a-f]+$/i.test(value)) {
    // EWKB point: byte order, type (with SRID flag), SRID, then X and Y as float64.
    const buf = Buffer.from(value, "hex");
    const le = buf[0] === 1;
    const type = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
    const offset = type & 0x20000000 ? 9 : 5;
    const lng = le ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
    const lat = le ? buf.readDoubleLE(offset + 8) : buf.readDoubleBE(offset + 8);
    return { lat, lng };
  }
  return null;
}

export async function duplicates(issue: IssueDetail) {
  if (issue.lat === null || issue.lng === null) return [];
  const { data, error } = await core().rpc("find_duplicates", {
    p_category: issue.category,
    p_lat: issue.lat,
    p_lng: issue.lng,
    p_radius_m: 500,
  });
  if (error) throw error;
  return ((data ?? []) as { issue_id: string; ref_code: string; title: string; metoo_count: number; distance_m: number }[])
    .filter((d) => d.issue_id !== issue.id);
}

export async function agenciesFor(issue: IssueDetail) {
  const { data, error } = await core()
    .from("agencies")
    .select("id, name, categories")
    .eq("city", issue.city)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  const rows = (data ?? []) as { id: string; name: string; categories: Category[] }[];
  // Agencies that handle this category first.
  return rows
    .map((a) => ({ ...a, suggested: a.categories.includes(issue.category) }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested));
}
