import { NextResponse, type NextRequest } from "next/server";
import { isConfigured } from "@/modules/env";
import { lookup } from "@/modules/election/lookup";
import { CACHE_SECONDS, parseLookupQuery } from "@/modules/election/schemas";
import { rateLimit } from "@/modules/rate-limit";

/**
 * GET /api/election/units: polling-unit lookup for the report flows and "Find your polling
 * unit" (task E3). Read-only. Modes and parameters: modules/election/schemas.ts.
 */
export async function GET(req: NextRequest) {
  // Generous: on mobile networks many voters share one IP address.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`pu-lookup:${ip}`, { limit: 300, windowMs: 60_000 })).allowed) {
    return NextResponse.json({ error: "Too many lookups. Wait a minute and try again." }, { status: 429 });
  }
  if (!isConfigured("supabase")) {
    return NextResponse.json({ error: "Polling-unit lookup isn't available on this deployment." }, { status: 503 });
  }

  const parsed = parseLookupQuery(req.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await lookup(parsed.query);
    const seconds = CACHE_SECONDS[parsed.query.mode];
    const status = "unit" in result && result.unit === null ? 404 : 200;
    return NextResponse.json(status === 404 ? { error: "No polling unit with that code.", unit: null } : result, {
      status,
      headers: {
        "Cache-Control": seconds ? `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 7}` : "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed. Try again in a moment." }, { status: 502 });
  }
}
