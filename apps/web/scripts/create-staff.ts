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
const [email, displayName, role] = process.argv.slice(2);

if (!email || !displayName || !role || !ROLES.includes(role)) {
  console.error('Usage: staff:create <email> "<display name>" <moderator|admin|police_moderator>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in apps/web/.env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const providedPassword = process.env.STAFF_PASSWORD;
if (providedPassword !== undefined && providedPassword.length < 12) {
  console.error("STAFF_PASSWORD must be at least 12 characters.");
  process.exit(1);
}
const password = providedPassword || randomBytes(18).toString("base64url");

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

let userId = await findUserId(email);
let created = false;
if (userId) {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error(`Could not update the existing user: ${error.message}`);
    process.exit(1);
  }
} else {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    console.error(`Could not create the user: ${error?.message}`);
    process.exit(1);
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
  console.error(`Could not save the staff profile: ${staffError.message}`);
  process.exit(1);
}

console.log(`${created ? "Created" : "Updated"} ${role} ${displayName} <${email}>`);
if (providedPassword) {
  console.log("Password set from STAFF_PASSWORD (not shown).");
} else {
  console.log(`One-time password: ${password}`);
  console.log("Share it privately. They'll set up an authenticator app at first sign-in.");
}
