/**
 * The Cairn domain contract.
 *
 * Nothing in this file can express a score, a percentage or a forecast about a
 * patient. That is deliberate. The UI depends on these shapes and never on how an
 * assessment was produced. See docs/DOMAIN.md and docs/COORDINATION.md.
 */

// ---------------------------------------------------------------------------
// Indicators and assessment
// ---------------------------------------------------------------------------

export type SignalFamily = 'general' | 'disease-specific' | 'service-use';

export interface Signal {
  /** Stable code, so a flag is auditable months later. e.g. 'GEN_FRAILTY' */
  id: string;
  /** What the clinician reads. e.g. 'Moderate to severe frailty' */
  label: string;
  family: SignalFamily;
  /** The published tool this indicator is shaped after. e.g. 'SPICT general indicator' */
  basis: string;
  /** The specific record entry that fired it, in words a clinician can check. */
  evidence: string;
  /** When the underlying record entry was made, if known. ISO date. */
  recordedAt?: string;
}

export type ReviewTier =
  | 'review this week'
  | 'review this month'
  | 'consider at next contact'
  | 'no prompt';

export const TIER_ORDER: Record<ReviewTier, number> = {
  'review this week': 0,
  'review this month': 1,
  'consider at next contact': 2,
  'no prompt': 3,
};

export interface Assessment {
  patientId: string;
  signals: Signal[];
  tier: ReviewTier;
  alreadyOnRegister: boolean;
  hasPlan: boolean;
  /**
   * Optional ordering hint from a model. Lower sorts earlier.
   * NEVER rendered as a number, a percentage or a bar. It may only affect sort order
   * within a tier, and its presence must be disclosed in the UI.
   */
  modelRank?: number;
  /** e.g. 'model-suggested ordering, not validated against outcomes' */
  modelNote?: string;
}

// ---------------------------------------------------------------------------
// The patient, as normalised from the simulator (see src/lib/data/normalise.ts)
// ---------------------------------------------------------------------------

export interface Condition {
  /** As written in the record, e.g. 'Heart failure' */
  term: string;
  /** Where it came from: the patient directory, or the GP problem list */
  source: 'directory' | 'problem list';
  /** Problem-list status, when the source carries one */
  status?: 'active' | 'resolved';
  /** ISO date the entry was recorded, when known */
  recordedAt?: string;
  code?: string;
}

export interface Admission {
  /** ISO datetime */
  at: string;
  /** True only when the record shows an unplanned episode (ED attendance, admission). */
  emergency: boolean;
  /** 'hospital attendance' | 'discharge summary' */
  kind: 'hospital attendance' | 'discharge summary';
  lengthOfStayDays?: number;
  summary?: string;
  /** Simulator resource id, for citation */
  sourceId?: string;
}

export interface LabResult {
  /** ISO date collected */
  at: string;
  /** Analyte id as the laboratory reports it, e.g. 'egfr' */
  analyte: string;
  name: string;
  value: number;
  unit: string;
  referenceLow?: number;
  referenceHigh?: number;
  sourceId?: string;
}

export interface Narrative {
  at: string;
  kind: 'consultation' | 'discharge' | 'referral' | 'other';
  text: string;
  title?: string;
  sourceId?: string;
}

/**
 * One medicine on the record, with every structured field the source carries.
 * The simulator's medicines list and prescriptions name the medicine, its route,
 * status and dates, but carry no dose or frequency; those fields stay undefined
 * rather than being guessed. The UI says so when nothing carries them.
 */
export interface MedicationEntry {
  name: string;
  /** e.g. 'current' | 'ended' | 'approved' | 'supplied', as the record says */
  status?: string;
  dose?: string;
  frequency?: string;
  route?: string;
  form?: string;
  quantity?: string;
  startedAt?: string;
  endedAt?: string;
  prescriber?: string;
  note?: string;
  /** 'GP medicines list' | 'hospital prescription' | 'EPS' */
  source: string;
  at?: string;
  sourceId?: string;
}

export interface TimelineEvent {
  at: string;
  kind:
    | 'attendance'
    | 'discharge summary'
    | 'consultation'
    | 'task'
    | 'appointment'
    | 'blood result'
    | 'prescription'
    | 'message'
    | 'other';
  title: string;
  detail?: string;
  /** Which service holds this entry: gp, hospital, community, pharmacy */
  service?: string;
  sourceId?: string;
}

/**
 * A value the adapter found in free text rather than a structured field. Kept so the
 * evidence chain can quote the sentence and its date. The value is never invented: if the
 * record does not say it, there is no finding.
 */
export interface ExtractedFinding {
  field:
    | 'nyha'
    | 'mrcDyspnoea'
    | 'frailtyCfs'
    | 'weightLossPct'
    | 'performanceStatus'
    | 'carePackageIncreasedAt'
    | 'careHomeResident'
    | 'onPalliativeRegister'
    | 'hasAcpRecord'
    | 'dnacpr'
    | 'adrt'
    | 'nextOfKin'
    | 'condition';
  value: string | number | boolean;
  /** The sentence in the record that carried it */
  quote: string;
  at?: string;
  sourceId?: string;
  /** e.g. 'consultation', 'discharge summary', 'hospital note', 'message' */
  sourceKind: string;
}

export interface Patient {
  id: string;
  name?: string;
  /** Age in whole years at the simulation clock, derived from birthDate. */
  age?: number;
  birthDate?: string;
  sex?: string;
  /** Plain condition terms for display and matching. Derived from `conditionDetail`. */
  conditions: string[];
  conditionDetail: Condition[];
  admissions: Admission[];
  labs: LabResult[];
  /** The patient's own goals, as recorded in the directory. Their words, shown first. */
  goals: string[];
  /** Recorded needs, e.g. 'Carer involvement', 'Home visit' */
  needs: string[];
  /** Number of medicines on the record, when the record carries a medicines list. */
  medicationCount?: number;
  /** Each medicine with whatever the record carries about it. See MedicationEntry. */
  medications?: MedicationEntry[];
  timeline: TimelineEvent[];
  /** The GP clinician named on the record, when known */
  usualGp?: string;
  practice?: string;
  imdQuintile?: number;
  frailtyCfs?: number;
  frailtyRecordedAt?: string;
  weightLossPct?: number;
  performanceStatus?: number;
  nyha?: number;
  mrcDyspnoea?: number;
  carePackageIncreasedAt?: string;
  careHomeResident?: boolean;
  onPalliativeRegister: boolean;
  hasAcpRecord: boolean;
  /** Free text the ML stage may consume. The rules engine ignores it. */
  narratives?: Narrative[];
  /** Values found in free text, each with the sentence that carried it. */
  extracted?: ExtractedFinding[];
  /** A named contact found in the record, if any */
  nextOfKin?: string;
  /** What the record says about an existing plan, DNACPR or ADRT, quoted, if anything */
  existingPlanNote?: string;
  /** True when the deep GP record was pulled for this patient, not only the directory row. */
  recordDepth: 'directory' | 'full';
}

// ---------------------------------------------------------------------------
// The snapshot on disk
// ---------------------------------------------------------------------------

export interface SnapshotMeta {
  takenAt: string;
  baseUrl: string;
  /** Simulation clock at the time of the snapshot, ISO */
  simulationNow: string;
  patientCount: number;
  fullRecordCount: number;
  populationTotal?: number;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Coordination: the care team, the thread, the outcome
// ---------------------------------------------------------------------------

export type ParticipantRole =
  | 'usual gp'
  | 'community nurse'
  | 'community matron'
  | 'specialist nurse'
  | 'specialist consultant'
  | 'palliative care'
  | 'pharmacist'
  | 'social care'
  | 'care home'
  | 'out of hours'
  | 'ambulance service'
  | 'next of kin'
  | 'carer';

export type Channel = 'professional' | 'family';

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  /** A finer description shown with the role, e.g. 'Heart failure specialist nurse' */
  roleLabel?: string;
  organisation: string;
  /** Why this person is on the list, in a clinician-checkable sentence. */
  reasonForInclusion: string;
  /** The record entry or indicator behind the reason. */
  evidence: string;
  /** Derived automatically, or added by a clinician. */
  source: 'derived' | 'added by clinician';
  channel: Channel;
  required: boolean;
  status: 'invited' | 'accepted' | 'declined' | 'no response';
  /** Out of hours and the ambulance service receive the signed record; they never join the thread. */
  recipientOnly?: boolean;
  /** Everyone other than the signed-in clinician is a simulated colleague. Marked in the UI. */
  simulated?: boolean;
}

export type MessageKind = 'message' | 'proposal' | 'agreement' | 'concern' | 'action' | 'system';

export interface ThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  kind: MessageKind;
  body: string;
  at: string;
  /** For proposals: what is being proposed for the record. */
  proposes?: { field: RecordFieldName; value: string };
  /** For agreements and concerns: the proposal this attaches to. */
  inReplyTo?: string;
  /** Set when a clinician promotes this into the record. */
  promotedToRecord?: boolean;
  /** Simulated participants are marked, always, everywhere they appear. */
  simulated?: boolean;
  /** Family channel only: the clinician who wrote or approved this entry. */
  approvedBy?: string;
}

export interface CoordinationThread {
  id: string;
  patientId: string;
  channel: Channel;
  /** A stated purpose. Required. Shown at the top of the thread. */
  purpose: string;
  openedBy: string;
  openedAt: string;
  participantIds: string[];
  messages: ThreadMessage[];
  /** Who has opened this thread and when. Coordination feature and audit trail at once. */
  reads: { participantId: string; at: string }[];
  closedAt?: string;
}

export interface NextStep {
  id: string;
  what: string;
  /** A participant id, never "the team" */
  ownerId: string;
  /** ISO date, never "soon" */
  due: string;
  status: 'open' | 'done' | 'blocked';
  createdFrom?: string;
  blockedReason?: string;
}

export interface Decision {
  text: string;
  fromMessageId?: string;
  intoRecordField?: RecordFieldName;
  /** The value proposed for the record field, carried from the proposal */
  proposedValue?: string;
  /** Set once a clinician accepts this into the record */
  promotedAt?: string;
}

export interface MeetingOutcome {
  patientId: string;
  heldAt: string;
  summary: string;
  attendees: string[];
  apologies: string[];
  decisions: Decision[];
  nextSteps: NextStep[];
  recordedBy: string;
}

// ---------------------------------------------------------------------------
// The record that travels
// ---------------------------------------------------------------------------

export type RecordFieldName =
  | 'what_matters'
  | 'concerns_and_fears'
  | 'clinical_summary'
  | 'preferences_for_care'
  | 'recommended_interventions'
  | 'not_recommended'
  | 'cpr_recommendation'
  | 'preferred_place_of_care'
  | 'preferred_place_of_death'
  | 'capacity_assessment'
  | 'adrt_exists'
  | 'lpa_health_welfare'
  | 'people_involved'
  | 'clinical_trajectory'
  | 'active_medications'
  | 'cpr_rationale'
  | 'escalation_ceiling'
  | 'escalation_rationale';

export interface RecordEntry {
  value: string;
  /** "conversation 2026-09-12 with Dr A Patel", "record: problem list", or "thread message m-12" */
  source: string;
  /** The named clinician who recorded it. For a promotion, the accepting clinician. */
  recordedBy: string;
  recordedAt: string;
  /** Where the source is a thread message, its id, so the UI can link back */
  sourceMessageId?: string;
}

export type RecordStatus = 'draft' | 'awaiting_signature' | 'signed' | 'shared' | 'superseded';

export type Audience = 'gp' | 'out_of_hours' | 'ambulance' | 'hospice' | 'hospital' | 'family';

export interface AuditEvent {
  at: string;
  /** e.g. 'set', 'promote', 'sign', 'refuse-sign', 'share', 'state', 'participant', 'thread' */
  action: string;
  actor: string;
  detail: string;
}

export interface CairnRecord {
  patientId: string;
  status: RecordStatus;
  fields: Partial<Record<RecordFieldName, RecordEntry>>;
  signedBy?: string;
  signedAt?: string;
  /** The signing clinician's registration number, as typed at signature. */
  signedGmc?: string;
  /** The typed signature, as entered at signature. */
  signature?: string;
  /** ISO date the plan is due a review, set at signature. */
  nextReviewAt?: string;
  sharedWith: Audience[];
  audit: AuditEvent[];
  version: number;
}

// ---------------------------------------------------------------------------
// The worklist state machine
// ---------------------------------------------------------------------------

export type WorklistState =
  | 'flagged'
  | 'team assembled'
  | 'coordinating'
  | 'meeting held'
  | 'record signed'
  | 'shared'
  | 'paused';

/** Display and sort order: work in progress first, then completed, then untouched flags, then paused. */
export const WORKLIST_STATE_ORDER: WorklistState[] = [
  'coordinating',
  'meeting held',
  'team assembled',
  'record signed',
  'shared',
  'flagged',
  'paused',
];

/** Everything Cairn knows about one patient's journey, beyond the record itself. */
export interface CaseState {
  patientId: string;
  state: WorklistState;
  /** Required when paused, and shown. */
  pausedReason?: string;
  /** The state to return to when a pause is lifted. */
  pausedFrom?: WorklistState;
  participants: Participant[];
  /** Removals stay in the audit, because who was left out matters. */
  removedParticipants: { participant: Participant; removedBy: string; at: string; reason?: string }[];
  threads: CoordinationThread[];
  outcome?: MeetingOutcome;
  /** Clinician-reviewed screening proposals, separate from a held meeting. */
  screeningReviews?: import("../stage1/clinical-review").ScreeningDecision[];
  preparationSteps?: NextStep[];
  record: CairnRecord;
  audit: AuditEvent[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Worklist row, what the first screen renders
// ---------------------------------------------------------------------------

export interface WorklistRow {
  patientId: string;
  name?: string;
  age?: number;
  conditions: string[];
  assessment: Assessment;
  state: WorklistState;
  pausedReason?: string;
  /** The oldest open next step, with its owner, if any */
  waitingOn?: { what: string; ownerName: string; ownerRole: string; due: string; status: NextStep['status'] };
  isCancer: boolean;
  imdQuintile?: number;
  /** When the record was last signed or edited (latest of signedAt and the audit), for spotting plans due a review */
  lastTouchedAt?: string;
}

export interface Funnel {
  patientsScanned: number;
  alreadyOnRegister: number;
  indicatorsPresent: number;
  notOnRegisterOrPlan: number;
  reviewThisWeek: number;
  promptedForReview: number;
  waitingOnSomeone: number;
}

export interface Equity {
  cohortCancerShare: number | null;
  cohortNonCancerShare: number | null;
  newlyIdentifiedNonCancerShare: number | null;
  /** Empty when the data carries no deprivation field */
  flagRateByImdQuintile: Record<string, number>;
  imdAvailable: boolean;
  note: string;
}

export interface SweepResult {
  funnel: Funnel;
  byTier: Record<ReviewTier, number>;
  equity: Equity;
  rows: WorklistRow[];
  /** Which catalogue indicators could not fire because the data source lacks the field */
  inertIndicators: { id: string; label: string; missingField: string }[];
  engineId: string;
  modelDisclosure?: string;
}
