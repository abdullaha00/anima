"""
The three-act demo, runnable from one command.

    python -m cairn.demo              # offline fixtures
    python -m cairn.demo --live       # against NHS-SIM
    python -m cairn.demo --patient NHS001234

Act 1  find      who has indicators and no plan, across the whole population
Act 2  prepare   the conversation guide for one of them, every prompt traceable
Act 3  travel    the record drafted, signed by a clinician, and what each service sees
"""

from __future__ import annotations

import argparse
import json

from .casefind import print_report, sweep
from .guide import build, render_text
from .record import CairnRecord
from .sources import load_source


def rule(title: str) -> None:
    print(f"\n{'=' * 70}\n{title}\n{'=' * 70}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="use NHS-SIM instead of fixtures")
    ap.add_argument("-n", type=int, default=5000, help="fixture population size")
    ap.add_argument("--patient", help="patient id for acts 2 and 3")
    ap.add_argument("--json", action="store_true", help="dump the record as JSON at the end")
    args = ap.parse_args()

    patients = list(load_source(live=args.live, n=args.n).iter_patients())
    if not args.live:
        print("NOTE: synthetic fixture population. Every number below is illustrative of "
              "the pipeline\n      and says nothing about real epidemiology. Re-run with "
              "--live against NHS-SIM\n      before quoting any figure.")
    by_id = {p["id"]: p for p in patients}

    rule("ACT 1  Find the people with no plan")
    result = sweep(patients)
    print_report(result)

    # Pick a demo patient: highest tier, not on the register, non-cancer if possible,
    # because the non-cancer case is the one the current system misses.
    candidates = [f for f in result["worklist"] if f["new_to_review"]]
    non_cancer = [f for f in candidates if not f["is_cancer"]]
    pool = non_cancer or candidates or result["worklist"]
    chosen = next((f for f in pool if f["patient_id"] == args.patient), pool[0])
    patient = by_id[chosen["patient_id"]]

    rule(f"ACT 2  Prepare the conversation  |  {patient['id']}")
    guide = build(patient, chosen)
    print(render_text(guide))

    rule("ACT 3  The record that travels")
    rec = CairnRecord(patient_id=patient["id"])
    conv = "conversation 2026-09-12, home visit"
    clinician = "Dr A Patel"

    # In the product these come from the clinician's conversation, via the scribe.
    # Here they are illustrative placeholders, and the demo says so on screen.
    print("(The content below is illustrative. In the product it comes from the "
          "clinician's\n conversation, and every field carries its source.)\n")
    rec.set("what_matters", "To stay at home. To be comfortable, and to avoid another hospital admission if it can be managed.",
            source=conv, recorded_by=clinician)
    rec.set("concerns_and_fears", "Being breathless and alone at night.",
            source=conv, recorded_by=clinician)
    rec.set("clinical_summary",
            f"{patient['age']}y with {', '.join(patient['conditions']) or 'no coded conditions'}. "
            f"{len(chosen['signals'])} deterioration indicators present.",
            source="record: problem list and activity", recorded_by=clinician)
    rec.set("preferences_for_care", "Priority on comfort. Avoid admission where symptoms "
            "can be managed at home.", source=conv, recorded_by=clinician)
    rec.set("recommended_interventions", "Community nursing, anticipatory medicines at home, "
            "out-of-hours aware.", source=conv, recorded_by=clinician)
    rec.set("not_recommended", "Not for critical care admission or intubation.",
            source=conv, recorded_by=clinician)
    rec.set("cpr_recommendation", "CPR not recommended. Discussed and understood.",
            source=conv, recorded_by=clinician)
    rec.set("preferred_place_of_care", "Home", source=conv, recorded_by=clinician)
    rec.set("preferred_place_of_death", "Home", source=conv, recorded_by=clinician)
    rec.set("capacity_assessment", "Has capacity for these decisions.",
            source=conv, recorded_by=clinician)
    rec.set("people_involved", "Next of kin present at the conversation. GP and community matron informed.",
            source=conv, recorded_by=clinician)

    ready = rec.request_signature()
    print(f"Draft complete: {ready['ready']}   outstanding: {ready['missing'] or 'none'}")

    try:
        rec.sign("Cairn")
    except PermissionError as e:
        print(f"Cairn attempts to sign  ->  refused: {e}")

    rec.sign(clinician)
    print(f"Signed by {rec.signed_by}")
    rec.share(["gp", "out_of_hours", "ambulance", "hospice", "family"])
    print(f"Shared with: {', '.join(rec.shared_with)}\n")

    for audience in ("ambulance", "family", "out_of_hours"):
        print(f"--- what {audience.replace('_', ' ')} sees " + "-" * 28)
        for k, v in rec.view_for(audience).items():
            if v and k not in ("patient_id", "status"):
                print(f"  {k}: {v}")
        print()

    print("Audit trail")
    for line in rec.audit:
        print("  " + line)

    if args.json:
        print("\n" + rec.to_json())


if __name__ == "__main__":
    main()
