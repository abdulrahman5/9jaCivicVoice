/**
 * A snapshot of INEC's polling-unit list, in INEC's own numbering: state codes 1-36
 * alphabetically and the FCT as 37; LGA, ward and unit numbers as printed in the
 * polling-unit code SS/LL/WW/PPP.
 */

export interface Unit {
  unit_no: number;
  name: string;
  /** Approximate, from INEC's locator. */
  lat: number | null;
  lng: number | null;
  /** INEC's internal id in the CVR portal, when known. */
  inec_id: number | null;
}

export interface Ward {
  code: number;
  name: string;
  units: Unit[];
}

export interface Lga {
  code: number;
  name: string;
  wards: Ward[];
}

export interface StateSnapshot {
  code: number;
  name: string;
  lgas: Lga[];
}

export interface Snapshot {
  /** Where it came from: "inec-cvr" for a crawl, anything else is for development only. */
  source: string;
  fetched_at: string;
  states: StateSnapshot[];
}

/** The CVR portal numbers the FCT alphabetically (15); INEC's codes put it last (37). */
export const CVR_STATES: { cvrId: number; inecCode: number; name: string }[] = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River",
  "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
  "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
].map((name, i) => {
  const cvrId = i + 1;
  return { cvrId, inecCode: cvrId < 15 ? cvrId : cvrId === 15 ? 37 : cvrId - 1, name };
});

export const inecCodeForCvrState = (cvrId: number) => CVR_STATES.find((s) => s.cvrId === cvrId)?.inecCode;

/** "01 - AGEGE" -> { code: 1, name: "AGEGE" }. Null when the label doesn't start with a number. */
export function parseLabel(label: string): { code: number; name: string } | null {
  const m = /^\s*(\d{1,3})\s*-\s*(.*?)\s*$/.exec(label);
  if (!m) return null;
  const code = Number(m[1]);
  return code > 0 && m[2] ? { code, name: m[2] } : null;
}

export const puCode = (state: number, lga: number, ward: number, unit: number) =>
  `${String(state).padStart(2, "0")}/${String(lga).padStart(2, "0")}/${String(ward).padStart(2, "0")}/${String(unit).padStart(3, "0")}`;

export function* unitsOf(snapshot: Snapshot) {
  for (const s of snapshot.states)
    for (const l of s.lgas)
      for (const w of l.wards) for (const u of w.units) yield { state: s, lga: l, ward: w, unit: u, code: puCode(s.code, l.code, w.code, u.unit_no) };
}

export function countOf(snapshot: Snapshot) {
  let lgas = 0;
  let wards = 0;
  let units = 0;
  let withCoordinates = 0;
  for (const s of snapshot.states)
    for (const l of s.lgas) {
      lgas++;
      for (const w of l.wards) {
        wards++;
        units += w.units.length;
        withCoordinates += w.units.filter((u) => u.lat !== null && u.lng !== null).length;
      }
    }
  return { states: snapshot.states.length, lgas, wards, units, withCoordinates };
}
