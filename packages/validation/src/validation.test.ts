import { describe, expect, it } from "vitest";
import {
  PoliceSubmission,
  ReportSubmission,
  ReporterMessage,
  StatusCode,
  canTransition,
  policeCanTransition,
} from "./index";

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

  it("treats a report without a kind as misconduct", () => {
    expect(PoliceSubmission.parse(valid).kind).toBe("misconduct");
  });

  it("accepts a commendation with a commendation type and a time of day", () => {
    const r = { ...valid, kind: "commendation", incidentType: "refused_bribe", timeOfDay: "evening" };
    expect(PoliceSubmission.safeParse(r).success).toBe(true);
  });

  it("rejects a type that doesn't match the kind", () => {
    expect(PoliceSubmission.safeParse({ ...valid, kind: "commendation" }).success).toBe(false);
    expect(PoliceSubmission.safeParse({ ...valid, incidentType: "helped_me" }).success).toBe(false);
  });
});

describe("StatusCode", () => {
  it("normalises case and separators", () => {
    expect(StatusCode.parse("  Bird COAL dawn-fish  lamp-rope ")).toBe("bird-coal-dawn-fish-lamp-rope");
  });

  it("needs exactly six words of letters", () => {
    expect(StatusCode.safeParse("bird-coal-dawn-fish").success).toBe(false);
    expect(StatusCode.safeParse("bird-coal-dawn-fish-lamp-rope-tree").success).toBe(false);
    expect(StatusCode.safeParse("bird-coal-dawn-fish-lamp-r0pe").success).toBe(false);
  });
});

describe("ReporterMessage", () => {
  const code = "bird-coal-dawn-fish-lamp-rope";

  it("trims the message and accepts up to 1,000 characters", () => {
    expect(ReporterMessage.parse({ code, body: "  hello  " }).body).toBe("hello");
    expect(ReporterMessage.safeParse({ code, body: "x".repeat(1001) }).success).toBe(false);
  });

  it("rejects empty messages and extra fields", () => {
    expect(ReporterMessage.safeParse({ code, body: "   " }).success).toBe(false);
    expect(ReporterMessage.safeParse({ code, body: "hi", phone: "+2348031234567" }).success).toBe(false);
  });
});

describe("policeCanTransition", () => {
  it("matches police.set_status(): forwarded is never set directly", () => {
    expect(policeCanTransition("new", "consistent")).toBe(true);
    expect(policeCanTransition("new", "forwarded")).toBe(false);
    expect(policeCanTransition("consistent", "forwarded")).toBe(false);
    expect(policeCanTransition("forwarded", "closed")).toBe(true);
    expect(policeCanTransition("rejected", "new")).toBe(false);
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
