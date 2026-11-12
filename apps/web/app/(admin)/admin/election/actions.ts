"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/modules/env";
import {
  ElectionStaffError,
  createInvite,
  recordTraining,
  requireElectionStaff,
  resetPractice,
  revokeInvite,
  seedPractice,
  setStaffActive,
} from "@/modules/election/staff";
import { gradeTraining } from "@/modules/election/training";

/** Election console actions (task E5). The database checks every actor's scope again. */

export interface ActionState {
  error?: string;
  message?: string;
}

async function guarded(run: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await run()) ?? {};
  } catch (e) {
    if (e instanceof ElectionStaffError) return { error: e.message };
    throw e;
  }
}

// Practice ----------------------------------------------------------------------------------------

export async function addPracticeReports(): Promise<ActionState> {
  return guarded(async () => {
    const n = await seedPractice(await requireElectionStaff());
    revalidatePath("/admin/election");
    return { message: `Added ${n} practice reports.` };
  });
}

export async function clearPracticeReports(): Promise<ActionState> {
  return guarded(async () => {
    const n = await resetPractice(await requireElectionStaff());
    revalidatePath("/admin/election");
    return { message: `Cleared ${n} practice incidents.` };
  });
}

// Training ----------------------------------------------------------------------------------------

export interface TrainingState {
  wrong?: { id: string; why: string }[];
  answers?: Record<string, string>;
}

export async function submitTraining(_prev: TrainingState, formData: FormData): Promise<TrainingState> {
  const staff = await requireElectionStaff();
  const answers = Object.fromEntries([...formData.entries()].filter(([k]) => k.startsWith("q:")).map(([k, v]) => [k.slice(2), String(v)]));
  const result = gradeTraining(answers);
  if (!result.passed) return { wrong: result.wrong, answers };
  await recordTraining(staff);
  redirect("/admin/election?mode=practice&trained=1");
}

// Team --------------------------------------------------------------------------------------------

export interface InviteState extends ActionState {
  link?: string;
  expiresAt?: string;
  forWhom?: string;
}

const NewInvite = z.object({
  role: z.enum(["lga_moderator", "state_coordinator"]),
  state: z.coerce.number().int().min(1).max(37),
  lga: z.union([z.literal(""), z.coerce.number().int().min(1).max(99)]).optional(),
  note: z.string().trim().max(80, "Keep the note under 80 characters.").default(""),
});

export async function createInviteLink(_prev: InviteState, formData: FormData): Promise<InviteState> {
  return guarded(async () => {
    const actor = await requireElectionStaff(["national_admin", "state_coordinator"]);
    const parsed = NewInvite.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0]!.message };
    const { role, state, lga, note } = parsed.data;
    if (role === "lga_moderator" && !lga) return { error: "Choose the LGA they'll moderate." };
    const invite = await createInvite(actor, { role, state, lga: role === "lga_moderator" ? Number(lga) : null, note });
    revalidatePath("/admin/election/team");
    return { link: `${siteUrl()}/login/join/${invite.token}`, expiresAt: invite.expires_at, forWhom: note };
  });
}

export async function cancelInvite(formData: FormData) {
  const actor = await requireElectionStaff(["national_admin", "state_coordinator"]);
  await revokeInvite(actor, z.uuid().parse(formData.get("id")));
  revalidatePath("/admin/election/team");
}

export async function setMemberActive(formData: FormData) {
  const actor = await requireElectionStaff(["national_admin", "state_coordinator"]);
  await setStaffActive(actor, z.uuid().parse(formData.get("user")), formData.get("active") === "true");
  revalidatePath("/admin/election/team");
}
