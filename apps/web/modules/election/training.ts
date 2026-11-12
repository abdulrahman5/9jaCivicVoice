/**
 * The training check every election moderator passes before seeing real reports (task E5).
 * Grading happens on the server: the page gets the questions without the answers.
 */

export interface TrainingQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into options. Never sent to the browser. */
  answer: number;
  /** Shown after a wrong answer, so the check teaches as well as tests. */
  why: string;
}

export const TRAINING: TrainingQuestion[] = [
  {
    id: "ballot",
    question: "A report includes a photo of a marked ballot paper. What do you do?",
    options: [
      "Verify the report: the photo is good evidence",
      "Remove the photo and judge the report on its text",
      "Forward the photo to a party agent to check",
    ],
    answer: 1,
    why: "We never keep or publish photos of ballots: they can reveal how someone voted and break INEC's rules.",
  },
  {
    id: "ward",
    question: "Which incidents are shown publicly only at ward level, never at the polling unit?",
    options: ["Violence and intimidation", "Vote buying", "BVAS failures"],
    answer: 0,
    why: "Pinpointing violence or intimidation to a polling unit can put the reporter and voters at risk.",
  },
  {
    id: "corroborated",
    question: "What makes an incident “corroborated”?",
    options: [
      "A moderator checked it",
      "The reporter sent a photo",
      "Three or more different people reported the same thing at the same polling unit within two hours",
    ],
    answer: 2,
    why: "Corroboration is automatic and only counts independent senders. It is not the same as verified.",
  },
  {
    id: "verified",
    question: "When can you mark an incident verified?",
    options: [
      "When you have checked it yourself: a clear photo, consistent details, or a follow-up answer",
      "When enough people have reported it",
      "When it is in your LGA",
    ],
    answer: 0,
    why: "Verified means a moderator checked it. Many reports alone make it corroborated, not verified.",
  },
  {
    id: "neutral",
    question: "A reporter asks you which party is winning at their polling unit. You reply:",
    options: [
      "With the figures from reports so far",
      "That CivicVoice reports incidents and how the day went, never who is winning",
      "With your own view",
    ],
    answer: 1,
    why: "We stay neutral: no vote counts, no predictions, no opinions about parties or candidates.",
  },
  {
    id: "critical",
    question: "A report says people are being attacked at a polling unit right now. What do you do first?",
    options: [
      "Wait for more reports before acting",
      "Reject it until a photo arrives",
      "Escalate to your state coordinator straight away, and tell the reporter to call 112 if they are in danger",
    ],
    answer: 2,
    why: "Critical incidents go to the state coordinator at once. People's safety comes before verification.",
  },
  {
    id: "contact",
    question: "A journalist asks for a reporter's phone number to interview them. You:",
    options: ["Share it: it helps the story", "Never share it", "Share it if the reporter's incident is verified"],
    answer: 1,
    why: "Reporters' contact details are never shared, with anyone. Moderators only use them for follow-up questions.",
  },
];

/** The questions as the browser sees them. */
export function trainingQuestions() {
  return TRAINING.map(({ id, question, options }) => ({ id, question, options }));
}

/** Every question must be right to pass. Returns the ids answered wrongly, with the reason. */
export function gradeTraining(answers: Record<string, unknown>) {
  const wrong = TRAINING.filter((q) => {
    const given = answers[q.id];
    return typeof given !== "string" || !/^\d$/.test(given) || Number(given) !== q.answer;
  }).map((q) => ({ id: q.id, why: q.why }));
  return { passed: wrong.length === 0, wrong };
}
