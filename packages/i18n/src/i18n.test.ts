import { describe, expect, it } from "vitest";
import { t } from "./index";

describe("t", () => {
  it("interpolates variables", () => {
    expect(t("en", "report.step", { step: 1, total: 3 })).toBe("Step 1 of 3");
  });

  it("uses the Pidgin string when one exists", () => {
    expect(t("pcm", "home.reportCta")).toBe("Report wahala");
  });

  it("falls back to English for missing keys and unreviewed locales", () => {
    expect(t("pcm", "bot.askRef")).toBe(t("en", "bot.askRef"));
    expect(t("ha", "home.reportCta")).toBe("Report an issue");
  });
});
