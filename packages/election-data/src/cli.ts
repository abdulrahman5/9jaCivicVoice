#!/usr/bin/env node
/**
 * Polling-unit importer (docs/ELECTIONS.md, task E2).
 *
 *   crawl --out <file> [--states 24,37] [--coordinates skip|all|missing] [--concurrency 4] [--delay 150]
 *       Crawls INEC's CVR polling-unit locator into a snapshot file.
 *       "missing" asks INEC only for units the database has no coordinates for.
 *   from-scraped <dir> --out <file>
 *       Converts a third-party scrape into a snapshot. Development and testing only.
 *   check <file> [--against <csv>] [--min-units <n>]
 *       Validates a snapshot, and compares it with another list (e.g. the IReV-derived CSV).
 *   load <file> [--deactivate-missing]
 *       Loads a snapshot into the election schema, LGA by LGA. Never deletes.
 *
 * crawl --coordinates missing and load need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Snapshots are not committed: INEC publishes no terms for this data (docs/ELECTIONS.md).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { crawl, CvrClient } from "./cvr.ts";
import { crossCheck, parseCsv } from "./crosscheck.ts";
import { loadSnapshot, type LgaResult } from "./load.ts";
import { fromScraped } from "./scraped.ts";
import type { Snapshot } from "./snapshot.ts";
import { validate } from "./validate.ts";

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? (rest[i + 1] ?? "") : undefined;
};
const has = (name: string) => rest.includes(`--${name}`);
const positional = rest.find((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));
const log = (m: string) => process.stderr.write(`${m}\n`);

function fail(message: string): never {
  process.stderr.write(`${process.env.GITHUB_ACTIONS === "true" ? "::error::" : ""}${message}\n`);
  process.exit(1);
}

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "election" } });
}

const readSnapshot = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Snapshot;
const writeSnapshot = (file: string, snapshot: Snapshot) => writeFileSync(file, JSON.stringify(snapshot));

async function main() {
  switch (command) {
    case "crawl": {
      const out = flag("out") ?? fail("crawl needs --out <file>");
      const states = flag("states")?.split(",").map(Number).filter(Boolean);
      const mode = flag("coordinates") ?? "skip";
      let coordinates: "skip" | "all" | ((code: string) => boolean) = "skip";
      if (mode === "all") coordinates = "all";
      else if (mode === "missing") {
        const db = database();
        const known = new Set<string>();
        for (const state of states ?? Array.from({ length: 37 }, (_, i) => i + 1)) {
          for (let from = 0; ; from += 1000) {
            const { data, error } = await db.rpc("units_with_coordinates", { p_state_code: state }).range(from, from + 999);
            if (error) fail(`Reading existing coordinates: ${error.message}`);
            for (const code of (data ?? []) as string[]) known.add(code);
            if (!data || data.length < 1000) break;
          }
        }
        log(`${known.size} units already have coordinates; asking INEC for the rest`);
        coordinates = (code) => !known.has(code);
      } else if (mode !== "skip") fail("--coordinates is skip, all or missing");

      const client = new CvrClient({ concurrency: Number(flag("concurrency") ?? 4), delayMs: Number(flag("delay") ?? 150) });
      const snapshot = await crawl(client, { states, coordinates, log });
      writeSnapshot(out, snapshot);
      console.log(JSON.stringify({ written: out, ...validate(snapshot).counts }));
      return;
    }

    case "from-scraped": {
      if (!positional) fail("from-scraped needs a directory");
      const out = flag("out") ?? fail("from-scraped needs --out <file>");
      const snapshot = fromScraped(positional);
      writeSnapshot(out, snapshot);
      console.log(JSON.stringify({ written: out, ...validate(snapshot).counts }));
      return;
    }

    case "check": {
      if (!positional) fail("check needs a snapshot file");
      const result = validate(readSnapshot(positional));
      const report: Record<string, unknown> = { counts: result.counts, notes: result.notes, errors: result.errors };
      const against = flag("against");
      if (against) {
        const rows = parseCsv(readFileSync(against, "utf8")).map((r) => ({ code: r.code ?? "", name: r.location ?? r.name ?? "" }));
        const cc = crossCheck(result.snapshot, rows);
        report.crossCheck = { ...cc, onlyOurs: cc.onlyOurs.slice(0, 20), onlyTheirs: cc.onlyTheirs.slice(0, 20), onlyOursCount: cc.onlyOurs.length, onlyTheirsCount: cc.onlyTheirs.length };
      }
      console.log(JSON.stringify(report, null, 2));
      const minUnits = Number(flag("min-units") ?? 0);
      if (result.errors.length) fail(`${result.errors.length} errors: not safe to load`);
      if (result.counts.units < minUnits) fail(`only ${result.counts.units} units, expected at least ${minUnits}: incomplete crawl?`);
      return;
    }

    case "load": {
      if (!positional) fail("load needs a snapshot file");
      const raw = readSnapshot(positional);
      const deactivateMissing = has("deactivate-missing");
      if (deactivateMissing && raw.source !== "inec-cvr") {
        fail("--deactivate-missing only applies to a crawl of INEC's portal, never a development copy");
      }
      const result = validate(raw);
      if (result.errors.length) fail(`Snapshot has errors; run check first:\n${result.errors.slice(0, 10).join("\n")}`);
      for (const n of result.notes) log(`note: ${n}`);
      const db = database();
      const total = await loadSnapshot(
        result.snapshot,
        async (stateCode, lga, deactivate) => {
          const { data, error } = await db.rpc("import_lga", { p_state_code: stateCode, p_lga: lga, p_deactivate_missing: deactivate });
          if (error) throw new Error(`state ${stateCode}, LGA ${lga.code}: ${error.message}`);
          return data as LgaResult;
        },
        { deactivateMissing, log },
      );
      console.log(JSON.stringify({ ...total, source: raw.source, fetched_at: raw.fetched_at }));
      return;
    }

    default:
      fail("Commands: crawl, from-scraped, check, load (see the top of src/cli.ts)");
  }
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
