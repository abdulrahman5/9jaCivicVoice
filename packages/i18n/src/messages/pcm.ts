import type { en } from "./en";

// Draft Pidgin strings. Must be reviewed by a native speaker before launch
// (production readiness checklist).
export const pcm: Partial<Record<keyof typeof en, string>> = {
  "home.reportCta": "Report wahala",
  "home.reportCtaSub": "E no pass 60 seconds · you fit hide your name",
  "report.whatAbout": "Wetin the wahala be about?",
  "track.isItFixed": "Dem don fix am?",
  "track.yesFixed": "Yes, dem don fix am",
  "track.notYet": "No be yet",
  "bot.welcome":
    "Welcome to CivicVoice. Reply with number:\n1 · Report wahala\n2 · Check your report\n3 · Change language",
  "bot.askDetails": "Tell us wetin happen. Send picture, voice note, or type am.",
  "bot.received": "Thank you. Your report number na {ref}.\nWe go message you here when e move. Reply 2 anytime to check am.",
};
