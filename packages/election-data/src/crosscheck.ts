import { unitsOf, type Snapshot } from "./snapshot.ts";

/** Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, commas and newlines in quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface CrossCheck {
  ours: number;
  theirs: number;
  onlyOurs: string[];
  onlyTheirs: string[];
  /** Units in both whose names don't start the same way after simplifying. */
  nameDifferences: number;
  /** Per state code: [ours, theirs], where they differ. */
  stateDifferences: Record<number, [number, number]>;
}

/**
 * Compares a snapshot with another list of units (e.g. the IReV-derived CSV, with
 * `code` as SS/LL/WW/PPP and `location` as the name). A sanity check, not a source.
 */
export function crossCheck(snapshot: Snapshot, other: { code: string; name: string }[]): CrossCheck {
  const ours = new Map<string, string>();
  for (const u of unitsOf(snapshot)) ours.set(u.code, u.unit.name);
  const theirs = new Map(other.map((o) => [o.code.trim(), o.name]));
  const onlyOurs = [...ours.keys()].filter((c) => !theirs.has(c)).sort();
  const onlyTheirs = [...theirs.keys()].filter((c) => !ours.has(c)).sort();

  let nameDifferences = 0;
  for (const [code, name] of ours) {
    const t = theirs.get(code);
    if (t === undefined) continue;
    const a = simplify(name).slice(0, 12);
    const b = simplify(t).slice(0, 12);
    if (!a.startsWith(b.slice(0, Math.min(a.length, b.length))) && !b.startsWith(a.slice(0, Math.min(a.length, b.length)))) {
      nameDifferences++;
    }
  }

  const perState = (codes: Iterable<string>) => {
    const counts = new Map<number, number>();
    for (const c of codes) counts.set(Number(c.slice(0, 2)), (counts.get(Number(c.slice(0, 2))) ?? 0) + 1);
    return counts;
  };
  const a = perState(ours.keys());
  const b = perState(theirs.keys());
  const stateDifferences: Record<number, [number, number]> = {};
  for (const s of new Set([...a.keys(), ...b.keys()])) {
    if ((a.get(s) ?? 0) !== (b.get(s) ?? 0)) stateDifferences[s] = [a.get(s) ?? 0, b.get(s) ?? 0];
  }
  return { ours: ours.size, theirs: theirs.size, onlyOurs, onlyTheirs, nameDifferences, stateDifferences };
}
