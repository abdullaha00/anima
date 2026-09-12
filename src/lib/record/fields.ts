/**
 * The fields of the record, in display order, with the labels and the rules a clinician sees.
 * Ported from reference/cairn/record.py and reshaped to the ReSPECT sections. The order here
 * is the order on the record form; the "other" group stays in the model and off the form.
 */

import type { RecordFieldName } from "@/lib/domain/types";

export type RecordFieldGroup = "what matters" | "clinical context" | "emergency care" | "other";

export interface RecordFieldDef {
  name: RecordFieldName;
  label: string;
  /** A short plain sentence under the label, where one helps. */
  description?: string;
  required: boolean;
  group: RecordFieldGroup;
  /** True when the field may appear on the family view. */
  familySafe: boolean;
}

/** The groups shown on the form, in order. "other" is kept in the model and not shown. */
export const FORM_GROUPS: RecordFieldGroup[] = ["what matters", "clinical context", "emergency care"];

export const CAPACITY_OPTIONS = [
  "Had capacity for this decision",
  "Lacked capacity for this decision",
  "Best interests decision",
] as const;

export const CPR_OPTIONS = ["Attempt CPR", "Do not attempt CPR", "No recorded decision"] as const;

export const ESCALATION_OPTIONS = ["Full escalation", "Trial of treatment", "Comfort-focused", "Community-only"] as const;

export const RECORD_FIELDS: RecordFieldDef[] = [
  // What matters. The person's words come first, deliberately.
  {
    name: "capacity_assessment",
    label: "Capacity for this decision",
    description: "Whether the person had capacity for this decision when it was made.",
    required: true,
    group: "what matters",
    familySafe: false,
  },
  {
    name: "what_matters",
    label: "Patient's expressed wishes",
    description: "In their own words, from the conversation.",
    required: true,
    group: "what matters",
    familySafe: true,
  },
  {
    name: "concerns_and_fears",
    label: "Patient's expressed fears and concerns",
    description: "What they are worried about, in their words.",
    required: false,
    group: "what matters",
    familySafe: true,
  },
  {
    name: "preferences_for_care",
    label: "What is most important to the patient about how they are treated",
    description: "Where their priority sits between comfort and life-sustaining treatment.",
    required: true,
    group: "what matters",
    familySafe: false,
  },

  // Clinical context.
  {
    name: "clinical_summary",
    label: "Diagnosis summary",
    description: "The relevant conditions and recent events, as recorded.",
    required: true,
    group: "clinical context",
    familySafe: false,
  },
  {
    name: "clinical_trajectory",
    label: "Likely clinical trajectory",
    description: "How things have been changing for this person, from the record.",
    required: false,
    group: "clinical context",
    familySafe: false,
  },
  {
    name: "active_medications",
    label: "Relevant active medications",
    description: "Medicines that matter in an emergency, as the record lists them.",
    required: false,
    group: "clinical context",
    familySafe: false,
  },

  // Emergency care, ReSPECT-shaped.
  {
    name: "cpr_recommendation",
    label: "CPR recommendation",
    description: "A clinical recommendation agreed with the person; not legally binding and not a DNACPR form.",
    required: true,
    group: "emergency care",
    familySafe: false,
  },
  {
    name: "cpr_rationale",
    label: "CPR rationale",
    description: "Why, and who it was discussed with.",
    required: false,
    group: "emergency care",
    familySafe: false,
  },
  {
    name: "escalation_ceiling",
    label: "Escalation ceiling",
    description: "The level of treatment the team recommends if the person becomes unwell.",
    required: true,
    group: "emergency care",
    familySafe: false,
  },
  {
    name: "escalation_rationale",
    label: "Escalation rationale",
    description: "Why this ceiling, in a sentence a colleague can check.",
    required: false,
    group: "emergency care",
    familySafe: false,
  },
  {
    name: "recommended_interventions",
    label: "Clinical priorities if the patient deteriorates",
    description: "What should happen first, and who should be involved.",
    required: true,
    group: "emergency care",
    familySafe: false,
  },

  // Kept in the model and off the form.
  {
    name: "not_recommended",
    label: "Not recommended (ceilings of treatment)",
    description: "Interventions the team recommends against, agreed with the person or their representative.",
    required: false,
    group: "other",
    familySafe: false,
  },
  {
    name: "preferred_place_of_care",
    label: "Preferred place of care",
    description: "Where the person would prefer to be cared for, as they have said.",
    required: false,
    group: "other",
    familySafe: true,
  },
  {
    name: "preferred_place_of_death",
    label: "Preferred place of death",
    description: "Where the person would prefer to be at the end of their life, as they have said.",
    required: false,
    group: "other",
    familySafe: true,
  },
  {
    name: "adrt_exists",
    label: "Advance decision to refuse treatment (ADRT) on file",
    description: "Whether a separate, legally binding ADRT exists and where it is held; referenced here, never generated.",
    required: false,
    group: "other",
    familySafe: false,
  },
  {
    name: "lpa_health_welfare",
    label: "Lasting power of attorney for health and welfare",
    description: "Whether a lasting power of attorney for health and welfare is registered, and who holds it.",
    required: false,
    group: "other",
    familySafe: false,
  },
  {
    name: "people_involved",
    label: "People involved",
    description: "Who took part in the conversation and who has been informed.",
    required: false,
    group: "other",
    familySafe: true,
  },
];

/** What a signature needs: every field marked required, in form order. */
export const REQUIRED_FIELDS: RecordFieldName[] = RECORD_FIELDS.filter((f) => f.required).map((f) => f.name);

/** Fields whose provenance is checked before signature (record.py CLINICAL_FIELDS, plus the ReSPECT additions). */
export const CLINICAL_FIELDS: RecordFieldName[] = [
  "clinical_summary",
  "clinical_trajectory",
  "active_medications",
  "preferences_for_care",
  "recommended_interventions",
  "not_recommended",
  "cpr_recommendation",
  "cpr_rationale",
  "escalation_ceiling",
  "escalation_rationale",
  "preferred_place_of_care",
  "preferred_place_of_death",
  "capacity_assessment",
];

const BY_NAME = new Map<RecordFieldName, RecordFieldDef>(RECORD_FIELDS.map((f) => [f.name, f]));

export function fieldDef(name: RecordFieldName): RecordFieldDef {
  const def = BY_NAME.get(name);
  if (!def) throw new Error(`no field ${name}`);
  return def;
}

export function fieldLabel(name: RecordFieldName): string {
  return fieldDef(name).label;
}
