import type { ParticipantRole } from "@/lib/domain/types";

/** Every role a participant can carry, in the order the add form lists them. */
export const PARTICIPANT_ROLES: ParticipantRole[] = [
  "usual gp",
  "community nurse",
  "community matron",
  "specialist nurse",
  "specialist consultant",
  "palliative care",
  "pharmacist",
  "social care",
  "care home",
  "out of hours",
  "ambulance service",
  "next of kin",
  "carer",
];

/** A best guess at a ParticipantRole from a free-text role in the record review. The clinician can change it. */
export function guessRole(text: string): ParticipantRole {
  const t = text.toLowerCase();
  if (/\bgp\b|general practitioner/.test(t)) return "usual gp";
  if (/matron/.test(t)) return "community matron";
  if (/nurse/.test(t)) return /community|district/.test(t) ? "community nurse" : "specialist nurse";
  if (/consultant|oncolog|cardiolog|renal|nephrolog|neurolog|respiratory|geriatric/.test(t)) return "specialist consultant";
  if (/palliative|hospice/.test(t)) return "palliative care";
  if (/pharmac/.test(t)) return "pharmacist";
  if (/social/.test(t)) return "social care";
  if (/care home|nursing home|residential home/.test(t)) return "care home";
  if (/out of hours|out-of-hours/.test(t)) return "out of hours";
  if (/ambulance|paramedic/.test(t)) return "ambulance service";
  if (/next of kin|daughter|\bson\b|family|spouse|wife|husband|partner/.test(t)) return "next of kin";
  if (/carer/.test(t)) return "carer";
  return "specialist nurse";
}
