/**
 * A small fictional roster of colleagues, keyed by the role a patient needs. Everyone here
 * except the signed-in GP is a simulated participant and is marked as such in the UI.
 * No real people. Names are invented.
 */

import type { ParticipantRole } from "@/lib/domain/types";
import { CLINICIAN, ORGANISATIONS } from "@/lib/copy";

export interface RosterPerson {
  key: string;
  name: string;
  role: ParticipantRole;
  roleLabel: string;
  organisation: string;
  simulated: boolean;
}

export const ROSTER: RosterPerson[] = [
  {
    key: "usual-gp",
    name: CLINICIAN.name,
    role: CLINICIAN.role,
    roleLabel: "Usual GP",
    organisation: CLINICIAN.organisation,
    simulated: false,
  },
  {
    key: "palliative",
    name: "Dr Helen Okafor",
    role: "palliative care",
    roleLabel: "Palliative care consultant",
    organisation: ORGANISATIONS.hospice,
    simulated: true,
  },
  {
    key: "hf-nurse",
    name: "Priya Raman",
    role: "specialist nurse",
    roleLabel: "Heart failure specialist nurse",
    organisation: ORGANISATIONS.hospital,
    simulated: true,
  },
  {
    key: "resp-team",
    name: "Gareth Llewellyn",
    role: "specialist nurse",
    roleLabel: "Community respiratory nurse",
    organisation: ORGANISATIONS.community,
    simulated: true,
  },
  {
    key: "oncology-cns",
    name: "Siobhan Doyle",
    role: "specialist nurse",
    roleLabel: "Oncology clinical nurse specialist",
    organisation: ORGANISATIONS.hospital,
    simulated: true,
  },
  {
    key: "renal-team",
    name: "Dr Tomasz Nowak",
    role: "specialist consultant",
    roleLabel: "Renal consultant",
    organisation: ORGANISATIONS.hospital,
    simulated: true,
  },
  {
    key: "neuro-coordinator",
    name: "Fatima Begum",
    role: "specialist nurse",
    roleLabel: "Neurology care coordinator",
    organisation: ORGANISATIONS.hospital,
    simulated: true,
  },
  {
    key: "community-matron",
    name: "Janet Whitfield",
    role: "community matron",
    roleLabel: "Community matron",
    organisation: ORGANISATIONS.community,
    simulated: true,
  },
  {
    key: "social-care",
    name: "Marcus Bello",
    role: "social care",
    roleLabel: "Social worker",
    organisation: ORGANISATIONS.socialCare,
    simulated: true,
  },
  {
    key: "pharmacist",
    name: "Anjali Mehta",
    role: "pharmacist",
    roleLabel: "Community pharmacist",
    organisation: ORGANISATIONS.pharmacy,
    simulated: true,
  },
  {
    key: "care-home",
    name: "Lorraine Baxter",
    role: "care home",
    roleLabel: "Care home manager",
    organisation: "Care home",
    simulated: true,
  },
  {
    key: "community-nurse",
    name: "Ewan Fraser",
    role: "community nurse",
    roleLabel: "Community nurse",
    organisation: ORGANISATIONS.community,
    simulated: true,
  },
  {
    key: "out-of-hours",
    name: "Out-of-hours service",
    role: "out of hours",
    roleLabel: "Out-of-hours service",
    organisation: ORGANISATIONS.outOfHours,
    simulated: true,
  },
  {
    key: "ambulance",
    name: "Ambulance service",
    role: "ambulance service",
    roleLabel: "Ambulance service",
    organisation: ORGANISATIONS.ambulance,
    simulated: true,
  },
];

const BY_KEY = new Map<string, RosterPerson>(ROSTER.map((p) => [p.key, p]));

export function rosterPerson(key: string): RosterPerson {
  const person = BY_KEY.get(key);
  if (!person) throw new Error(`no roster entry ${key}`);
  return person;
}
