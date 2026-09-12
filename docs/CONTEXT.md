# Cairn: context for anyone, human or agent, joining this build

Read this before `PROMPT.md`. It explains why the rules in that brief exist. An agent that
understands the reasoning makes better decisions at the edges than one following a list.

## The event

The OpenAI x Anima Health AI Healthcare Hackathon, Saturday 12 September 2026, Fora York
House, King's Cross. Building starts around 09:00, submissions close at 18:00. Prizes are
judged on three things:

- **NHS relevance and impact**
- **Quality of the working product**
- **Originality**

The organisers stated their thesis in the event listing, and it is the best available
guide to what scores:

> "Healthcare's hardest problems are often not caused by missing science. The people,
> information and decisions already exist, but the systems connecting them are fragmented,
> manual, or slow."

They are describing an orchestration problem. Cairn is aimed squarely at it: the
information that someone is deteriorating is already in the record, and the system that
should connect it to a conversation and then to an ambulance crew at 3am does not exist.

Anima builds total triage, care navigation and an AI scribe for over 1,000 GP practices,
so the room has seen a great many triage demos. Advance care planning is genuinely
differentiated. There are clinicians and senior NHS people judging.

## The team

Two doctors and two developers. The doctors own clinical content: the indicator
thresholds, the conversation prompts, the record wording. The developers own the
pipeline and the interface. If an agent is unsure whether a clinical threshold is right,
the answer is to flag it for a doctor rather than to guess.

## What Cairn is

A clinician-facing advance care planning system for a simulated NHS neighbourhood of about
50,000 patients. Four parts:

1. **Find** people whose records carry recognised indicators of deteriorating health and
   who have no plan, across the whole population.
2. **Convene** the people who need to be in the decision, each with a reason traced to the
   record, and coordinate them in a thread attached to that patient.
3. **Decide**: capture what the meeting concluded as decisions and next steps with named
   owners and dates.
4. **Travel**: promote those decisions into a structured record a clinician signs, which
   then reaches the GP, out-of-hours, the ambulance service, the hospice and the family,
   each seeing only what they need.

The coordination half is where the originality sits. Case-finding is a sweep over a
database. Convening six people across three organisations around one person's death, and
leaving a record that survives, is the thing nobody has built, and it is the fragmentation
the organisers named.

We are explicitly **not** building the scribe. Cairn is the clinical intelligence around
it. Saying that plainly makes the rest of the claim more credible.

## How this maps to the NHS 10 Year Health Plan

The Plan's three shifts, and where Cairn sits in each:

- **Hospital to community.** Cairn's whole purpose is enabling care and dying in the
  community instead of an unplanned admission.
- **Analogue to digital.** The record that travels is the Single Patient Record idea
  applied to the one moment where fragmentation is least forgivable.
- **Sickness to prevention.** Case-finding is proactive. The Plan commits to 95% of people
  with complex needs having an agreed care plan by 2027, against about 20% of people with
  a long-term condition having one today.

## The evidence base, with sources

Use these numbers. Do not invent others.

| Figure | Meaning | Source |
|---|---|---|
| 29% | of people who died were on their practice palliative care register before death | Harrison N et al., BJGP 2012;62(598):e344 |
| 67% vs 20% | register identification, cancer against non-cancer conditions | same |
| median 10 weeks | time on the register before death, range 2 days to 4 years | same |
| PPV 0.40 | pooled positive predictive value of the Surprise Question | Gupta A et al., systematic review and meta-analysis, 2024 |
| NPV 0.89 | its negative predictive value | same |
| sens 0.69, spec 0.69 | its sensitivity and specificity | same |

The register study is from 2012, so say "historically" when quoting it.

## Why the safety rules exist

This is the part that matters most, and the part an agent will otherwise get wrong.

**Cairn must never predict.** SPICT and the GSF Prognostic Indicator Guidance are review
prompts, not validated individual-level predictors. The Surprise Question they descend from
has a pooled PPV of about 0.40, meaning roughly four in ten people flagged die in the
window studied. Any interface that renders a score, a percentage or a phrase like "likely
to die within 12 months" is making a claim the underlying evidence does not support, and a
palliative care clinician will identify that within seconds.

**The asymmetry is the safety argument.** The intervention here is a conversation, not a
treatment decision. A false positive costs a clinician ten minutes and offers a patient a
conversation they were arguably owed. A false negative means someone dies in the wrong
place with nobody knowing what they wanted. A modest-PPV screen is appropriate for the
first and would not be appropriate for the second. The product is built around that
asymmetry, so the interface must never imply a precision the tool does not have.

**Accountability sits with a named clinician.** ReSPECT produces clinician-completed
recommendations, made with the person or their representative. They are not legally
binding and are not a DNACPR form. An ADRT is a separate, legally binding document, which
Cairn references and never generates. A system that appeared to issue a completed record
by itself would be wrong in a way no amount of interface polish could fix. Hence: Cairn
cannot sign, nothing unsigned is shared, and every field carries its source.

**Equity is the impact story.** The register historically missed four in five people with
non-cancer conditions. If Cairn's cohort is less skewed towards cancer than the register
beside it, that is a measurable claim, and it should be reported from the data even when
it is unflattering. Deprivation is also worth reporting: the inverse care law is named in
the Plan.

## The state of the data

From our own `DATA.md`, verified against the simulator:

- About 50,000 synthetic patients at `https://sim.animahealth.com`.
- Useful endpoints: `/api/sites/{site}/patients`, `/api/nhs/pds`,
  `/api/sites/hospital/attendances`, `/api/nhs/eps`, `/api/clock`.
- Several full site-view endpoints have returned 502.
- **There are no mortality or palliative care outcome labels.**

That last point drives an architectural decision. With no ground truth, a supervised model
cannot be validated today, so the rules-based path is what ships and any model is an
enhancer that reorders a list. This is not a limitation to hide; it is a reason the
rules-first design is correct, and it should be said out loud in the pitch.

## Language rules

The interface is part of the clinical claim, so the copy is not decoration.

**Never write:** dying, predicts, risk of death, probability, prognosis, terminal, risk
score, any percentage attached to a person, "the algorithm decided", "automatically
generates a ReSPECT form".

**Write instead:** "indicators present in the record", "prompt for clinical review",
"makes no prediction about this patient", "no plan recorded", "draft, awaiting clinician
signature", "recorded by ... on ... from ...", "recommendations, not legally binding".

There is an automated check for this in the Python reference. It has already caught a real
mistake, where a disclaimer reading "makes no claim that these patients will die"
contained a forbidden phrase. Port it to the frontend.

## What exists already

- `reference/cairn/` in this kit: a working Python implementation of the indicator
  catalogue, the population sweep, the record with its governance rules, the conversation
  guide and the eval suite. It is the source of truth for behaviour. The frontend ports
  the logic to TypeScript rather than calling it.
- The repo at `github.com/abdullaha00/anima`: Next.js App Router, TypeScript, Tailwind,
  ESLint, npm, Node 20.9+. `src/app/page.tsx` is still close to the default template.
  `DATA.md`, `DEVELOPMENT.md` and `state.md` carry our own notes and conventions.
- Work happens on branches, with push access.

## The demo we are building towards

Ninety seconds, four beats, two moments that a judge repeats to the other judges.

1. **The worklist**, with state: how many carry indicators and no plan, and how many are
   waiting on somebody.
2. **The patient**, then **moment one**: open a flag to show the evidence chain, and say
   that Cairn makes no prediction, it reports what is already in the record.
3. **The team**, proposed with a reason under every name. This is the clearest expression
   of the organisers' thesis: the people already exist and nothing connects them.
4. **The thread, the outcome, the record**: a proposal, agreement, a decision promoted into
   the record, then **moment two**, where Cairn attempts to sign and is refused, a
   clinician signs, and the record renders differently for the ambulance crew and the
   family. Next steps appear back on the worklist with owners and dates.

The interface exists to make those two moments land. Every design decision should be
judged against that.
