/**
 * Location privacy for police reports. Exact coordinates are never stored:
 * they are snapped to a grid of about 1 km (0.01° ≈ 1.1 km at Nigeria's latitudes).
 */
export const GRID_DEGREES = 0.01;

export function gridCell(lat: number, lng: number, size = GRID_DEGREES): string {
  const row = Math.floor(lat / size);
  const col = Math.floor(lng / size);
  return `${row}:${col}`;
}

/** Centre of a grid cell, for drawing aggregates on a map. */
export function cellCentre(cell: string, size = GRID_DEGREES): { lat: number; lng: number } {
  const [row, col] = cell.split(":").map(Number);
  return { lat: (row! + 0.5) * size, lng: (col! + 0.5) * size };
}

/** Headers that could identify a reporter. The Worker never reads them. */
export const IDENTIFYING_HEADERS = [
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
  "true-client-ip",
  "user-agent",
  "cf-ipcountry",
  "cf-ray",
  "cookie",
] as const;
