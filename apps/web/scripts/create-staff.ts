// Creates a staff account (there is no public sign-up).
//
//   pnpm --filter @civicvoice/web staff:create <email> "<display name>" <moderator|admin|police_moderator>
//
// Prints a one-time password. The person signs in at /login, then must set up
// an authenticator app before they can open the console.
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
const password = randomBytes(18).toString("base64url");

const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (error || !data.user) {
  console.error(`Could not create the user: ${error?.message}`);
  process.exit(1);
}

const { error: staffError } = await supabase
  .schema("ops")
  .from("staff")
  .insert({ user_id: data.user.id, display_name: displayName, role });
if (staffError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error(`Could not create the staff profile: ${staffError.message}`);
  process.exit(1);
}

console.log(`Created ${role} ${displayName} <${email}>`);
console.log(`One-time password: ${password}`);
console.log("Share it privately. They'll set up an authenticator app at first sign-in.");
