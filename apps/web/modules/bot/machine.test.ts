import { describe, expect, it } from "vitest";
import type { BotInput } from "../whatsapp/payload";
import { initialState, step, type BotState } from "./machine";

const POLICE_URL = "https://safe.example.org";
const text = (t: string): BotInput => ({ kind: "text", text: t });

function run(inputs: BotInput[], state: BotState = initialState()) {
  let result = { state, replies: [] as string[], effects: [] as unknown[] };
  for (const input of inputs) result = step(result.state, input, POLICE_URL);
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
