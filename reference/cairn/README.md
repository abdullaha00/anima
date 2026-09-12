# Cairn

Advance care planning intelligence for an NHS neighbourhood. Three parts:

1. **Find** the people with recognised indicators of deteriorating health and no plan,
   across the whole population, with the record evidence behind every flag.
2. **Prepare** the clinician with a conversation guide built only from that record.
3. **Travel**: turn the conversation into a structured, signed, shareable record, and
   show each service only what it needs.

No dependencies beyond the Python standard library. Runs offline on synthetic fixtures,
or against NHS-SIM.

```bash
python -m cairn.demo            # the three-act demo on fixtures
python -m cairn.demo --live     # against NHS-SIM
python -m cairn.evals           # the eval suite
```

For NHS-SIM: `export NHS_SIM_URL=... NHS_SIM_TOKEN=...`, then adapt
`NHSSimSource._normalise` in `cairn/sources.py`. That method is the only place that
should need changing. Anything you cannot map simply means that indicator never fires,
so Cairn under-identifies rather than inventing evidence.

## What Cairn claims, and what it does not

Cairn reports which recognised indicators are present in a record, and prompts a
clinician to consider a conversation. It produces no probability, no risk score and no
prognosis for any individual.

This is deliberate. The indicators are shaped after SPICT and GSF Prognostic Indicator
Guidance, which are review prompts rather than validated individual-level predictors, and
the Surprise Question underlying that tradition has a pooled positive predictive value of
about 0.40 (Gupta et al., 2024). Roughly four in ten people flagged by such a question die
in the window studied.

That is acceptable here precisely because the intervention is a conversation. A false
positive costs a clinician ten minutes and offers a patient a conversation they were
arguably owed. A false negative means someone dies without a plan, in the wrong place.
Cairn is built around that asymmetry, and `cairn/evals.py` deliberately measures no
predictive accuracy, because reporting one would imply a claim the tool does not make.

## Governance, enforced in code

- No record is signed by Cairn. `sign()` refuses any signer whose name begins with Cairn.
- No record is shared before a named clinician signs it.
- Every clinical field carries provenance; a field without a source blocks signature.
- A signed record is immutable. Changes create a new version.
- ReSPECT-shaped recommendations are recorded as recommendations. They are not legally
  binding, they are not a DNACPR form, and an ADRT is referenced rather than generated.

## Evals

| Check | What it means |
|---|---|
| Attribution | Every flagged patient has a named indicator and the record entry that fired it. Target 100%. |
| Language | No output claims a prognosis, probability or risk score. Automated, because it is easy to break by accident at speed. |
| Governance | Twelve checks on signing, sharing, provenance and immutability. |
| Cohort | Who Cairn surfaces, including the non-cancer share, against the historical register pattern. |
| Round trip | A record survives serialisation without losing fields. |

The comparator worth knowing: historically only about 29% of people who died were on
their practice palliative care register before death, roughly 67% of cancer patients
against 20% of those with non-cancer conditions (Harrison et al., BJGP 2012). The
non-cancer gap is the one Cairn is aimed at.

## Files

```
cairn/signals.py    the indicator catalogue, with evidence functions and review tiers
cairn/casefind.py   the population sweep and the cohort composition report
cairn/record.py     the ACP record, its state machine and the per-audience views
cairn/guide.py      the conversation guide, template-driven, invents nothing
cairn/sources.py    FixtureSource and NHSSimSource behind one interface
cairn/evals.py      the eval suite
cairn/demo.py       the three-act demo
```
