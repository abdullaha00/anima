/**
 * Who sees which fields. Field-level allowlists, not styling variants, so the table can be
 * shown to a judge. Ported from record.py view_for.
 */

import type { Audience, RecordFieldName } from "@/lib/domain/types";
import { FAMILY_CONSENT_LINE, NOT_BINDING_LINE } from "@/lib/copy";

export const AUDIENCES: Audience[] = ["gp", "out_of_hours", "ambulance", "hospice", "hospital", "family"];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  gp: "GP",
  out_of_hours: "Out of hours",
  ambulance: "Ambulance service",
  hospice: "Hospice",
  hospital: "Hospital",
  family: "Family",
};

/** Fields in the order they are shown. 'all' means the full record in RECORD_FIELDS order. */
export const AUDIENCE_FIELDS: Record<Audience, RecordFieldName[] | "all"> = {
  ambulance: [
    "cpr_recommendation",
    "cpr_rationale",
    "escalation_ceiling",
    "recommended_interventions",
    "preferences_for_care",
    "preferred_place_of_care",
  ],
  out_of_hours: [
    "clinical_summary",
    "clinical_trajectory",
    "preferences_for_care",
    "escalation_ceiling",
    "escalation_rationale",
    "recommended_interventions",
    "not_recommended",
    "cpr_rationale",
    "active_medications",
    "preferred_place_of_care",
    "preferred_place_of_death",
  ],
  family: ["what_matters", "preferred_place_of_care", "people_involved"],
  gp: "all",
  hospice: "all",
  hospital: "all",
};

export const AUDIENCE_NOTES: Partial<Record<Audience, string>> = {
  ambulance: NOT_BINDING_LINE,
  family: FAMILY_CONSENT_LINE,
};

export const AUDIENCE_DESCRIPTIONS: Record<Audience, string> = {
  ambulance: "A few lines, readable at arm's length. CPR recommendation first.",
  out_of_hours: "The clinical picture, the escalation ceiling and the medicines.",
  hospice: "The full record.",
  gp: "The full record, as held by the practice.",
  hospital: "The full record, for the admitting team.",
  family: "What matters to the person, the place preferences and who is involved. No clinical recommendations.",
};
