/**
 * Derive a proposed care team from the record. Every participant carries a reason and the
 * evidence behind it, so a clinician can check the list rather than trust it.
 * The rules are the derivation table in docs/COORDINATION.md.
 */

import type { Assessment, Participant, Patient, Signal } from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { rosterPerson } from "./roster";

/** Builds a professional-channel participant from the roster. */
function fromRoster(
  key: string,
  reasonForInclusion: string,
  evidence: string,
  required: boolean,
  extra: Partial<Participant> = {},
): Participant {
  const person = rosterPerson(key);
  return {
    id: `p-${key}`,
    name: person.name,
    role: person.role,
    roleLabel: person.roleLabel,
    organisation: person.organisation,
    reasonForInclusion,
    evidence,
    source: "derived",
    channel: "professional",
    required,
    status: "invited",
    simulated: person.simulated,
    ...extra,
  };
}

/** The first signal whose id is in the list, if any. */
function firstSignal(assessment: Assessment, ids: string[]): Signal | undefined {
  return assessment.signals.find((s) => ids.includes(s.id));
}

export function deriveTeam(patient: Patient, assessment: Assessment): Participant[] {
  const team: Participant[] = [];
  const seen = new Set<string>();
  const add = (p: Participant) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    team.push(p);
  };

  // Always: the usual GP, who holds the record. This is the signed-in clinician.
  add({
    ...fromRoster("usual-gp", "Registered GP; holds the record.", patient.usualGp ?? "Registered GP on the record", true),
    id: CLINICIAN.id,
    status: "accepted",
    simulated: false,
  });

  // Tier this week or this month: palliative care.
  if (assessment.tier === "review this week" || assessment.tier === "review this month") {
    const labels = assessment.signals.map((s) => s.label).join("; ");
    add(
      fromRoster(
        "palliative",
        "Multiple indicators present; the tier calls for a palliative care view.",
        labels ? `Tier '${assessment.tier}': ${labels}` : `Tier '${assessment.tier}'`,
        true,
      ),
    );
  }

  // Disease-specific indicators bring the matching specialist.
  const heart = firstSignal(assessment, ["DIS_HEART", "REC_HEART"]);
  if (heart) add(fromRoster("hf-nurse", "Heart failure indicator present in the record.", heart.evidence, true));

  const resp = firstSignal(assessment, ["DIS_RESP", "REC_RESP"]);
  if (resp) add(fromRoster("resp-team", "Respiratory indicator present in the record.", resp.evidence, true));

  const cancer = firstSignal(assessment, ["DIS_CANCER"]);
  if (cancer) add(fromRoster("oncology-cns", "Cancer indicator present in the record.", cancer.evidence, true));

  const renal = firstSignal(assessment, ["DIS_RENAL", "REC_RENAL_EGFR"]);
  if (renal) add(fromRoster("renal-team", "Renal indicator present in the record.", renal.evidence, true));

  const neuro = firstSignal(assessment, ["DIS_NEURO"]);
  if (neuro) add(fromRoster("neuro-coordinator", "Neurological indicator present in the record.", neuro.evidence, true));

  // Frailty or increased care needs: community matron and social care together.
  const frailty = firstSignal(assessment, ["GEN_FRAILTY", "REC_FRAILTY", "GEN_CARE_NEEDS"]);
  if (frailty) {
    add(fromRoster("community-matron", "Frailty or increased care needs recorded.", frailty.evidence, true));
    add(fromRoster("social-care", "Frailty or increased care needs recorded; any package needs review with a change.", frailty.evidence, false));
  }

  // Recorded needs.
  if (patient.needs.includes("Home visit")) {
    add(
      fromRoster(
        "community-nurse",
        "Home visits are a recorded need.",
        "Home visit recorded as a need in the patient directory",
        false,
      ),
    );
  }

  // Five or more medicines: a medicines review alongside the plan.
  if ((patient.medicationCount ?? 0) >= 5) {
    add(
      fromRoster(
        "pharmacist",
        "Five or more medicines on the record; medicines review alongside the plan.",
        `${patient.medicationCount} medicines on the record`,
        false,
      ),
    );
  }

  // Care home resident: place of care and escalation planning.
  if (patient.careHomeResident) {
    add(
      fromRoster(
        "care-home",
        "Care home resident; place of care and escalation planning.",
        "Care home residence recorded in the patient directory",
        false,
      ),
    );
  }

  // Family channel: one participant when carer involvement is recorded. The record carries
  // no next of kin today; if it did, that person would be role 'next of kin' here.
  if (patient.needs.includes("Carer involvement")) {
    add({
      id: "p-carer",
      name: "Carer (name not recorded)",
      role: "carer",
      roleLabel: "Carer",
      organisation: "Family",
      reasonForInclusion: "Carer involvement is a recorded need; the family channel keeps them informed.",
      evidence: "Carer involvement recorded as a need in the patient directory",
      source: "derived",
      channel: "family",
      required: false,
      status: "invited",
      simulated: true,
    });
  }

  // Always: out of hours and the ambulance service receive the signed record. They never
  // join the thread.
  const recipientReason = "Recipient of the signed record; does not join the thread";
  add(fromRoster("out-of-hours", recipientReason, "Always, on sharing", true, { recipientOnly: true }));
  add(fromRoster("ambulance", recipientReason, "Always, on sharing", true, { recipientOnly: true }));

  return team;
}
