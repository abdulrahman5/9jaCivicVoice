// Creates (or refreshes) a staff account. There is no public sign-up.
//
//   pnpm --filter @civicvoice/web staff:create <email> "<display name>" <moderator|admin|police_moderator>
//
// Without STAFF_PASSWORD, generates a one-time password and prints it once.
// With STAFF_PASSWORD (used by the preview workflow), sets that password and
// never prints it: workflow logs on a public repo are public.
// Safe to re-run: an existing account is updated, not duplicated.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["moderator", "admin", "police_moderator"];

// Known causes, matched against the error text, so the message says what to change.
const HINTS: [RegExp, string][] = [
  [/invalid schema/i, "Expose the core, ops and public_read schemas in Supabase (Project Settings → Data API), then re-run."],
  [/invalid api key|not allowed|jwt|unauthori[sz]ed|forbidden/i, "The key must be the service_role / secret key, not the anon / publishable one."],
  [/fetch failed|enotfound|invalid path|invalid (supabase)?url|econnrefused/i, "SUPABASE_URL must be exactly https://<ref>.supabase.co (no /rest/v1, no trailing slash)."],
];

// In GitHub Actions, "::error::" lines also appear on the run's summary page, so
// the cause is visible without opening the step log. Never pass a secret here.
function fail(message: string): never {
  const hint = HINTS.find(([pattern]) => pattern.test(message))?.[1];
  const text = hint ? `${message} ${hint}` : message;
  console.error(process.env.GITHUB_ACTIONS === "true" ? `::error title=staff:create failed::${text}` : text);
  process.exit(1);
}
const [email, displayName, role] = process.argv.slice(2);

if (!email || !displayName || !role || !ROLES.includes(role)) {
  fail('Usage: staff:create <email> "<display name>" <moderator|admin|police_moderator>');
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in apps/web/.env.local).");
}

const providedPassword = process.env.STAFF_PASSWORD;
if (providedPassword !== undefined && providedPassword.length < 12) {
  fail("STAFF_PASSWORD must be at least 12 characters.");
}
const password = providedPassword || randomBytes(18).toString("base64url");

function connect(supabaseUrl: string, serviceKey: string) {
  try {
    return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
const supabase = connect(url, key);

async function findUserId(address: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 100) return null;
  }
  return null;
}

let userId = await findUserId(email).catch((e: unknown) =>
  fail(`Could not look up existing users: ${e instanceof Error ? e.message : String(e)}`),
);
let created = false;
if (userId) {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) {
    fail(`Could not update the existing user: ${error.message}`);
  }
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    fail(`Could not create the user: ${error?.message}`);
  }
  userId = data.user.id;
  created = true;
}

const { error: staffError } = await supabase
  .schema("ops")
  .from("staff")
  .upsert({ user_id: userId, display_name: displayName, role, active: true });
if (staffError) {
  if (created) await supabase.auth.admin.deleteUser(userId);
  fail(`Could not save the staff profile: ${staffError.message}`);
}

console.log(`${created ? "Created" : "Updated"} ${role} ${displayName} <${email}>`);
if (providedPassword) {
  console.log("Password set from STAFF_PASSWORD (not shown).");
} else {
  console.log(`One-time password: ${password}`);
  console.log("Share it privately. They'll set up an authenticator app at first sign-in.");
}
