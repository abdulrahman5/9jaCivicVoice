import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Police vault client. Server-only, and ESLint restricts imports of this
 * package to apps/web/app/(admin) and apps/web/modules/vault.
 *
 * Every read must go through readPoliceReport(), which writes an access_log
 * row in the same database call (see db/vault/supabase/migrations).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VaultClient = SupabaseClient<any, "police">;

export function vaultServiceClient(): VaultClient {
  const url = process.env.VAULT_SUPABASE_URL;
  const key = process.env.VAULT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("VAULT_SUPABASE_URL and VAULT_SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "police" },
  });
}

/** Reads one police report and logs the access atomically (police.read_report RPC). */
export async function readPoliceReport(client: VaultClient, reportId: string, moderatorId: string) {
  const { data, error } = await client.rpc("read_report", {
    p_report_id: reportId,
    p_moderator_id: moderatorId,
  });
  if (error) throw error;
  return data;
}
