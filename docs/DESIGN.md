# Cairn design brief

A starting point with real opinions, not a cage. Depart from it where you can argue the
departure improves the product, and say so when you do.

## The feeling

This is a tool about people who are dying, used by clinicians between other appointments.
It should feel calm, serious and warm. Three things it must never feel like: a consumer
analytics dashboard, a risk-scoring engine, or a marketing site for a startup.

The test: if a palliative care consultant glanced at the screen over someone's shoulder,
would it look like a clinical instrument made by people who had thought about the subject.

## What to avoid, specifically

These are the current default looks of AI-generated interfaces, and a judge who has seen
twenty demos today will have seen all of them:

- Purple or blue gradient hero, big centred headline, three feature cards
- Near-black background with one acid-green or violet accent
- Large vanity metrics in a row of identical rounded cards with coloured left borders
- Emoji as iconography or section markers
- Inter or Space Grotesk as the only typeface
- Everything on the same border radius and the same drop shadow

Also avoid, for reasons specific to this domain: red rows for clinically concerning
patients, progress bars or gauges of any kind, anything resembling a speedometer, and
countdown or urgency styling. A person is not an alert.

## Colour

Build it as CSS custom properties or Tailwind theme tokens, defined once, with light and
dark both designed rather than inverted.

| Role | Direction | Used for |
|---|---|---|
| Ground | Warm stone, off-white in light, warm near-black in dark. Not pure white, not pure black. | Page background |
| Surface | A half-step from the ground | Cards, panels, the record form |
| Ink | Warm near-black in light, warm off-white in dark | Body text |
| Muted | Ink at reduced contrast, still passing AA | Labels, metadata, timestamps |
| Primary | A calm slate blue, desaturated | Interactive elements, the evidence chain, focus |
| Affirm | A muted moss green | Signed, complete, shared |
| Refuse | A restrained clay red, low saturation | The signature refusal, blocking validation, missing provenance |

The refuse colour appears in exactly two places: the sign refusal and validation that
blocks an action. It never marks a patient. Clinical severity is carried by position in
the list, by type weight and by the review tier label, never by colour.

Pick the exact hex values yourself and keep them in one token block. A slightly warm
neutral reads as chosen; a pure grey reads as a default.

## Typography

Three roles, all from Google Fonts, all with a real fallback stack.

- **Display and patient voice.** A humanist serif. The patient's own words, the things
  they said matter to them, are the most important text in this product and should be set
  in the serif at a generous size. This is the one place where the design should feel
  almost literary. Candidates: Newsreader, Source Serif 4, Literata, Fraunces at low
  optical size.
- **Interface.** A clean, slightly technical sans for labels, navigation, buttons and
  dense data. Candidates: Public Sans, Söhne-like alternatives, IBM Plex Sans.
- **Data.** A mono for NHS numbers, indicator codes, timestamps and audit lines.
  Candidates: JetBrains Mono, IBM Plex Mono.

Geist is already wired into the repo. Replacing it is fine and probably right, but do it
deliberately and say why in the PR.

Rules: clinical prose gets line height around 1.6 and a measure near 65 characters.
Tabular numerals wherever digits align. Uppercase micro-labels get letter-spacing. Never
set the patient's words in the interface sans.

## Layout

- Dense but unhurried. A clinician is scanning, then reading carefully in one place.
- Worklist: a left rail of filters or a top filter bar, then rows. Rows are quiet. The
  tier label and the indicator count carry the emphasis.
- Patient: two columns on desktop, collapsing to one. Evidence on one side, guide on the
  other. The patient's name, age and conditions stay visible while scrolling.
- Record: single column, generous. This is a form someone completes while thinking about a
  difficult conversation, so it should feel unhurried and never crowded.

## The evidence chain, which is the signature interaction

This is the thing the judges must see working, so it gets the design attention.

An indicator row shows the indicator label and a quiet affordance. Activating it reveals
the record entry that fired it, the tool it is based on, and when it was recorded. It
should feel like opening a drawer: immediate, no network call, no spinner, content already
present in the DOM and revealed. Animate the height and opacity together over about 150ms,
and respect `prefers-reduced-motion` by making it instant.

Inside the revealed panel, the evidence string is the hero and the provenance is the
footnote. Set the evidence in the interface sans at normal size, and the basis and
timestamp in mono at small size.

Every expanded panel should make a clinician think: I can see exactly why this person is
on this list.

## The refusal, which is the other moment

When Cairn attempts to sign, the failure must be visible, legible and calm. Not a toast
that disappears, not a red banner shouting. A clear inline state next to the signature
block, in the refuse colour, with the reason in plain words: a record must be signed by a
named clinician. It should look like a considered design decision rather than an error,
because that is what it is.

Beside it, the clinician signature path should look ordinary and easy, so the contrast
carries the meaning.

## The audience views

Four tabs after signing. Each is a genuinely different document.

- **Ambulance.** Four lines, large type, high contrast, readable at arm's length in poor
  light. CPR recommendation first. The line that recommendations are not legally binding
  and clinical judgement applies. Nothing else.
- **Out-of-hours.** The clinical picture and the ceilings of treatment.
- **Hospice.** The full record.
- **Family.** What matters to the person, in the serif, at size. The place preferences.
  Who is involved. No clinical recommendations, no coded fields.

Making the ambulance view visibly different from the family view is worth more than any
other polish available this afternoon. It is the clearest possible demonstration that the
record is structured rather than a document.

## Motion

Sparing. The drawer, and a quiet transition when the worklist filters. Nothing on page
load, nothing decorative, no scroll-triggered reveals. A clinician opening this for the
fifteenth time today should never wait for an animation.

## Accessibility

Keyboard reachable end to end, including the evidence drawers and the audience tabs.
Visible focus states in the primary colour. Contrast that genuinely passes AA for body
text. `prefers-reduced-motion` honoured. Touch targets large enough for someone using a
tablet one-handed on a home visit.

## Empty and missing states

A clinician needs to know the difference between "no indicator" and "no data". Say which.
A missing field in the record shows as missing, with what is needed, never as a blank or a
plausible-looking default. This matters more here than in most products, because inventing
a value in a clinical record is the worst thing this interface could do.

## One risk worth taking

Take one real aesthetic risk and keep everything around it quiet. The strongest candidate
is the treatment of the patient's own words: set them large, in the serif, given room,
perhaps as the first thing on the patient screen above the clinical data. It would say,
visually, that this product puts the person before the record. That is exactly the claim
Cairn is making, and no other team's interface will look like it.
