import { CVR_STATES, parseLabel, puCode, type Lga, type Snapshot, type StateSnapshot, type Unit } from "./snapshot.ts";

/**
 * Client for INEC's CVR polling-unit locator (cvr.inecnigeria.org), the source of
 * record for the polling-unit list. Its endpoints are undocumented:
 *   GET  /PublicApi/{lgas|wards|pus}/1/Search?data[Search][<parent>_id]=<id>
 *        -> {"<cvr id>": "<code> - <NAME>", ...} (sometimes wrapped in a one-item list)
 *   POST /pu_locator/index (form) -> a redirect to Google Maps with ?q=<lat>,<lng>
 * It's INEC's public server, so requests are few at a time, spaced, and identified.
 */

export const CVR_BASE = "https://cvr.inecnigeria.org";
const USER_AGENT = "CivicVoiceNG polling-unit importer (https://github.com/abdulrahman5/9jaCivicVoice)";

export interface CvrOptions {
  fetchImpl?: typeof fetch;
  /** Requests in flight at once. */
  concurrency?: number;
  /** Pause after each request, per worker. */
  delayMs?: number;
  retries?: number;
}

type Entry = { id: number; code: number; name: string };

export class CvrClient {
  private readonly fetchImpl: typeof fetch;
  private readonly delayMs: number;
  private readonly retries: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  readonly concurrency: number;

  constructor(options: CvrOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.concurrency = options.concurrency ?? 4;
    this.delayMs = options.delayMs ?? 150;
    this.retries = options.retries ?? 3;
  }

  /** Runs fn when a slot is free, so at most `concurrency` requests are in flight. */
  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private async attempt(fn: () => Promise<Response>): Promise<Response> {
    let last: unknown;
    for (let i = 0; i < this.retries; i++) {
      try {
        const res = await fn();
        if (res.status < 500) return res;
        last = new Error(`HTTP ${res.status}`);
      } catch (e) {
        last = e;
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  private async list(kind: "lgas" | "wards" | "pus", parentKey: string, parentId: number): Promise<Entry[]> {
    const url = `${CVR_BASE}/PublicApi/${kind}/1/Search?${new URLSearchParams({ [`data[Search][${parentKey}]`]: String(parentId) })}`;
    const res = await this.slot(() => this.attempt(() => this.fetchImpl(url, { headers: { "User-Agent": USER_AGENT } })));
    if (!res.ok) throw new Error(`${kind} for ${parentKey}=${parentId}: HTTP ${res.status}`);
    const raw = (await res.json()) as unknown;
    const obj = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
    const entries: Entry[] = [];
    for (const [key, value] of Object.entries(obj ?? {})) {
      if (!/^\d+$/.test(key) || key === "0" || typeof value !== "string") continue;
      const parsed = parseLabel(value);
      if (parsed) entries.push({ id: Number(key), ...parsed });
    }
    return entries.sort((a, b) => a.code - b.code);
  }

  lgas = (cvrStateId: number) => this.list("lgas", "state_id", cvrStateId);
  wards = (lgaId: number) => this.list("wards", "local_government_id", lgaId);
  units = (wardId: number) => this.list("pus", "registration_area_id", wardId);

  /** INEC's approximate location for a unit, or null when it has none. */
  async coordinates(ids: { state: number; lga: number; ward: number; unit: number }) {
    const body = new URLSearchParams({
      "data[Search][state_id]": String(ids.state),
      "data[Search][local_government_id]": String(ids.lga),
      "data[Search][registration_area_id]": String(ids.ward),
      "data[Search][polling_unit_id]": String(ids.unit),
    });
    const res = await this.slot(() =>
      this.attempt(() =>
        this.fetchImpl(`${CVR_BASE}/pu_locator/index`, {
          method: "POST",
          body,
          redirect: "manual",
          headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        }),
      ),
    );
    const m = /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(res.headers.get("location") ?? "");
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  }
}

export interface CrawlOptions {
  /** INEC state codes to crawl; all 37 when omitted. */
  states?: number[];
  /** Which units to ask INEC for coordinates: none, all, or those this returns true for. */
  coordinates?: "skip" | "all" | ((code: string) => boolean);
  log?: (message: string) => void;
}

export async function crawl(client: CvrClient, options: CrawlOptions = {}): Promise<Snapshot> {
  const log = options.log ?? (() => {});
  const wantCoordinates = options.coordinates ?? "skip";
  const targets = CVR_STATES.filter((s) => !options.states || options.states.includes(s.inecCode));
  const states: StateSnapshot[] = [];

  for (const target of targets) {
    const lgas: Lga[] = [];
    for (const lga of await client.lgas(target.cvrId)) {
      const wards = await Promise.all(
        (await client.wards(lga.id)).map(async (ward) => {
          const units: Unit[] = await Promise.all(
            (await client.units(ward.id)).map(async (unit) => {
              const code = puCode(target.inecCode, lga.code, ward.code, unit.code);
              const ask = wantCoordinates === "all" || (typeof wantCoordinates === "function" && wantCoordinates(code));
              const point = ask
                ? await client.coordinates({ state: target.cvrId, lga: lga.id, ward: ward.id, unit: unit.id })
                : null;
              return { unit_no: unit.code, name: unit.name, lat: point?.lat ?? null, lng: point?.lng ?? null, inec_id: unit.id };
            }),
          );
          return { code: ward.code, name: ward.name, units };
        }),
      );
      lgas.push({ code: lga.code, name: lga.name, wards });
      log(`${target.name}: ${lga.name} (${wards.length} wards, ${wards.reduce((n, w) => n + w.units.length, 0)} units)`);
    }
    states.push({ code: target.inecCode, name: target.name, lgas });
  }
  return { source: "inec-cvr", fetched_at: new Date().toISOString(), states };
}
