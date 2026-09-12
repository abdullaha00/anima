/**
 * The fields of the record, in display order, with the labels and the rules a clinician sees.
 * Ported from reference/cairn/record.py. The order here is the order on the record screen.
 */

import type { RecordFieldName } from "@/lib/domain/types";

export interface RecordFieldDef {
  name: RecordFieldName;
  label: string;
  description: string;
  required: boolean;
  group: "the person" | "clinical recommendations" | "capacity and representation";
  /** True when the field may appear on the family view. */
  familySafe: boolean;
}

export const RECORD_FIELDS: RecordFieldDef[] = [
  // What matters to the person. Their words come first, deliberately.
  {
    name: "what_matters",
    label: "What matters to the person",
    description: "The person's own priorities, in their words, recorded from the conversation.",
    required: true,
    group: "the person",
    familySafe: true,
  },
  {
    name: "concerns_and_fears",
    label: "Concerns and fears",
    description: "What the person is worried about, in their words.",
    required: false,
    group: "the person",
    familySafe: true,
  },

  // Clinical recommendations, ReSPECT-shaped.
  {
    name: "clinical_summary",
    label: "Clinical summary",
    description: "A short summary of the relevant conditions and recent events, as recorded.",
    required: true,
    group: "clinical recommendations",
    familySafe: false,
  },
  {
    name: "preferences_for_care",
    label: "Preferences for care",
    description: "Where the person's priority sits between comfort and life-sustaining treatment.",
    required: true,
    group: "clinical recommendations",
    familySafe: false,
  },
  {
    name: "recommended_interventions",
    label: "Recommended interventions",
    description: "What the team recommends should be done if the person becomes unwell.",
    required: true,
    group: "clinical recommendations",
    familySafe: false,
  },
  {
    name: "not_recommended",
    label: "Not recommended (ceilings of treatment)",
    description: "Interventions the team recommends against, agreed with the person or their representative.",
    required: false,
    group: "clinical recommendations",
    familySafe: false,
  },
  {
    name: "cpr_recommendation",
    label: "CPR recommendation",
    description:
      "A clinical recommendation about CPR, agreed with the person; it is not legally binding and is not a DNACPR form.",
    required: true,
    group: "clinical recommendations",
    familySafe: false,
  },
  {
    name: "preferred_place_of_care",
    label: "Preferred place of care",
    description: "Where the person would prefer to be cared for, as they have said.",
    required: false,
    group: "clinical recommendations",
    familySafe: true,
  },
  {
    name: "preferred_place_of_death",
    label: "Preferred place of death",
    description: "Where the person would prefer to be at the end of their life, as they have said.",
    required: false,
    group: "clinical recommendations",
    familySafe: true,
  },

  // Capacity and representation.
  {
    name: "capacity_assessment",
    label: "Capacity assessment",
    description: "Whether the person has capacity for this decision, and who assessed it.",
    required: true,
    group: "capacity and representation",
    familySafe: false,
  },
  {
    name: "adrt_exists",
    label: "Advance decision to refuse treatment (ADRT) on file",
    description:
      "Whether a separate, legally binding ADRT exists and where it is held; it is referenced here, never generated.",
    required: false,
    group: "capacity and representation",
    familySafe: false,
  },
  {
    name: "lpa_health_welfare",
    label: "Lasting power of attorney for health and welfare",
    description: "Whether a lasting power of attorney for health and welfare is registered, and who holds it.",
    required: false,
    group: "capacity and representation",
    familySafe: false,
  },
  {
    name: "people_involved",
    label: "People involved",
    description: "Who took part in the conversation and who has been informed.",
    required: true,
    group: "capacity and representation",
    familySafe: true,
  },
];

/** Exactly record.py missing_for_signature. */
export const REQUIRED_FIELDS: RecordFieldName[] = [
  "what_matters",
  "clinical_summary",
  "preferences_for_care",
  "recommended_interventions",
  "cpr_recommendation",
  "capacity_assessment",
  "people_involved",
];

/** Exactly record.py CLINICAL_FIELDS. */
export const CLINICAL_FIELDS: RecordFieldName[] = [
  "clinical_summary",
  "preferences_for_care",
  "recommended_interventions",
  "not_recommended",
  "cpr_recommendation",
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
