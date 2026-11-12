export const en = {
  "app.name": "CivicVoice",
  "home.reportCta": "Report an issue",
  "home.reportCtaSub": "About 60 seconds · you can stay anonymous",
  "home.nearYou": "Issues near you",
  "report.step": "Step {step} of {total}",
  "report.whatAbout": "What's the issue about?",
  "report.anonymous": "Report anonymously",
  "report.anonymousHelp": "Your name and phone are never shown publicly. Photo location data is removed.",
  "report.submit": "Review & submit",
  "track.isItFixed": "Is it fixed?",
  "track.yesFixed": "Yes, it's fixed",
  "track.notYet": "Not yet",
  "bot.welcome":
    "Welcome to CivicVoice. Reply with a number:\n1 · Report an issue\n2 · Track a report\n3 · Change language",
  "bot.askCategory": "What is it about?\n1 · Roads\n2 · Electricity\n3 · Water\n4 · Health\n5 · Public service\n6 · Police conduct",
  "bot.askLocation": "Share your location (Attach › Location), or type your street and area.",
  "bot.askCity": "Which city is this in?\n1 · Lagos\n2 · FCT Abuja",
  "bot.outsidePilot":
    "Sorry, CivicVoice only covers Lagos and FCT Abuja for now. Share a location there, or reply menu.",
  "bot.askDetails": "Tell us what happened. Send a photo, a voice note, or type it.",
  "bot.received": "Thank you. Your report number is {ref}.\nWe'll message you here when it moves. Reply 2 at any time to check status.",
  "bot.askRef": "Send your report number, for example LAG-0820.",
  "bot.policeRedirect":
    "For your safety, police reports are not taken on WhatsApp. Use our protected form, which keeps no phone number: {url}",
  "bot.didNotUnderstand": "Sorry, I didn't get that. Reply with one of the numbers shown.",
  "bot.chooseLanguage": "Choose a language:\n1 · English\n2 · Pidgin",
  "bot.languageSet": "Language updated.",
  "bot.status": "{ref}: {status}.{note}",
  "bot.notFound": "We couldn't find report {ref}. Check the number and try again.",
  "bot.askRefAny": "Send your report number, for example LAG-0820, or EV-7KQ2M9X for an election report.",
  "bot.welcomeElectionLine": "4 · Report from your polling unit ({election})",
  "bot.electionClosed": "Election reporting isn't open right now.{when} Reply menu for other options.",
  "bot.electionAskUnit":
    "What is your polling unit code? It's on your voter's card (PVC), for example 24/01/01/001.\nDon't know it? Find it at {url}",
  "bot.electionUnitNotFound": "We couldn't find polling unit {code}. Check the code on your voter's card and send it again, or find it at {url}",
  "bot.electionUnitInactive":
    "INEC no longer lists polling unit {code}. Check your voter's card and INEC's notices for where to vote, then send the code again.",
  "bot.electionConfirmUnit": "Polling unit {code}:\n{name}\n{lga}, {state}\n\n1 · That's right\n2 · Enter another code",
  "bot.electionAskCategory": "What happened? Reply with a number:\n{options}",
  "bot.electionAskDetails":
    "Add a short description of what happened, or reply SKIP.\nDon't name private people. To add photos, use the web form instead: {url}",
  "bot.electionNeedsDetails": "Please describe what happened in a few words.",
  "bot.electionPhotoOnWeb":
    "For your safety, photos aren't taken on WhatsApp: they can't be blurred here. Use the web form for photos: {url}\nOr reply with a description, or SKIP.",
  "bot.electionReceived":
    "Thank you. Your election report number is {ref}.{corroborated}\nReply 4 to report something else, or 2 to check a report.",
  "bot.electionCorroborated": "\nOthers at this polling unit reported the same thing.",
  "bot.electionStatus": "{ref}: {category} at {unit}.\n{label}",
} as const;
