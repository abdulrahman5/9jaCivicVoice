"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { civicServiceClient } from "@civicvoice/db";
import { resolveAgencyToken } from "@/modules/agency-response";

const Input = z.object({
  token: z.string().min(10),
  status: z.enum(["acknowledged", "in_progress", "resolved"]),
  note: z.string().trim().min(10).max(1000),
});

/**
 * Posts an agency update through core.change_status(), which re-checks the
 * transition in SQL, writes the status event and enqueues notify_citizen.
 */
export async function respondAsAgency(formData: FormData) {
  const input = Input.parse(Object.fromEntries(formData));
  const payload = await resolveAgencyToken(input.token);
  if (!payload) throw new Error("This link is no longer valid.");

  const { error } = await civicServiceClient().schema("core").rpc("change_status", {
    p_issue_id: payload.issueId,
    p_to_status: input.status,
    p_actor_type: "agency",
    p_actor_id: payload.agencyId,
    p_public_note: input.note,
  });
  if (error) throw error;
  revalidatePath(`/r/${input.token}`);
}
