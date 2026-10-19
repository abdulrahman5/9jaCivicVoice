import { describe, expect, it } from "vitest";
import { PoliceSubmission, ReportSubmission, canTransition } from "./index";

const validReport = {
  city: "lagos",
  category: "electricity",
  subcategory: "outage",
  location: { lat: 6.6018, lng: 3.3515 },
  description: "No light since Sunday",
};

describe("ReportSubmission", () => {
  it("accepts a valid report and applies defaults", () => {
    const r = ReportSubmission.parse(validReport);
    expect(r.anonymous).toBe(true);
    expect(r.channel).toBe("web");
    expect(r.mediaKeys).toEqual([]);
  });

  it("rejects a subcategory from another category", () => {
    const r = ReportSubmission.safeParse({ ...validReport, subcategory: "pothole" });
    expect(r.success).toBe(false);
  });

  it("rejects coordinates outside Nigeria", () => {
    const r = ReportSubmission.safeParse({ ...validReport, location: { lat: 51.5, lng: -0.1 } });
    expect(r.success).toBe(false);
  });

  it("requires a description or media", () => {
    const r = ReportSubmission.safeParse({ ...validReport, description: "  " });
    expect(r.success).toBe(false);
  });

  it("validates Nigerian mobile numbers", () => {
    expect(ReportSubmission.safeParse({ ...validReport, phone: "+2348031234567" }).success).toBe(true);
    expect(ReportSubmission.safeParse({ ...validReport, phone: "08031234567" }).success).toBe(false);
  });
});

describe("PoliceSubmission", () => {
  const valid = {
    city: "lagos",
    incidentType: "money_demanded",
    place: "Third Mainland Bridge",
    when: "today",
    consentToForward: true,
  };

  it("accepts a minimal report", () => {
    expect(PoliceSubmission.safeParse(valid).success).toBe(true);
  });

  it("rejects any unexpected field, such as contact details", () => {
    expect(PoliceSubmission.safeParse({ ...valid, phone: "+2348031234567" }).success).toBe(false);
  });
});

describe("canTransition", () => {
  it("lets agencies acknowledge forwarded issues", () => {
    expect(canTransition("forwarded", "acknowledged", "agency")).toBe(true);
  });

  it("only lets citizens or moderators confirm a fix", () => {
    expect(canTransition("resolved", "confirmed_fixed", "citizen")).toBe(true);
    expect(canTransition("resolved", "confirmed_fixed", "agency")).toBe(false);
  });

  it("lets a citizen reopen a resolved issue", () => {
    expect(canTransition("resolved", "acknowledged", "citizen")).toBe(true);
  });

  it("treats rejected and merged as terminal", () => {
    expect(canTransition("rejected", "verified", "moderator")).toBe(false);
    expect(canTransition("merged", "verified", "moderator")).toBe(false);
  });
});
