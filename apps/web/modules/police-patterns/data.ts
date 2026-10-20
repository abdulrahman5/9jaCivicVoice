import "server-only";
import { civicPublicClient } from "@civicvoice/db";
import { isConfigured } from "../env";
import type { AreaRow, ForwardingRow, OutlineRow } from "./shape";

/** Reads for /police, from public_read only (anon key). */

export interface PolicePatternsData {
  periods: string[];
  areas: AreaRow[];
  outlines: OutlineRow[];
  forwarding: ForwardingRow[];
}

export async function policePatterns(city: "lagos" | "fct"): Promise<PolicePatternsData> {
  if (!isConfigured("supabase")) return { periods: [], areas: [], outlines: [], forwarding: [] };
  const db = civicPublicClient().schema("public_read");
  const [periods, areas, outlines, forwarding] = await Promise.all([
    db.from("police_periods").select("period_start").order("period_start"),
    db.from("police_areas").select("*").eq("city", city),
    db
      .from("lga_outlines")
      .select("name, svg_path, min_lng, min_lat, max_lng, max_lat, label_lng, label_lat")
      .eq("city", city),
    db
      .from("police_forwarding")
      .select("period_start, recipient, forwarded, acknowledged, action_reported, no_response")
      .eq("city", city)
      .order("period_start"),
  ]);
  for (const res of [periods, areas, outlines, forwarding]) if (res.error) throw res.error;
  const num = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) =>
    rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k])])) }));
  return {
    periods: (periods.data ?? []).map((p) => p.period_start as string),
    areas: num(areas.data ?? [], ["lat", "lng"]) as AreaRow[],
    outlines: num(outlines.data ?? [], ["min_lng", "min_lat", "max_lng", "max_lat", "label_lng", "label_lat"]) as OutlineRow[],
    forwarding: (forwarding.data ?? []) as ForwardingRow[],
  };
}
