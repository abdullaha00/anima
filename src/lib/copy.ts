/**
 * Shared interface copy. The language is part of the clinical safety argument, so it lives
 * in one place. scripts/check-language.mjs guards the banned list across src/ and the build.
 */

export const QUIET_LINE =
  "Indicators present in the record. This is a prompt for clinical review, not a prediction about this patient.";

export const NO_PLAN_RECORDED = "No plan recorded";

export const DRAFT_LINE = "Draft, awaiting clinician signature";

export const NOT_BINDING_LINE =
  "Recommendations, not legally binding. Clinical judgement applies. This is not a DNACPR form.";

export const ADRT_LINE =
  "An advance decision to refuse treatment (ADRT) is a separate, legally binding document. Cairn references it and never generates one.";

export const FAMILY_CONSENT_LINE = "Shared with the family by the signing clinician. No clinical recommendations are included here.";

export const THREAD_NOT_RECORD_LINE =
  "Discussion here does not change the record. A named clinician promotes what is agreed into the record and signs it.";

export const SIMULATED_LINE =
  "Simulated participant. Replies from colleagues are seeded for this demonstration.";

export const MODEL_DISCLOSURE =
  "Ordering within each tier is model-suggested and not validated against outcomes. Indicators and tiers come from the rules only.";

export const COMPARATOR_LINE =
  "Historically about 29% of people who died were on a palliative care register before death, roughly 67% of cancer patients against 20% of non-cancer (Harrison et al., BJGP 2012).";

/** The signed-in clinician for the demo. Dr Maya Shah is the GP named on the simulator's own appointment records. */
export const CLINICIAN = {
  id: "p-gp",
  name: "Dr Maya Shah",
  role: "usual gp" as const,
  organisation: "Riverside Practice",
  /** A simulated registration number for the demonstration clinician. Not a real GMC number. */
  gmc: "7654321",
};

export const ORGANISATIONS = {
  gp: "Riverside Practice",
  hospital: "Northbank General",
  community: "Community visiting team",
  pharmacy: "High Street Pharmacy",
  hospice: "Neighbourhood hospice",
  socialCare: "Local authority adult social care",
  outOfHours: "Out-of-hours service",
  ambulance: "Ambulance service",
};
