"use server";

import { revalidatePath } from "next/cache";
import { vaultServiceClient } from "@civicvoice/vault-db";
import { requireStaff } from "@/modules/auth";
import { friendlyDbError } from "@/modules/moderation/schemas";
import { RECIPIENT_LABELS } from "@/modules/vault/labels";
import {
  ForwardOutcomeInput,
  ForwardTextInput,
  PoliceRejectInput,
  PoliceReplyInput,
  PoliceStatusInput,
  RecordForwardInput,
  identifyingHints,
} from "@/modules/vault/schemas";

/**
 * Police moderation actions (docs/POLICE.md, section 3). Each one: check the
 * police_moderator session, validate, call one vault function (which re-checks
 * state and writes police.access_log), then refresh.
 */

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

const police = () => vaultServiceClient();
const form = (fd: FormData) => Object.fromEntries(fd);
const refresh = (reportId: string) => {
  revalidatePath(`/admin/police/${reportId}`);
  revalidatePath("/admin/police");
};
const STATUS_DONE = { consistent: "Marked consistent. Prepare the redacted copy to forward it.", closed: "Closed." };

export async function setPoliceStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff(["police_moderator"]);
  const parsed = PoliceStatusInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await police().rpc("set_status", {
    p_report_id: parsed.data.reportId,
    p_moderator_id: staff.userId,
    p_status: parsed.data.status,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(parsed.data.reportId);
  return { ok: true, message: STATUS_DONE[parsed.data.status] };
}

export async function rejectPoliceReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff(["police_moderator"]);
  const parsed = PoliceRejectInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await police().rpc("set_status", {
    p_report_id: parsed.data.reportId,
    p_moderator_id: staff.userId,
    p_status: "rejected",
    p_reason: parsed.data.publicReason,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(parsed.data.reportId);
  return { ok: true, message: "Rejected. The reporter sees the reason on their status page." };
}

export async function saveForwardText(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff(["police_moderator"]);
  const parsed = ForwardTextInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await police().rpc("save_forward_text", {
    p_report_id: parsed.data.reportId,
    p_moderator_id: staff.userId,
    p_text: parsed.data.text,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(parsed.data.reportId);
  const hints = identifyingHints(parsed.data.text);
  return hints.length
    ? { ok: true, message: `Saved, but check it: it looks like it still contains ${hints.join(", ")}.` }
    : { ok: true, message: "Saved." };
}

export async function replyToReporter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff(["police_moderator"]);
  const parsed = PoliceReplyInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { error } = await police().rpc("reply", {
    p_report_id: parsed.data.reportId,
    p_moderator_id: staff.userId,
    p_body: parsed.data.body,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(parsed.data.reportId);
  return { ok: true, message: "Sent. The reporter sees it next time they check their code." };
}

export async function recordForward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff(["police_moderator"]);
  const parsed = RecordForwardInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const v = parsed.data;

  const { error } = await police().rpc("record_forward", {
    p_report_id: v.reportId,
    p_moderator_id: staff.userId,
    p_recipient: v.recipient,
    p_channel: v.channel,
    p_reference: v.reference ?? null,
  });
  if (error) {
    if (error.code === "23505") return { error: `Already recorded as sent to the ${RECIPIENT_LABELS[v.recipient]}.` };
    return { error: friendlyDbError(error) };
  }
  refresh(v.reportId);
  return { ok: true, message: `Recorded as sent to the ${RECIPIENT_LABELS[v.recipient]}.` };
}

export async function setForwardOutcome(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff(["police_moderator"]);
  const parsed = ForwardOutcomeInput.safeParse(form(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const v = parsed.data;

  const { error } = await police().rpc("set_forward_outcome", {
    p_report_id: v.reportId,
    p_moderator_id: staff.userId,
    p_recipient: v.recipient,
    p_outcome: v.outcome,
    p_reference: v.reference ?? null,
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(v.reportId);
  return { ok: true, message: "Outcome saved. The reporter sees it on their status page." };
}
