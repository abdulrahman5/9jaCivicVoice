import { describe, expect, it } from "vitest";
import { EditInput, MergeInput, RejectInput, RouteInput, friendlyDbError } from "./schemas";

const issueId = "6f9c2a10-1b2c-4d5e-8f90-123456789abc";
const agencyId = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";

describe("RouteInput", () => {
  it("requires an agency", () => {
    expect(RouteInput.safeParse({ issueId, agencyId: "" }).success).toBe(false);
    expect(RouteInput.safeParse({ issueId, agencyId }).success).toBe(true);
  });
});

describe("RejectInput", () => {
  it("builds the public note from the preset and the extra note", () => {
    const r = RejectInput.parse({ issueId, reason: "outside_pilot", note: "Kano is planned for 2027." });
    expect(r.publicNote).toBe(
      "This location is outside Lagos and FCT Abuja, which CivicVoice covers for now. Kano is planned for 2027.",
    );
  });

  it("requires a note when the reason is 'other'", () => {
    expect(RejectInput.safeParse({ issueId, reason: "other", note: "" }).success).toBe(false);
    expect(RejectInput.safeParse({ issueId, reason: "other", note: "Duplicate of a closed issue." }).success).toBe(true);
  });
});

describe("MergeInput", () => {
  it("normalises the reference", () => {
    expect(MergeInput.parse({ issueId, targetRef: " lag-1000 " }).targetRef).toBe("LAG-1000");
  });

  it("rejects malformed references", () => {
    expect(MergeInput.safeParse({ issueId, targetRef: "1000" }).success).toBe(false);
  });
});

describe("EditInput", () => {
  const base = { issueId, category: "roads", subcategory: "pothole" };

  it("accepts an edit without a location", () => {
    expect(EditInput.parse({ ...base, lat: "", lng: "" })).toMatchObject({ lat: undefined, lng: undefined });
  });

  it("accepts a location inside Nigeria from form strings", () => {
    expect(EditInput.parse({ ...base, lat: "6.61", lng: "3.34" })).toMatchObject({ lat: 6.61, lng: 3.34 });
  });

  it("rejects half a location, a location abroad, or a mismatched sub-category", () => {
    expect(EditInput.safeParse({ ...base, lat: "6.61", lng: "" }).success).toBe(false);
    expect(EditInput.safeParse({ ...base, lat: "51.5", lng: "-0.1" }).success).toBe(false);
    expect(EditInput.safeParse({ ...base, subcategory: "outage" }).success).toBe(false);
  });
});

describe("friendlyDbError", () => {
  it("passes through the moderation functions' own messages", () => {
    expect(friendlyDbError({ code: "P0001", message: "agency is in fct, issue is in lagos" })).toBe(
      "Agency is in fct, issue is in lagos.",
    );
  });

  it("hides other database errors", () => {
    expect(friendlyDbError({ code: "42501", message: "permission denied for schema core" })).not.toContain("schema");
  });
});
