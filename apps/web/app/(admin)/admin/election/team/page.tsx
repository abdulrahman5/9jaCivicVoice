import { ROLE_LABEL, invitableAreas, openInvites, requireElectionStaff, team } from "@/modules/election/staff";
import { dangerButton, secondaryButton } from "../../../ui";
import { cancelInvite, setMemberActive } from "../actions";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });
}

/**
 * The election team (task E5): invite links scoped to an LGA (or, for national admins, a
 * state), open invites, and the moderators the signed-in coordinator manages.
 */
export default async function ElectionTeamPage() {
  const staff = await requireElectionStaff();
  if (staff.electionRole === "lga_moderator") {
    return <p className="text-muted">The election team is managed by state coordinators and national admins.</p>;
  }
  const [members, invites, areas] = await Promise.all([team(staff), openInvites(staff), invitableAreas(staff)]);
  const active = members.filter((m) => m.active).length;
  const trained = members.filter((m) => m.active && m.trained).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Election team</h1>
        <p className="text-sm text-muted">
          {staff.areaName} · {active} active, {trained} trained
        </p>
      </div>

      <section className="flex max-w-xl flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <h2 className="font-semibold">Invite a moderator</h2>
        <p className="text-sm text-muted">
          Each link works once, for one person, for 7 days. Send it to them privately (WhatsApp or SMS, not a group).
        </p>
        <InviteForm canInviteCoordinators={staff.electionRole === "national_admin"} states={areas.states} lgas={areas.lgas} />
      </section>

      {invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Open invites ({invites.length})</h2>
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {i.note ? <strong>{i.note}</strong> : <span className="text-muted">No note</span>} · {ROLE_LABEL[i.role]},{" "}
                  {i.lga_name ? `${i.lga_name}, ${i.state_name}` : i.state_name}
                  <span className="text-muted"> · expires {day(i.expires_at)}</span>
                </span>
                <form action={cancelInvite}>
                  <input type="hidden" name="id" value={i.id} />
                  <button type="submit" className="text-sm font-semibold text-accent">
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Moderators ({members.length})</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="p-3">Name</th>
                <th className="p-3">Role and area</th>
                <th className="p-3">Training</th>
                <th className="p-3">Joined</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted">
                    No one yet. Invite your first moderators above.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.user_id} className={`border-b border-line last:border-0 ${m.active ? "" : "text-muted"}`}>
                    <td className="p-3 font-semibold">
                      {m.display_name}
                      {!m.active && <span className="ml-2 font-mono text-[10px] uppercase">deactivated</span>}
                    </td>
                    <td className="p-3">
                      {ROLE_LABEL[m.role]}
                      <div className="text-[11px] text-muted">{m.lga_name ? `${m.lga_name}, ${m.state_name}` : (m.state_name ?? "All")}</div>
                    </td>
                    <td className="p-3">{m.trained ? "Passed" : "Not yet"}</td>
                    <td className="p-3">{day(m.created_at)}</td>
                    <td className="p-3 text-right">
                      <form action={setMemberActive}>
                        <input type="hidden" name="user" value={m.user_id} />
                        <input type="hidden" name="active" value={String(!m.active)} />
                        <button type="submit" className={`${m.active ? dangerButton : secondaryButton} h-9 text-sm`}>
                          {m.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
