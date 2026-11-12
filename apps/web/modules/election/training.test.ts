import { describe, expect, it } from "vitest";
import { TRAINING, gradeTraining, trainingQuestions } from "./training";

const allRight = () => Object.fromEntries(TRAINING.map((q) => [q.id, String(q.answer)]));

describe("training check", () => {
  it("never sends the answers to the browser", () => {
    for (const q of trainingQuestions()) expect(q).not.toHaveProperty("answer");
    expect(JSON.stringify(trainingQuestions())).not.toContain("why");
  });

  it("passes only when every answer is right", () => {
    expect(gradeTraining(allRight())).toEqual({ passed: true, wrong: [] });
    const one = { ...allRight(), ballot: "0" };
    expect(gradeTraining(one)).toMatchObject({ passed: false, wrong: [{ id: "ballot" }] });
  });

  it("treats missing or odd answers as wrong", () => {
    expect(gradeTraining({}).wrong).toHaveLength(TRAINING.length);
    const odd = { ...allRight(), ward: "0.0", verified: "", neutral: " 1" };
    expect(gradeTraining(odd).wrong.map((w) => w.id).sort()).toEqual(["neutral", "verified", "ward"]);
  });

  it("does not always put the right answer in the same place", () => {
    expect(new Set(TRAINING.map((q) => q.answer)).size).toBeGreaterThan(1);
    for (const q of TRAINING) expect(q.answer).toBeLessThan(q.options.length);
  });
});
