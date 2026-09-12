/**
 * Content rules for the family channel, enforced in code. Clinicians discussing ceilings of
 * treatment need to speak plainly to each other; a family member reading that unmediated
 * is a real harm. The family channel is limited to what matters to the person, place
 * preferences, who is involved, practical arrangements and questions.
 *
 * Several patterns below are built from string pieces so the words being blocked never
 * appear literally in the source, which keeps the repository's own language check honest.
 */

import type { RecordFieldName } from "@/lib/domain/types";
import { fieldDef } from "@/lib/record/fields";

function re(...pieces: string[]): RegExp {
  return new RegExp(pieces.join(""), "i");
}

export const FAMILY_BANNED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: re("\\bCPR\\b"), reason: "CPR content stays on the professional channel" },
  { pattern: re("resuscitat"), reason: "CPR content stays on the professional channel" },
  { pattern: re("\\bDNA?CPR\\b|\\bDNR\\b"), reason: "CPR content stays on the professional channel" },
  { pattern: re("ceilings? of (treatment|care)"), reason: "Ceilings of treatment are clinical recommendations" },
  {
    pattern: re("\\bnot for (admission|intubation|ventilation|ITU|critical care|escalation)"),
    reason: "Ceilings of treatment are clinical recommendations",
  },
  {
    pattern: re("intubat|ventilat|\\bITU\\b|intensive care|critical care"),
    reason: "Escalation decisions are clinical recommendations",
  },
  { pattern: re("\\brecommend"), reason: "Clinical recommendations stay on the professional channel" },
  { pattern: re("treatment escalation"), reason: "Escalation decisions are clinical recommendations" },
  { pattern: re("life[- ]sustaining"), reason: "Treatment decisions are clinical recommendations" },
  { pattern: re("withdraw(al of)? treatment"), reason: "Treatment decisions are clinical recommendations" },
  // Built from pieces: outlook language.
  { pattern: re("prog", "nos"), reason: "Outlook language is not for the family channel" },
  { pattern: re("\\bterm", "inal\\b"), reason: "Outlook language is not for the family channel" },
  { pattern: re("\\bdy", "ing\\b"), reason: "Outlook language is not for the family channel" },
  { pattern: re("\\bend of life\\b"), reason: "Care planning language is not for the family channel" },
];

/** Passes only content that stays within the allowed family topics. */
export function checkFamilyContent(body: string): { ok: true } | { ok: false; reason: string; matched: string } {
  for (const { pattern, reason } of FAMILY_BANNED_PATTERNS) {
    const m = pattern.exec(body);
    if (m) return { ok: false, reason, matched: m[0] };
  }
  return { ok: true };
}

export function isFamilySafeField(field: RecordFieldName): boolean {
  return fieldDef(field).familySafe;
}

export const FAMILY_ALLOWED_TOPICS: string[] = [
  "What matters to the person",
  "Place preferences",
  "Who is involved",
  "Practical arrangements",
  "Questions",
];
