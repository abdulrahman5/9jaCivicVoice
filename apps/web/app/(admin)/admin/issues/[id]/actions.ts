"use server";

import { revalidatePath } from "next/cache";
import { civicServiceClient } from "@civicvoice/db";
import { requireStaff } from "@/modules/auth";
import { createAgencyLink } from "@/modules/moderation/agency-links";
import { EditInput, MergeInput, RejectInput, RouteInput, friendlyDbError } from "@/modules/moderation/schemas";
import { enqueue } from "@/modules/queue";

/**
 * Moderation actions (wireframe 3.1, PRD F6). Each one: check the staff
 * session, validate, call one SQL function (which re-checks state and audits),
 * then refresh the page.
 */

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
  agencyLink?: string;
}

const core = () => civicServiceClient().schema("core");
const form = (fd: FormData) => Object.fromEntries(fd);
const refresh = (issueId: string) => {
  revalidatePath(`/admin/issues/${issueId}`);
  revalidatePath("/admin");
};

export async function verifyIssue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const issueId = String(fd.get("issueId"));
  const { error } = await core().rpc("change_status", {
    p_issue_id: issueId,
    p_to_status: "verified",
    p_actor_type: "moderator",
    p_actor_id: staff.userId,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(issueId);
  return { ok: true, message: "Verified. Now route it to an agency." };
}

export async function routeIssue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = RouteInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { issueId, agencyId } = parsed.data;

  const { error } = await core().rpc("route_issue", {
    p_issue_id: issueId,
    p_agency_id: agencyId,
    p_moderator_id: staff.userId,
  });
  if (error) return { error: friendlyDbError(error) };

  await enqueue("forward_agency", `forward:${issueId}:${agencyId}`, { issue_id: issueId, agency_id: agencyId });
  // The page re-renders in its "forwarded" state, where the Agency link panel
  // creates the link to send. (A link returned here would vanish with this form.)
  refresh(issueId);
  return { ok: true, message: "Forwarded." };
}

/** A no-login response link for the agency the issue was routed to (also for lost or expired links). */
export async function newAgencyLink(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const issueId = String(fd.get("issueId"));
  const { data: issue } = await core().from("issues").select("agency_id").eq("id", issueId).maybeSingle();
  if (!issue?.agency_id) return { error: "This issue hasn't been routed to an agency yet." };
  const agencyLink = await createAgencyLink(issueId, issue.agency_id);
  return {
    ok: true,
    message: "Send the agency this link. It's valid for 30 days and lets them reply without an account.",
    agencyLink,
  };
}

export async function rejectIssue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = RejectInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await core().rpc("reject_issue", {
    p_issue_id: parsed.data.issueId,
    p_moderator_id: staff.userId,
    p_reason: parsed.data.publicNote,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(parsed.data.issueId);
  return { ok: true, message: "Rejected. The reporter will see the reason." };
}

export async function mergeIssue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = MergeInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { data: target } = await core().from("issues").select("id").eq("ref_code", parsed.data.targetRef).maybeSingle();
  if (!target) return { error: `No issue ${parsed.data.targetRef}.` };

  const { error } = await core().rpc("merge_issue", {
    p_issue_id: parsed.data.issueId,
    p_into_id: target.id,
    p_moderator_id: staff.userId,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(parsed.data.issueId);
  revalidatePath(`/admin/issues/${target.id}`);
  return { ok: true, message: `Merged into ${parsed.data.targetRef}. Its reporters will get that issue's updates.` };
}

export async function editIssue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = EditInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const v = parsed.data;

  const { error } = await core().rpc("moderate_update", {
    p_issue_id: v.issueId,
    p_moderator_id: staff.userId,
    p_category: v.category,
    p_subcategory: v.subcategory,
    p_lat: v.lat ?? null,
    p_lng: v.lng ?? null,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(v.issueId);
  return { ok: true, message: "Saved." };
}
