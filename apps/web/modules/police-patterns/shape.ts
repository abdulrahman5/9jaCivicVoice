/**
 * Pure shaping for the public police patterns page (docs/POLICE.md, section 5).
 * Counts arrive as bands only; nothing here can recover an exact number.
 */

export const BANDS = ["3-5", "6-10", "11-25", "26+"] as const;
export type Band = (typeof BANDS)[number];
export const BAND_LABELS: Record<Band, string> = { "3-5": "3–5", "6-10": "6–10", "11-25": "11–25", "26+": "26 or more" };

export type PatternKind = "misconduct" | "commendation";
export type KindFilter = PatternKind | "all";

export interface AreaRow {
  period_start: string;
  city: "lagos" | "fct";
  grid_cell: string;
  kind: PatternKind;
  incident_type: string;
  band: Band;
  lat: number;
  lng: number;
  lga: string | null;
}

export interface OutlineRow {
  name: string;
  svg_path: string;
  min_lng: number;
  min_lat: number;
  max_lng: number;
  max_lat: number;
  label_lng: number;
  label_lat: number;
}

export interface ForwardingRow {
  period_start: string;
  recipient: "cru" | "psc";
  forwarded: number;
  acknowledged: number;
  action_reported: number;
  no_response: number;
}

const GRID = 0.01;
const bandRank = (b: Band) => BANDS.indexOf(b);

/** The highest band among several (bands can't be added up: they're ranges). */
export function maxBand(bands: Band[]): Band {
  return bands.reduce((a, b) => (bandRank(b) > bandRank(a) ? b : a), BANDS[0]);
}

/** SVG square for a "row:col" cell, in degrees, with y as negated latitude (matching ST_AsSVG). */
export function cellRect(gridCell: string) {
  const [row, col] = gridCell.split(":").map(Number) as [number, number];
  return { x: col * GRID, y: -(row + 1) * GRID, size: GRID };
}

export interface MapCell {
  grid_cell: string;
  lga: string | null;
  lat: number;
  lng: number;
  band: Band;
  entries: { kind: PatternKind; incident_type: string; band: Band }[];
}

/** One cell per area for the map: shaded by the highest band of any single type in it. */
export function mapCells(areas: AreaRow[]): MapCell[] {
  const byCell = new Map<string, MapCell>();
  for (const a of areas) {
    const cell = byCell.get(a.grid_cell) ?? { grid_cell: a.grid_cell, lga: a.lga, lat: a.lat, lng: a.lng, band: a.band, entries: [] };
    cell.entries.push({ kind: a.kind, incident_type: a.incident_type, band: a.band });
    cell.band = maxBand(cell.entries.map((e) => e.band));
    byCell.set(a.grid_cell, cell);
  }
  return [...byCell.values()].sort((a, b) => bandRank(b.band) - bandRank(a.band) || a.grid_cell.localeCompare(b.grid_cell));
}

/** SVG viewBox (degrees, y negated) covering the city's LGAs and every cell, with a little margin. */
export function mapViewBox(outlines: OutlineRow[], cells: MapCell[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const o of outlines) {
    xs.push(o.min_lng, o.max_lng);
    ys.push(o.min_lat, o.max_lat);
  }
  for (const c of cells) {
    const r = cellRect(c.grid_cell);
    xs.push(r.x, r.x + r.size);
    ys.push(-r.y, -r.y - r.size);
  }
  if (xs.length === 0) return null;
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(maxX - minX, maxY - minY) * 0.05 || GRID;
  return { x: minX - pad, y: -maxY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad };
}

/** Published areas per month (exact: it counts areas, not reports), including months with none. */
export function areasByMonth(periods: string[], areas: AreaRow[]) {
  return [...periods].sort().map((period) => ({
    period,
    areas: new Set(areas.filter((a) => a.period_start === period).map((a) => a.grid_cell)).size,
  }));
}

export interface RecipientSummary {
  recipient: "cru" | "psc";
  forwarded: number;
  responded: number;
  no_response: number;
  awaiting: number;
  /** Share of forwards acknowledged or acted on, 0-100; null with nothing forwarded. */
  response_rate: number | null;
}

export function forwardingSummary(rows: ForwardingRow[]): RecipientSummary[] {
  return (["cru", "psc"] as const).map((recipient) => {
    const mine = rows.filter((r) => r.recipient === recipient);
    const sum = (k: keyof Omit<ForwardingRow, "period_start" | "recipient">) => mine.reduce((n, r) => n + r[k], 0);
    const forwarded = sum("forwarded");
    const responded = sum("acknowledged") + sum("action_reported");
    const no_response = sum("no_response");
    return {
      recipient,
      forwarded,
      responded,
      no_response,
      awaiting: forwarded - responded - no_response,
      response_rate: forwarded ? Math.round((responded / forwarded) * 100) : null,
    };
  });
}

/** "2026-09-01" → "September 2026". */
export const monthLabel = (period: string) =>
  new Date(`${period}T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
