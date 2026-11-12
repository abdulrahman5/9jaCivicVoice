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
  "bot.welcomeElectionLine": "4 · Report wetin dey happen for your polling unit ({election})",
  "bot.electionAskUnit":
    "Wetin be your polling unit code? E dey your voter card (PVC), like 24/01/01/001.\nYou no know am? Find am for {url}",
  "bot.electionAskCategory": "Wetin happen? Reply with number:\n{options}",
};
