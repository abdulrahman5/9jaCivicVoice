import "server-only";
import { redirect } from "next/navigation";
import { civicServiceClient } from "@civicvoice/db";
import { currentStaff, type Staff } from "../auth";

/**
 * Election moderators (task E5): geographic roles, invites, the team, training and practice.
 * The database functions check the actor's scope themselves; this module only finds the
 * signed-in actor and turns database refusals into messages.
 */

export type ElectionRole = "lga_moderator" | "state_coordinator" | "national_admin";

export interface ElectionStaff extends Staff {
  electionRole: ElectionRole;
  stateCode: number | null;
  lgaCode: number | null;
  trained: boolean;
  areaName: string;
}

export const ROLE_LABEL: Record<ElectionRole, string> = {
  lga_moderator: "LGA moderator",
  state_coordinator: "State coordinator",
  national_admin: "National admin",
};

const election = () => civicServiceClient().schema("election");

/** A database refusal worth showing as is (scope, single use, expiry, limits). */
export class ElectionStaffError extends Error {}

function fail(error: { message: string; code?: string }): never {
  if (["42501", "P0001", "P0002", "22023"].includes(error.code ?? "")) {
    throw new ElectionStaffError(error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".");
  }
  throw new Error(error.message);
}

async function scopeOf(userId: string) {
  const { data, error } = await election().rpc("staff_scope", { p_user: userId });
  if (error) fail(error);
  return ((data ?? []) as { role: ElectionRole; state_code: number | null; lga_code: number | null; trained: boolean }[])[0] ?? null;
}

async function areaName(stateCode: number | null, lgaCode: number | null) {
  if (stateCode == null) return "All states and the FCT";
  const { data: state } = await election().from("states").select("name").eq("code", stateCode).single();
  if (lgaCode == null) return state?.name ?? "";
  const { data: lga } = await election().from("lgas").select("name").eq("state_code", stateCode).eq("code", lgaCode).single();
  return `${lga?.name ?? ""}, ${state?.name ?? ""}`;
}

/** The signed-in staff member's election role, or null if they have none. */
export async function currentElectionStaff(): Promise<ElectionStaff | null> {
  const staff = await currentStaff();
  if (!staff) return null;
  const scope = await scopeOf(staff.userId);
  if (!scope) return null;
  return {
    ...staff,
    electionRole: scope.role,
    stateCode: scope.state_code,
    lgaCode: scope.lga_code,
    trained: scope.trained,
    areaName: await areaName(scope.state_code, scope.lga_code),
  };
}

/** For election pages and actions. `roles` narrows further (e.g. coordinators only). */
export async function requireElectionStaff(roles?: ElectionRole[]): Promise<ElectionStaff> {
  const staff = await currentElectionStaff();
  if (!staff) {
    if (await currentStaff()) throw new ElectionStaffError("You don't have an election role.");
    redirect("/login");
  }
  if (roles && !roles.includes(staff.electionRole)) throw new ElectionStaffError("You don't have permission to do that.");
  return staff;
}

// Invites ---------------------------------------------------------------------------------------

export interface InviteDetails {
  status: "open" | "used" | "revoked" | "expired";
  role: Exclude<ElectionRole, "national_admin">;
  state_name: string;
  lga_name: string | null;
  inviter: string;
}

/** Invite tokens are 32 URL-safe characters. Anything else is not worth a database call. */
export const INVITE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

export async function inviteDetails(token: string): Promise<InviteDetails | null> {
  if (!INVITE_TOKEN.test(token)) return null;
  const { data, error } = await election().rpc("invite_details", { p_token: token });
  if (error) fail(error);
  return ((data ?? []) as InviteDetails[])[0] ?? null;
}

export async function createInvite(actor: ElectionStaff, input: { role: string; state: number; lga: number | null; note: string }) {
  const { data, error } = await election().rpc("create_invite", {
    p_actor: actor.userId,
    p_role: input.role,
    p_state: input.state,
    p_lga: input.lga,
    p_note: input.note,
  });
  if (error) fail(error);
  return ((data ?? []) as { id: string; token: string; expires_at: string }[])[0]!;
}

export async function revokeInvite(actor: ElectionStaff, inviteId: string) {
  const { error } = await election().rpc("revoke_invite", { p_actor: actor.userId, p_invite: inviteId });
  if (error) fail(error);
}

export async function openInvites(actor: ElectionStaff) {
  const { data, error } = await election().rpc("open_invites", { p_actor: actor.userId });
  if (error) fail(error);
  return (data ?? []) as {
    id: string;
    role: ElectionRole;
    state_name: string;
    lga_name: string | null;
    note: string;
    created_at: string;
    expires_at: string;
  }[];
}

/**
 * Joins with an invite: creates the account, then redeems the link. The account is deleted
 * again if redeeming fails (used, cancelled, expired, or someone else got there first).
 */
export async function joinWithInvite(input: { token: string; displayName: string; email: string; password: string }) {
  const admin = civicServiceClient().auth.admin;
  const { data, error } = await admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      throw new ElectionStaffError("That email already has an account. Use another email, or ask your coordinator.");
    }
    throw new Error(error?.message ?? "Couldn't create the account");
  }
  const { error: redeemError } = await election().rpc("redeem_invite", {
    p_token: input.token,
    p_user: data.user.id,
    p_display_name: input.displayName,
  });
  if (redeemError) {
    await admin.deleteUser(data.user.id);
    fail(redeemError);
  }
}

// The team --------------------------------------------------------------------------------------

export interface TeamMember {
  user_id: string;
  display_name: string;
  role: ElectionRole;
  state_name: string | null;
  lga_name: string | null;
  active: boolean;
  trained: boolean;
  created_at: string;
}

export async function team(actor: ElectionStaff): Promise<TeamMember[]> {
  const { data, error } = await election().rpc("team", { p_actor: actor.userId });
  if (error) fail(error);
  return (data ?? []) as TeamMember[];
}

export async function setStaffActive(actor: ElectionStaff, userId: string, active: boolean) {
  const { error } = await election().rpc("set_staff_active", { p_actor: actor.userId, p_user: userId, p_active: active });
  if (error) fail(error);
}

/** States and LGAs the actor can invite into, for the invite form. */
export async function invitableAreas(actor: ElectionStaff) {
  let states = election().from("states").select("code, name").order("code");
  let lgas = election().from("lgas").select("state_code, code, name").order("name");
  if (actor.electionRole !== "national_admin") {
    states = states.eq("code", actor.stateCode!);
    lgas = lgas.eq("state_code", actor.stateCode!);
  }
  const [s, l] = await Promise.all([states, lgas]);
  if (s.error) fail(s.error);
  if (l.error) fail(l.error);
  return { states: s.data as { code: number; name: string }[], lgas: l.data as { state_code: number; code: number; name: string }[] };
}

// Training and practice -------------------------------------------------------------------------

export async function recordTraining(actor: ElectionStaff) {
  const { error } = await election().rpc("record_training", { p_user: actor.userId });
  if (error) fail(error);
}

export async function seedPractice(actor: ElectionStaff): Promise<number> {
  const { data, error } = await election().rpc("seed_practice", { p_actor: actor.userId });
  if (error) fail(error);
  return data as number;
}

export async function resetPractice(actor: ElectionStaff): Promise<number> {
  const { data, error } = await election().rpc("reset_practice", { p_actor: actor.userId });
  if (error) fail(error);
  return data as number;
}

export interface ScopedIncident {
  id: number;
  pu_code: string;
  pu_name: string;
  ward_name: string;
  lga_name: string;
  state_name: string;
  category: string;
  category_label: string;
  severity: "critical" | "high" | "medium" | "info";
  label: "reported" | "corroborated" | "verified" | "rejected";
  sender_count: number;
  first_reported_at: string;
  last_reported_at: string;
}

export async function incidentsInScope(actor: ElectionStaff, electionId: string): Promise<ScopedIncident[]> {
  const { data, error } = await election().rpc("incidents_in_scope", { p_actor: actor.userId, p_election: electionId });
  if (error) fail(error);
  return (data ?? []) as ScopedIncident[];
}
