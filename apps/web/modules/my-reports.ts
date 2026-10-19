/**
 * "My reports" lives only in the reporter's browser: there are no citizen
 * accounts (architecture decision D5). The tracking token proves ownership
 * when confirming a fix.
 */
export interface MyReport {
  ref: string;
  trackingToken: string;
}

const KEY = "cv:my-reports";

export function loadMyReports(): MyReport[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberReport(report: MyReport) {
  try {
    const existing = loadMyReports().filter((r) => r.ref !== report.ref);
    localStorage.setItem(KEY, JSON.stringify([report, ...existing].slice(0, 50)));
  } catch {
    // Storage unavailable: the reference number shown on screen is the fallback.
  }
}
