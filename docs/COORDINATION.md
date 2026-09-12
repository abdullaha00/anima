# Coordination: the care team, the thread, the outcome

This is the new centre of Cairn. Finding the patient was never the hard part. Getting six
busy people in three organisations to agree what happens, and recording it somewhere that
survives, is the hard part, and it is exactly the fragmentation the organisers described.

## Pushback first, because two of these will be raised by a judge

**"Group chat" is the wrong frame, and the wrong build.** A general-purpose chat holding
identifiable clinical information about dying patients is an information governance
problem a clinician will spot in seconds. Everything below is deliberately a **coordination
thread**: scoped to one patient and one decision, with a stated purpose, a closed
participant list, an audit of who saw what, and an outcome that lands back in the record.
Say "coordination thread" in the interface and in the pitch. Never say "chat" or
"messaging app".

**Professionals and family do not share a thread.** Clinicians discussing ceilings of
treatment need to speak plainly to each other, and a family member reading that
unmediated, unprepared, is a real harm. Build two channels with different content rules.
This is both the clinically correct answer and a strong thing to be asked about.

**The thread is not the record.** Messages are how a decision was reached. The record is
the decision. A decision has to be promoted into the ACP record by a clinician and signed
before it counts or travels. Keep that boundary visible in the interface.

**Do not build real-time infrastructure.** No websockets, no auth, no presence, no
notification service. Seed the other participants with scripted replies, and say plainly
in the README and the pitch that participant responses are simulated. A judge will forgive
a simulated colleague instantly. Nobody will forgive a broken socket at 18:00.

## The patient journey, which is also the worklist state machine

The task list is not just "patients who were flagged". It is every flagged patient with
their current state, so the team can see what is stuck. This is the spine of the product.

```
flagged → team assembled → coordinating → meeting held → record signed → shared
                                   ↘ paused (reason) ↗
```

| State | Means | What the UI offers |
|---|---|---|
| `flagged` | Indicators present, no plan | Review the evidence, assemble the team |
| `team_assembled` | Participants chosen, thread not opened | Open the thread |
| `coordinating` | Thread open, decision not reached | Post, propose, record the outcome |
| `meeting_held` | Outcome captured | Promote decisions into the record |
| `record_signed` | Clinician signed | Share with audiences |
| `shared` | Record has travelled | View audit, review next steps |
| `paused` | Deliberately not proceeding, with a reason | Reason is required and shown |

`paused` matters. Sometimes the right clinical answer is "not yet", and a system that
cannot express that trains people to ignore it. Requiring a reason also gives you an
honest answer when a judge asks what happens to patients the team decides not to act on.

## Who needs to be involved, and why

Apply the same principle as the indicators: **every participant carries a reason, and the
reason is traceable to the record.** A team assembled without visible reasoning is just a
list of names, and a clinician cannot check it.

```ts
export type ParticipantRole =
  | 'usual gp' | 'community nurse' | 'community matron' | 'specialist nurse'
  | 'specialist consultant' | 'palliative care' | 'pharmacist' | 'social care'
  | 'care home' | 'out of hours' | 'ambulance service' | 'next of kin' | 'carer';

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  organisation: string;
  /** Why this person is on the list, in a clinician-checkable sentence. */
  reasonForInclusion: string;
  /** The record entry or indicator behind the reason. */
  evidence: string;
  /** Derived automatically, or added by a clinician. */
  source: 'derived' | 'added by clinician';
  channel: 'professional' | 'family';
  required: boolean;
  status: 'invited' | 'accepted' | 'declined' | 'no response';
}
```

### Derivation rules

Derive a proposed team, then let the clinician add and remove. Each rule produces the
reason and the evidence.

| Trigger | Participant | Reason |
|---|---|---|
| Always | Usual GP | Registered GP, holds the record |
| Tier is review this week or this month | Palliative care / hospice link | Multiple indicators present |
| Heart failure indicator | Heart failure specialist nurse | NYHA class recorded |
| Respiratory indicator | Respiratory or community respiratory team | MRC dyspnoea grade recorded |
| Cancer indicator | Oncology clinical nurse specialist | Advanced cancer on the problem list |
| Renal indicator | Renal team | Advanced kidney disease recorded |
| Neurological indicator | Neurology or MND care coordinator | Progressive neurological condition |
| Frailty, or increased care needs | Community matron and social care | Frailty score, care package change |
| Care package present | Social care | Existing package, needs review with any change |
| Five or more medicines | Community pharmacist | Medicines review alongside the plan |
| Care home resident | Care home manager | Place of care and escalation planning |
| Next of kin recorded | Next of kin, family channel | Named contact in the record |
| Always, on sharing | Out of hours and ambulance service | Receive the signed record |

Out of hours and the ambulance service are **recipients, not participants**. They do not
join the thread. They receive the signed record. Keep that distinction in the interface,
because conflating them is what makes people nervous about systems like this.

## The thread

```ts
export type MessageKind = 'message' | 'proposal' | 'agreement' | 'concern' | 'action' | 'system';

export interface ThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  kind: MessageKind;
  body: string;
  at: string;
  /** For proposals: what is being proposed for the record. */
  proposes?: { field: string; value: string };
  /** Set when a clinician promotes this into the record. */
  promotedToRecord?: boolean;
  /** Simulated participants are marked, always, everywhere they appear. */
  simulated?: boolean;
}

export interface CoordinationThread {
  id: string;
  patientId: string;
  channel: 'professional' | 'family';
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
```

Structured message kinds are worth the small extra effort. A thread of free text is a chat.
A thread where someone **proposes** a ceiling of treatment, two people **agree**, one
raises a **concern**, and the outcome becomes an **action** is a clinical decision record.
It is faster to build than free chat done well, and it is what lets the outcome be
assembled rather than transcribed.

Family channel rules, enforced in code:

- No clinical recommendations, no ceilings of treatment, no CPR content.
- Content limited to: what matters to the person, place preferences, who is involved,
  practical arrangements, and questions.
- Nothing is posted to the family channel automatically. A clinician writes or approves it.

## The outcome and next steps

```ts
export interface MeetingOutcome {
  patientId: string;
  heldAt: string;
  /** Free text is fine here; this is the human summary. */
  summary: string;
  attendees: string[];
  apologies: string[];
  /** Decisions reached, each linked to the thread message that carried it. */
  decisions: { text: string; fromMessageId?: string; intoRecordField?: string }[];
  nextSteps: NextStep[];
  recordedBy: string;
}

export interface NextStep {
  id: string;
  what: string;
  ownerId: string;          // a participant, never "the team"
  due: string;              // a date, never "soon"
  status: 'open' | 'done' | 'blocked';
  createdFrom?: string;     // thread message id
  blockedReason?: string;
}
```

Two rules that make this a product rather than a form. **Every next step has one named
owner and a date.** An action owned by "the team" is an action nobody does, and a
clinician will tell you so. **Open next steps surface back on the worklist**, so the task
list shows not only who was flagged but who is waiting on something. That closes the loop
and it is the thing that makes the worklist worth opening tomorrow as well as today.

## Promotion into the record

The bridge between coordination and the signed record, and the place to be careful.

1. A decision in the thread carries an optional `intoRecordField`.
2. The clinician reviews proposed field changes side by side with the current record.
3. Accepting sets the field with provenance: source becomes the thread message, recorded
   by becomes the clinician who accepted it, not the person who proposed it.
4. The record still requires a signature. Promotion never signs.

That last point is the whole governance argument in one sentence: the team can agree
anything, and a named clinician still has to sign it.

## Persistence, given there is no backend

Default, unless the team decides otherwise: a small server-side store in the Next.js app,
seeded from the snapshot, written to a JSON file under `data/state/`. No database. It
survives a refresh, it survives a restart, and it needs no infrastructure. Wrap it behind
`src/lib/store/index.ts` so swapping in something real later touches one file.

Do not put coordination state in `localStorage`. Two people demonstrating on two laptops
would see different worlds, and that will happen at judging.

## What this does to the demo

Four beats now, still inside ninety seconds.

1. **The worklist**, with state. "Forty-one people have indicators and no plan. Eleven are
   waiting on somebody."
2. **The patient**, and the evidence chain. Moment one: open a flag, see why.
3. **The team**, assembled with reasons. "Cairn proposes these six people, and here is why
   each one." This is new and it is the clearest expression of the organisers' thesis: the
   people already exist, and nothing connects them.
4. **The thread, the outcome, the record.** A proposal, agreement, a decision promoted
   into the record, then moment two: Cairn tries to sign and is refused, a clinician signs,
   and the record renders differently for the ambulance crew and the family. Next steps
   appear back on the worklist with owners and dates.

If time forces a cut, cut the family channel first, then the concern and agreement message
kinds, then the read receipts. Protect the team assembly with reasons, the outcome with
owned next steps, and the signature refusal.
