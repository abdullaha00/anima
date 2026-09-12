# Cairn frontend architecture (internal contract)

Read this before touching `src/`. It is the agreement between the people and agents
building in parallel. `src/lib/domain/types.ts` is the type contract and wins over prose.

## Layout of `src/`

```
src/lib/domain/types.ts              the whole type contract (do not add types elsewhere)
src/lib/copy.ts                      shared UI copy: the quiet line, disclaimers, labels
src/lib/format.ts                    date, age and id formatting helpers

src/lib/data/sim-client.ts           server-only fetch to the simulator, key from process.env
src/lib/data/normalise.ts            THE ADAPTER: raw simulator payloads -> Patient
src/lib/data/snapshot.ts             read data/snapshot/*.json (patients, meta)
src/lib/data/source.ts               getPatients()/getPatient(id): snapshot | live with cache + degrade

src/lib/scoring/catalogue.ts         INDICATORS table + TIER rules, editable by a doctor
src/lib/scoring/rules.ts             rulesEngine: SignalEngine
src/lib/scoring/model.ts             modelEngine(rules, opts): SignalEngine, /api/score, falls back
src/lib/scoring/index.ts             SignalEngine interface, getEngine() from SCORING_ENGINE
src/lib/scoring/sweep.ts             sweep(patients, cases) -> SweepResult (funnel, equity, rows)

src/lib/record/record.ts             CairnRecord port: newRecord, setField, readiness, sign, share, viewFor
src/lib/record/audiences.ts          AUDIENCE_FIELDS allowlist table + notes
src/lib/record/fields.ts             RECORD_FIELDS: label, description, required, order

src/lib/coordination/team.ts         deriveTeam(patient, assessment) -> Participant[] with reasons
src/lib/coordination/roster.ts       fictional staff roster (simulated colleagues), organisations
src/lib/coordination/family-guard.ts checkFamilyContent(body) -> { ok, reason? }
src/lib/coordination/state.ts        worklist transitions: canTransition, transition
src/lib/coordination/fixtures.ts     scripted simulated replies per trigger

src/lib/store/index.ts               getCase, listCases, updateCase, seeded; JSON under data/state/

src/app/actions.ts                   'use server' actions for every mutation (call store + lib)
src/app/api/score/route.ts           POST 501 stub with a clear message
src/app/api/patients/route.ts        GET worklist sweep JSON (browser -> our route -> source)
src/app/api/patients/[id]/route.ts   GET one patient + assessment

src/app/page.tsx                                  1. worklist
src/app/patient/[id]/page.tsx                     2. patient + evidence chain
src/app/patient/[id]/team/page.tsx                3. care team
src/app/patient/[id]/thread/page.tsx              4. coordination thread
src/app/patient/[id]/outcome/page.tsx             5a. outcome, next steps, promotion
src/app/patient/[id]/record/page.tsx              5b. record, readiness, sign gate, audience views, audit

src/components/ui/*                  shared primitives (Button, Tier, StateBadge, Drawer, ProvenanceLine, Field)
src/components/shell/*               Shell, PatientStrip (name, age, conditions, nav across the five screens)
src/components/worklist/*, patient/*, team/*, thread/*, outcome/*, record/*
```

## Data flow

Browser -> Next route handlers or server components -> `source.ts` -> snapshot on disk or the
simulator. The API key only ever exists in `sim-client.ts` via `process.env.SIM_API_KEY`.

`SIM_MODE=snapshot` (default): nothing touches the network. `SIM_MODE=live`: in-memory cache
per process; any non-200 or timeout degrades to the snapshot and sets `source.degraded = true`
so the Shell shows "using cached data".

## Server components and actions

Pages are server components that read the store and the source directly. Mutations go through
server actions in `src/app/actions.ts` and call `revalidatePath`. Small client components
handle the drawer, tabs, forms. No client-side data fetching for the demo path.

The signed-in clinician is a fixed identity for the demo: `CLINICIAN = { id: 'p-gp', name: 'Dr Maya Shah', role: 'usual gp', organisation: 'Riverside Practice' }` in `src/lib/copy.ts`.
Dr Maya Shah is the GP named on the simulator's own appointment records.

## Design tokens

Defined once in `src/app/globals.css` as CSS custom properties, exposed to Tailwind v4 via
`@theme inline`. Use only these classes for colour: `bg-ground bg-surface bg-surface-2
text-ink text-muted border-line text-primary bg-primary text-primary-ink bg-primary-soft
text-affirm bg-affirm-soft text-refuse bg-refuse-soft border-refuse`. Fonts: `font-serif`
(Newsreader) for headings and the patient's words, `font-sans` (Public Sans) for interface,
`font-mono` (IBM Plex Mono) for ids, codes, timestamps. `tabular-nums` where digits align.

Refuse colour appears only on the signature refusal and blocking validation. Never on a patient.

## Copy rules (enforced by scripts/check-language.mjs)

Never: dying, predicts, risk of death, probability, prognosis, terminal, risk score, chat,
messaging, inbox, ping, notification, "the algorithm decided", any percentage attached to a
person. Always: "indicators present in the record", "prompt for clinical review", "no plan
recorded", "draft, awaiting clinician signature", "coordination thread", "participants",
"recipient of the signed record", "recommendations, not legally binding".
