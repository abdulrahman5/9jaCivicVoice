import type { ForwardOutcome, PoliceIncidentType, PoliceRecipient } from "@civicvoice/validation";

/** Display labels for the police console. Same wording as the intake form where they overlap. */

export const POLICE_TYPE_LABELS: Record<PoliceIncidentType, string> = {
  money_demanded: "Money demanded at checkpoint",
  phone_searched_harassment: "Phone searched / harassment",
  unlawful_arrest_detention: "Unlawful arrest / detention",
  violence: "Violence",
  refused_bribe: "Refused a bribe",
  helped_me: "Helped me",
  respected_rights: "Respected my rights",
  professional_conduct: "Professional and courteous",
};

export const RECIPIENT_LABELS: Record<PoliceRecipient, string> = {
  cru: "Police Complaint Response Unit",
  psc: "Police Service Commission",
};

export const OUTCOME_LABELS: Record<ForwardOutcome, string> = {
  awaiting: "Awaiting response",
  acknowledged: "Acknowledged",
  action_reported: "Action reported",
  no_response: "No response (30 days)",
};

export const WHEN_LABELS = { just_now: "Just now", today: "Today", earlier: "Earlier" } as const;

export const CITY_LABELS = { lagos: "Lagos", fct: "FCT Abuja" } as const;
