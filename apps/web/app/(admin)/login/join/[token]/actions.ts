"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authClient } from "@/modules/auth";
import { ElectionStaffError, INVITE_TOKEN, joinWithInvite } from "@/modules/election/staff";
import { rateLimit } from "@/modules/rate-limit";

export interface JoinState {
  error?: string;
  name?: string;
  email?: string;
}

const Join = z.object({
  token: z.string().regex(INVITE_TOKEN),
  name: z.string().trim().min(2, "Enter your name.").max(60, "Keep your name under 60 characters."),
  email: z.email("Enter a valid email address."),
  password: z.string().min(12, "Use a password of at least 12 characters.").max(128),
  confirm: z.string(),
});

/** A volunteer joins with their invite link, then goes on to set up two-factor. */
export async function join(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const raw = Object.fromEntries(formData);
  const echo = { name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`election-join:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 })).allowed) {
    return { ...echo, error: "Too many attempts. Wait an hour and try again." };
  }

  const parsed = Join.safeParse(raw);
  if (!parsed.success) return { ...echo, error: parsed.error.issues[0]!.message };
  if (parsed.data.password !== parsed.data.confirm) return { ...echo, error: "The two passwords don't match." };

  try {
    await joinWithInvite({
      token: parsed.data.token,
      displayName: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
  } catch (e) {
    if (e instanceof ElectionStaffError) return { ...echo, error: e.message };
    throw e;
  }

  const { error } = await (await authClient()).auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) redirect("/login");
  redirect("/login/enroll");
}
