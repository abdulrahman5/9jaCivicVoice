import type { PoliceRecipient } from "@civicvoice/validation";

/**
 * Where forwarding packs go (docs/POLICE.md, section 4). Moderators send each pack
 * themselves through one of these official channels, then record it in the console.
 *
 * These are the institutions' public contact points, not secrets. Check every entry
 * against an official source before adding it, and re-check quarterly.
 *
 * TODO: CRU phone numbers to be provided by the project owner. PSC contacts too.
 */

export type ContactKind = "phone" | "whatsapp" | "email" | "web";

export interface Contact {
  /** What moderators see, and what's recorded as the channel, e.g. "CRU WhatsApp (Lagos)". */
  label: string;
  kind: ContactKind;
  /** Number, address or URL, exactly as published. */
  value: string;
}

export const RECIPIENT_CONTACTS: Record<PoliceRecipient, Contact[]> = {
  cru: [],
  psc: [],
};

/** The channel string recorded with a forward: the label plus the contact it went to. */
export const channelFor = (c: Contact) => `${c.label} (${c.value})`;
