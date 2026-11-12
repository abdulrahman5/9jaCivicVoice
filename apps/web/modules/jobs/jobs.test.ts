import { describe, expect, it, vi } from "vitest";
import type { BotState } from "../bot/machine";
import type { InboundMessage } from "../whatsapp/payload";
import { MAX_ATTEMPTS, runQueue, type Job, type QueueStore } from "./runner";
import { ReporterFacingError, handleWaInbound, type Session, type WaDeps } from "./wa-inbound";

function fakeStore(jobs: Job[]) {
  const store = {
    read: vi.fn(async () => jobs),
    ack: vi.fn(async () => {}),
    deadLetter: vi.fn(async () => {}),
  } satisfies QueueStore;
  return store;
}

describe("runQueue", () => {
  it("acks successes and leaves failures for retry", async () => {
    const store = fakeStore([
      { msg_id: 1, read_ct: 1, message: { ok: true } },
      { msg_id: 2, read_ct: 1, message: { ok: false } },
    ]);
    const result = await runQueue(store, "wa_inbound", async (m) => {
      if (!m.ok) throw new Error("boom");
    });
    expect(result).toMatchObject({ processed: 1, failed: 1, deadLettered: 0 });
    expect(store.ack).toHaveBeenCalledWith("wa_inbound", 1);
    expect(store.ack).not.toHaveBeenCalledWith("wa_inbound", 2);
  });

  it("dead-letters a message after the last attempt", async () => {
    const store = fakeStore([{ msg_id: 3, read_ct: MAX_ATTEMPTS, message: {} }]);
    const result = await runQueue(store, "wa_inbound", async () => {
      throw new Error("still broken");
    });
    expect(result.deadLettered).toBe(1);
    expect(store.deadLetter).toHaveBeenCalledWith("wa_inbound", 3, "still broken");
  });
});

describe("handleWaInbound", () => {
  function deps(session: BotState | null = null) {
    const sessions = new Map<string, Session>();
    if (session) sessions.set("hash", { state: session, outbox: [] });
    const d = {
      hashContact: vi.fn(() => "hash"),
      loadSession: vi.fn(async (h: string) => sessions.get(h) ?? null),
      saveSession: vi.fn(async (h: string, s: Session) => void sessions.set(h, s)),
      createReport: vi.fn(async () => ({ reportId: "r1", ref: "LAG-1001" })),
      enqueueMediaFetch: vi.fn(async () => {}),
      lookupStatus: vi.fn(async () => ({ status: "acknowledged", note: "Crew on Monday" })),
      send: vi.fn(async () => {}),
      policeFormUrl: "https://safe.example",
      electionContext: vi.fn(async () => ({
        election: { id: "2027-presidential-nass", name: "Presidential and National Assembly elections", categories: [{ id: "vote_buying", label: "Vote buying" }] },
        nextElectionNote: "",
        electionWebUrl: "https://civicvoice.example/elections/report",
      })),
      // Normalises like election.normalize_pu_code: each group of digits, zero-padded.
      findUnit: vi.fn(async (code: string) =>
        (code.match(/\d+/g) ?? []).map((g, i) => g.padStart(i === 3 ? 3 : 2, "0")).join("/") === "24/01/01/001"
          ? { code: "24/01/01/001", name: "ST. JOSEPH SECONDARY SCHOOL", active: true, lga: "AGEGE", state: "Lagos" }
          : null,
      ),
      createElectionReport: vi.fn(async (): Promise<{ ref: string; label: string }> => ({ ref: "EV-7KQ2M9X", label: "reported" })),
      electionStatus: vi.fn(async () => ({ category: "Vote buying", unit: "ST. JOSEPH SECONDARY SCHOOL (24/01/01/001)", label: "corroborated" })),
    } satisfies WaDeps;
    return { d, sessions };
  }

  const msg = (partial: Partial<InboundMessage>): InboundMessage =>
    ({ id: "wamid.x", from: "2348031234567", timestamp: "1", type: "text", ...partial }) as InboundMessage;

  it("greets, persists state, and replies to the sender", async () => {
    const { d, sessions } = deps();
    await handleWaInbound(msg({ text: { body: "Hi" } }), d);
    expect(sessions.get("hash")?.state.step).toBe("menu");
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("Report an issue"));
  });

  it("creates a report with the phone (for updates) and queues the voice note", async () => {
    const { d } = deps({ step: "await_details", locale: "en", category: "water", city: "lagos", location: { lat: 6.6, lng: 3.35 } });
    await handleWaInbound(msg({ type: "audio", audio: { id: "media-9" } }), d);
    expect(d.createReport).toHaveBeenCalledWith(
      expect.objectContaining({ city: "lagos", category: "water", phone: "+2348031234567" }),
    );
    expect(d.enqueueMediaFetch).toHaveBeenCalledWith("r1", "media-9", "audio");
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("LAG-1001"));
  });

  it("resends the same replies when a job is retried after a failed send", async () => {
    const { d } = deps({ step: "await_details", locale: "en", category: "water", city: "lagos", location: { lat: 6.6, lng: 3.35 } });
    d.send.mockRejectedValueOnce(new Error("WhatsApp down"));
    const m = msg({ text: { body: "Borehole broken" } });
    await expect(handleWaInbound(m, d)).rejects.toThrow("WhatsApp down");
    await handleWaInbound(m, d); // the retry
    expect(d.createReport).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenLastCalledWith("2348031234567", expect.stringContaining("LAG-1001"));
  });

  it("answers a status lookup with the agency's note", async () => {
    const { d } = deps({ step: "await_ref", locale: "en" });
    await handleWaInbound(msg({ text: { body: "LAG-1000" } }), d);
    expect(d.lookupStatus).toHaveBeenCalledWith("LAG-1000", "hash");
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("Crew on Monday"));
  });

  it("looks up a polling unit within the same message and confirms it", async () => {
    const { d, sessions } = deps({ step: "e_await_unit", locale: "en", electionId: "2027-presidential-nass" });
    await handleWaInbound(msg({ text: { body: "24 1 1 1" } }), d);
    expect(d.findUnit).toHaveBeenCalledWith("24 1 1 1");
    expect(sessions.get("hash")!.state.step).toBe("e_confirm_unit");
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("ST. JOSEPH SECONDARY SCHOOL"));
  });

  it("saves an election report with the sender's hash and replies with the reference", async () => {
    const unit = { code: "24/01/01/001", name: "ST. JOSEPH SECONDARY SCHOOL", active: true, lga: "AGEGE", state: "Lagos" };
    const { d } = deps({
      step: "e_await_details",
      locale: "en",
      electionId: "2027-presidential-nass",
      unit,
      category: { id: "vote_buying", label: "Vote buying" },
    });
    await handleWaInbound(msg({ text: { body: "Cash near the queue" } }), d);
    expect(d.createElectionReport).toHaveBeenCalledWith({
      electionId: "2027-presidential-nass",
      puCode: "24/01/01/001",
      category: "vote_buying",
      description: "Cash near the queue",
      phone: "+2348031234567",
      contactHash: "hash",
    });
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("EV-7KQ2M9X"));
  });

  it("passes on a refusal the reporter can act on, instead of failing the job", async () => {
    const unit = { code: "24/01/01/001", name: "X", active: true, lga: "AGEGE", state: "Lagos" };
    const { d } = deps({ step: "e_await_details", locale: "en", electionId: "e", unit, category: { id: "vote_buying", label: "Vote buying" } });
    d.createElectionReport.mockRejectedValueOnce(new ReporterFacingError("You've already reported this at this polling unit. Thank you."));
    await handleWaInbound(msg({ text: { body: "skip" } }), d);
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("already reported"));
  });

  it("checks an election report by its reference", async () => {
    const { d } = deps({ step: "await_ref", locale: "en" });
    await handleWaInbound(msg({ text: { body: "EV-7KQ2M9X" } }), d);
    expect(d.electionStatus).toHaveBeenCalledWith("EV-7KQ2M9X");
    expect(d.lookupStatus).not.toHaveBeenCalled();
    expect(d.send).toHaveBeenCalledWith("2348031234567", expect.stringContaining("Others at this polling unit reported the same thing"));
  });
});
