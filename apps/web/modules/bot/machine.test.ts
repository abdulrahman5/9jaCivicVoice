import { describe, expect, it } from "vitest";
import type { BotInput } from "../whatsapp/payload";
import { initialState, step, type BotContext, type BotState, type MachineInput } from "./machine";

const POLICE_URL = "https://safe.example.org";
const text = (t: string): BotInput => ({ kind: "text", text: t });
const NO_ELECTION: BotContext = {
  policeFormUrl: POLICE_URL,
  election: null,
  nextElectionNote: " It opens on Saturday 16 January at 6:00 am.",
  electionWebUrl: "https://civicvoice.example/elections/report",
};
const ELECTION_DAY: BotContext = {
  ...NO_ELECTION,
  election: {
    id: "2027-presidential-nass",
    name: "Presidential and National Assembly elections",
    categories: [
      { id: "late_opening", label: "Polling unit opened late, or not at all" },
      { id: "vote_buying", label: "Vote buying" },
      { id: "other", label: "Other" },
    ],
  },
};

function run(inputs: MachineInput[], state: BotState = initialState(), ctx: BotContext = NO_ELECTION) {
  let result = { state, replies: [] as string[], effects: [] as unknown[] };
  for (const input of inputs) result = step(result.state, input, ctx);
  return result;
}

describe("bot state machine", () => {
  it("greets a new user with the menu", () => {
    const r = run([text("Hi")]);
    expect(r.state.step).toBe("menu");
    expect(r.replies[0]).toContain("Report an issue");
  });

  it("walks a full report with a shared location and a voice note", () => {
    const r = run([
      text("Hi"),
      text("1"),
      text("2"), // electricity
      { kind: "location", lat: 6.6, lng: 3.35 },
      { kind: "media", mediaType: "audio", mediaId: "media-1" },
    ]);
    expect(r.state.step).toBe("menu");
    expect(r.effects).toEqual([
      {
        type: "create_report",
        city: "lagos",
        category: "electricity",
        location: { lat: 6.6, lng: 3.35 },
        media: { mediaType: "audio", mediaId: "media-1" },
      },
    ]);
  });

  it("accepts a typed area instead of a location pin, then asks the city", () => {
    const r = run([text("Hi"), text("1"), text("1"), text("Kubwa main road"), text("2"), text("Huge pothole")]);
    expect(r.effects[0]).toMatchObject({
      city: "fct",
      category: "roads",
      location: { text: "Kubwa main road" },
      description: "Huge pothole",
    });
  });

  it("turns away locations outside the pilot cities", () => {
    const r = run([text("Hi"), text("1"), text("2"), { kind: "location", lat: 12.0, lng: 8.5 }]); // Kano
    expect(r.state.step).toBe("await_location");
    expect(r.replies[0]).toContain("only covers Lagos and FCT Abuja");
  });

  it("never takes police reports on WhatsApp", () => {
    const r = run([text("Hi"), text("1"), text("6")]);
    expect(r.state.step).toBe("menu");
    expect(r.effects).toEqual([]);
    expect(r.replies[0]).toContain(POLICE_URL);
  });

  it("re-prompts on invalid input without losing state", () => {
    const r = run([text("Hi"), text("1"), text("9")]);
    expect(r.state.step).toBe("await_category");
    expect(r.replies[0]).toContain("didn't get that");
  });

  it("looks up a report by reference number", () => {
    const r = run([text("Hi"), text("2"), text("lag-0820")]);
    expect(r.effects).toEqual([{ type: "lookup_status", ref: "LAG-0820" }]);
  });

  it("switches language", () => {
    const r = run([text("Hi"), text("3"), text("2")]);
    expect(r.state.locale).toBe("pcm");
    expect(r.replies[1]).toContain("Report wahala");
  });

  it("returns to the menu from anywhere", () => {
    const r = run([text("Hi"), text("1"), text("2"), text("menu")]);
    expect(r.state.step).toBe("menu");
  });
});

describe("election reporting on WhatsApp", () => {
  const unit = { code: "24/01/01/001", name: "ST. JOSEPH SECONDARY SCHOOL, MANGORO", active: true, lga: "AGEGE", state: "Lagos" };
  const found = (u = unit): MachineInput => ({ kind: "unit_result", code: u.code, unit: u });

  it("offers election reporting only while an election is open", () => {
    expect(run([text("Hi")], initialState(), ELECTION_DAY).replies[0]).toContain("4 · Report from your polling unit");
    expect(run([text("Hi")]).replies[0]).not.toContain("polling unit");
    const closed = run([text("Hi"), text("4")]);
    expect(closed.state.step).toBe("menu");
    expect(closed.replies[0]).toContain("isn't open right now. It opens on Saturday 16 January");
  });

  it("asks for the code, has the worker look it up, and confirms the unit", () => {
    const asked = run([text("Hi"), text("4")], initialState(), ELECTION_DAY);
    expect(asked.state.step).toBe("e_await_unit");
    expect(asked.replies[0]).toContain("voter's card");
    expect(asked.replies[0]).toContain("/elections/report");

    const typed = run([text("24 1 1 1")], asked.state, ELECTION_DAY);
    expect(typed.effects).toEqual([{ type: "lookup_unit", code: "24 1 1 1" }]);
    expect(typed.replies).toEqual([]);

    const confirmed = run([found()], typed.state, ELECTION_DAY);
    expect(confirmed.state.step).toBe("e_confirm_unit");
    expect(confirmed.replies[0]).toContain("ST. JOSEPH SECONDARY SCHOOL, MANGORO");
    expect(confirmed.replies[0]).toContain("AGEGE, Lagos");
  });

  it("explains unknown and inactive units, and keeps asking", () => {
    const asked = run([text("Hi"), text("4")], initialState(), ELECTION_DAY);
    const missing = run([{ kind: "unit_result", code: "24/01/01/999", unit: null }], asked.state, ELECTION_DAY);
    expect(missing.state.step).toBe("e_await_unit");
    expect(missing.replies[0]).toContain("couldn't find polling unit 24/01/01/999");
    const moved = run([found({ ...unit, active: false })], asked.state, ELECTION_DAY);
    expect(moved.replies[0]).toContain("INEC no longer lists");
    expect(run([text("my school")], asked.state, ELECTION_DAY).replies[0]).toContain("polling unit code");
  });

  it("takes a category and a description, and asks the worker to save the report", () => {
    const r = run([text("Hi"), text("4"), text("24/01/01/001"), found(), text("1"), text("2"), text("Cash being shared near the queue")], initialState(), ELECTION_DAY);
    expect(r.state.step).toBe("menu");
    expect(r.effects).toEqual([
      {
        type: "create_election_report",
        electionId: "2027-presidential-nass",
        puCode: "24/01/01/001",
        category: "vote_buying",
        description: "Cash being shared near the queue",
      },
    ]);
  });

  it("lists the categories by number and accepts SKIP, except for Other", () => {
    const atCategory = run([text("Hi"), text("4"), text("24/01/01/001"), found(), text("1")], initialState(), ELECTION_DAY);
    expect(atCategory.replies[0]).toContain("1 · Polling unit opened late, or not at all\n2 · Vote buying\n3 · Other");
    expect(run([text("9")], atCategory.state, ELECTION_DAY).state.step).toBe("e_await_category");

    const skipped = run([text("1"), text("skip")], atCategory.state, ELECTION_DAY);
    expect(skipped.effects).toMatchObject([{ category: "late_opening", description: "" }]);
    const other = run([text("3"), text("SKIP")], atCategory.state, ELECTION_DAY);
    expect(other.effects).toEqual([]);
    expect(other.replies[0]).toContain("describe what happened");
  });

  it("sends people with photos to the web form, where faces can be blurred", () => {
    const atDetails = run([text("Hi"), text("4"), text("24/01/01/001"), found(), text("1"), text("1")], initialState(), ELECTION_DAY);
    const photo = run([{ kind: "media", mediaType: "image", mediaId: "m1" }], atDetails.state, ELECTION_DAY);
    expect(photo.state.step).toBe("e_await_details");
    expect(photo.effects).toEqual([]);
    expect(photo.replies[0]).toContain("photos aren't taken on WhatsApp");
  });

  it("ends an election conversation politely if reporting closes midway", () => {
    const atCategory = run([text("Hi"), text("4"), text("24/01/01/001"), found(), text("1")], initialState(), ELECTION_DAY);
    const r = run([text("1")], atCategory.state, NO_ELECTION);
    expect(r.state.step).toBe("menu");
    expect(r.replies[0]).toContain("isn't open right now");
  });

  it("tracks election references too", () => {
    const r = run([text("Hi"), text("2"), text("ev-7kq2m9x")], initialState(), ELECTION_DAY);
    expect(r.effects).toEqual([{ type: "lookup_status", ref: "EV-7KQ2M9X" }]);
  });
});
