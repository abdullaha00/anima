# Cairn

Advance care planning, coordinated. A clinician-facing tool for an NHS neighbourhood of
about 50,000 simulated patients, built at the OpenAI x Anima Health hackathon.

Cairn does four things:

1. **Find** the people whose records already carry recognised indicators of deteriorating
   health and who have no plan recorded, with the record entry behind every indicator.
2. **Convene** the people who need to be part of the decision, each with a reason traced to
   the record, in a coordination thread attached to that patient.
3. **Decide**: capture the outcome as decisions and next steps, each with one named owner
   and a date.
4. **Travel**: promote the decisions into a structured record that a named clinician signs,
   which then reaches the GP, out-of-hours, the ambulance service, the hospice and the
   family, each seeing only what they need.

Cairn reports indicators present in the record as a prompt for clinical review. It makes no prediction
about any patient. It cannot sign a record. Nothing unsigned is shared.

## Run it

Node 20.9 or newer and npm.

```bash
npm ci
npm run build && npm start     # http://localhost:3000, no network needed after the build
npm run dev                    # development server
```

Checks:

```bash
npm run lint        # eslint, then the language guard
npm run typecheck
npm run test        # the rules engine, the record governance, the coordination rules, the store
npm run build
npm run check       # the language guard on its own (scans src/, README.md and the build output)
```

## The demo, in four beats

1. **Worklist.** How many carry indicators and no plan, and who is waiting on somebody. Cases in
   progress sit at the top with their next action and owner.
2. **Patient.** Amira Khan, SIM-000001. Open an indicator: the record entry that fired it, the
   tool it is shaped after, the date. Cairn reports what is in the record and makes no prediction.
3. **Care team.** Assemble the team: every person with a reason and the record entry behind it.
   Recipients of the signed record and the family channel sit apart.
4. **Thread, outcome, record.** Propose, agree, record the outcome, promote a decision into the
   record. Cairn attempts to sign and is refused. A named clinician signs. The ambulance view and
   the family view are different documents. The open next step is back on the worklist.

Rehearsal helpers: `npm run demo:reset` clears Amira's case; `npm run demo:advance -- <stage>`
walks it to `team`, `thread`, `outcome`, `promoted`, `refused`, `signed` or `shared`.

## What is real and what is illustrative

Be honest about this in the pitch, because a judge will ask.

**Real, from the simulator.** Every patient, name, date of birth, condition, problem-list
entry with its status and date, hospital attendance, discharge summary, blood result and
recorded goal or need on screen comes from NHS-SIM (`https://sim.animahealth.com`), pulled
into `data/snapshot/` by `npm run snapshot`. Every figure on the worklist is computed from
that data. Every indicator shows the record entry that fired it.

**Derived by rules, editable by a doctor.** The indicator catalogue lives in one table,
`src/lib/scoring/catalogue.ts`. The reference rules are a direct port of the Python in
`reference/cairn/signals.py`, shaped after SPICT and the GSF guidance. Because the simulator
carries no frailty score, NYHA class, MRC grade, performance status, weight loss, care package
change, cancer, dementia, deprivation, register or advance care plan fields, those reference
rules cannot fire and the worklist says so ("no data, not no indicator"). A second group of
**adapted** rules reads what the simulator does carry: a condition on the problem list without
its severity grade, chronic kidney disease with a latest eGFR under 30, and unplanned hospital
episodes. Each is labelled as adapted and pending clinical sign-off, and can be switched off by
flipping one flag in the table.

**Simulated.** The other participants in the coordination thread are simulated colleagues
with fictional names from `src/lib/coordination/roster.ts`. Their replies are scripted in
`src/lib/coordination/fixtures.ts`, grounded only in data that exists on the patient, and
every one of them is marked *simulated* in the interface. There are no websockets, no
authentication and no presence, deliberately. The signed-in clinician is
fixed as Dr Maya Shah of Riverside Practice, the GP named on the simulator's own appointment
records.

**Not built.** The scribe. Cairn is the clinical intelligence around a conversation, not the
thing that transcribes it. Fields in the record are typed by the clinician or promoted from a
proposal in the thread; in the product they would arrive from the conversation.

## The safety rules, enforced in code

| Rule | Where |
|---|---|
| Cairn never predicts. No score, percentage or forecast is ever shown for a patient. | `src/lib/domain/types.ts` has no field for one; `scripts/check-language.mjs` fails `npm run lint` on the banned words, in source and in the built pages |
| Every indicator is traceable to a record entry and a published tool | `Signal.evidence` and `Signal.basis` are required; the evidence chain on the patient screen |
| Cairn cannot sign. Signing needs a named clinician. | `sign()` in `src/lib/record/record.ts` refuses any signer whose name starts with "Cairn"; the refusal is shown inline and recorded in the audit |
| Nothing unsigned is shared | `viewFor()` returns nothing until the record is signed; audience tabs render nothing before |
| Every field carries provenance; a field without a source blocks signing | `RecordEntry` requires value, source, recordedBy, recordedAt; the readiness panel lists what is outstanding |
| The thread is not the record. Promotion never signs. | `promoteDecision` in `src/app/actions.ts` sets the field with the thread message as source and the accepting clinician as recorded-by, and asserts the record is still unsigned |
| Professionals and family never share a thread | Two channels; `checkFamilyContent()` in `src/lib/coordination/family-guard.ts` refuses ceilings of treatment and CPR content; nothing posts to the family channel unless a clinician writes or approves it |
| ReSPECT-shaped content is a recommendation, not a DNACPR form; an ADRT is referenced, never generated | Field descriptions and the ambulance view carry the line |
| A next step has one named owner and a date | `recordOutcome` and `addNextStep` refuse anything else; open steps appear on the worklist |

## Data

- `SIM_MODE=snapshot` (default): nothing touches the network. The whole app runs offline
  from `data/snapshot/`, which is committed.
- `SIM_MODE=live`: pulls the same bounded slice from the simulator, caches it for the
  process, and degrades to the snapshot on any failure with a quiet "using cached data"
  indicator in the header.
- `npm run snapshot -- --limit 2000` refreshes the snapshot. It pulls the directory for the
  first 2,000 patients, and the full GP and hospital record for those whose conditions match
  the catalogue or who have a hospital episode. `docs/API-NOTES.md` is the probe's record of
  the real API shape.
- The simulator API key lives in `.env.local` as `SIM_API_KEY`, server-side only. It is
  git-ignored and never reaches the browser. To verify after a build, search the served
  output: `grep -rl sim_ .next/static .next/server` should print nothing. Turbopack's local
  cache under `.next/cache` does hold the environment for change detection; it is
  git-ignored and never served.
- Offline check: `SIM_MODE=snapshot SIM_BASE_URL=http://127.0.0.1:9 npm start` serves every
  screen from the snapshot with the simulator address unreachable.

## The model seam

`SCORING_ENGINE=rules` (default) ships. `SCORING_ENGINE=model` wraps the rules engine and
posts to `MODEL_ENDPOINT` (default `/api/score`, which is a stub returning 501). A model may
reorder the worklist within a tier. It may never add a patient with no indicator, remove one
with indicators, or change a tier, and any influence is labelled as model-suggested and not
validated. The contract is in `docs/DOMAIN.md`.

## Design

The interface follows the Cairn Design System (`Cairn Design System.html` in the kit folder): Cairn
green as the accent, the stone scale for structure, Plus Jakarta Sans as the single typeface with
hierarchy from weight, white cards with 12px corners and warm shadows, pill status badges with a
dot, square signal chips. Light mode only, as the system specifies. Two deliberate departures, both
for clinical safety: the system's red left stripe for "no plan" is not used, because a red patient row
reads as an alarm about a person, so the worklist stripe encodes progress instead (amber in
progress, green signed or shared); and the critical red appears only on the signature refusal and
blocking validation.

## Where things are

```
docs/            CONTEXT, DESIGN, DOMAIN, COORDINATION, ARCHITECTURE, API-NOTES
reference/cairn/ the Python reference the TypeScript is ported from
scripts/         snapshot.ts, probe.mjs, check-language.mjs
data/snapshot/   the committed slice of the simulator
data/state/      coordination state, a JSON file behind src/lib/store
src/lib/         domain types, data adapter, scoring, record, coordination, store
src/app/         the five screens, server actions, the two API routes
```

Coordination state persists in `data/state/cases.json` and survives a restart. Two people
demonstrating on two laptops each have their own file; nothing is kept in the browser.
