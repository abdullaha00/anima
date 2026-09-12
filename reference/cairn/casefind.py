"""
Population case-finding, and the equity comparison that is your best slide.

The funnel is deliberate. Plain Python reads every patient and applies explicit
indicators, so the shortlist is small, cheap and fully explainable before any model is
involved. Every flag can be traced to the record entry that caused it.

The comparison that matters: the existing palliative care register historically captured
about 29% of people who died, roughly 67% of cancer patients against 20% of those with
non-cancer conditions (Harrison et al., BJGP 2012). If Cairn's cohort is less skewed
towards cancer than the register it sits beside, that is a measurable equity claim.
Report it from the data, and report it even when it is unflattering.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Iterable

from .signals import assess

TIER_ORDER = {"review this week": 0, "review this month": 1,
              "consider at next contact": 2, "no prompt": 3}

CANCER_TERMS = ("cancer", "carcinoma", "metastatic", "lymphoma", "leukaemia", "myeloma")


def _is_cancer(patient: dict) -> bool:
    cs = " ".join(patient.get("conditions", [])).lower()
    return any(t in cs for t in CANCER_TERMS)


def sweep(patients: Iterable[dict]) -> dict[str, Any]:
    scanned = 0
    flagged: list[dict] = []
    register_members = 0
    by_tier: Counter = Counter()
    imd_flagged: Counter = Counter()
    imd_population: Counter = Counter()

    for p in patients:
        scanned += 1
        if p.get("palliative_register"):
            register_members += 1
        imd = p.get("imd_quintile")
        if imd:
            imd_population[imd] += 1

        a = assess(p)
        by_tier[a["tier"]] += 1
        if a["tier"] == "no prompt":
            continue

        a["is_cancer"] = _is_cancer(p)
        a["age"] = p.get("age")
        a["imd_quintile"] = imd
        a["conditions"] = p.get("conditions", [])
        a["new_to_review"] = not p.get("palliative_register") and not p.get("acp_record")
        flagged.append(a)
        if imd:
            imd_flagged[imd] += 1

    flagged.sort(key=lambda f: (TIER_ORDER[f["tier"]], -f["signal_count"]))

    cohort_cancer = sum(1 for f in flagged if f["is_cancer"])
    new_cases = [f for f in flagged if f["new_to_review"]]
    new_cancer = sum(1 for f in new_cases if f["is_cancer"])

    return {
        "funnel": {
            "patients_scanned": scanned,
            "already_on_register": register_members,
            "indicators_present": len(flagged),
            "not_on_register_or_plan": len(new_cases),
            "review_this_week": by_tier["review this week"],
            "prompted_for_review": by_tier["review this week"] + by_tier["review this month"],
        },
        "by_tier": dict(by_tier),
        "equity": {
            # Share of the identified cohort that is non-cancer. The historical register
            # comparator is roughly 2 in 3 cancer, so a lower cancer share here is the claim.
            "cairn_cohort_cancer_share": round(cohort_cancer / len(flagged), 3) if flagged else None,
            "cairn_cohort_non_cancer_share": round(1 - cohort_cancer / len(flagged), 3) if flagged else None,
            "newly_identified_non_cancer_share": round(1 - new_cancer / len(new_cases), 3) if new_cases else None,
            "flag_rate_by_imd_quintile": {
                q: round(imd_flagged[q] / imd_population[q], 3)
                for q in sorted(imd_population) if imd_population[q]
            },
            "note": "Descriptive only. Cairn reports indicators present in the record and "
                    "makes no prognostic claim about any patient, nor any claim of "
                    "predictive validity.",
        },
        "worklist": flagged,
    }


def print_report(result: dict) -> None:
    f = result["funnel"]
    e = result["equity"]
    print(f"Scanned {f['patients_scanned']:,} patients")
    print(f"  {f['already_on_register']} already on the palliative care register")
    print(f"  {f['indicators_present']} with any recognised indicator present "
          f"(the watchlist)")
    print(f"  {f['not_on_register_or_plan']} of those have neither a register entry nor a plan")
    print(f"  {f['prompted_for_review']} prompted for review "
          f"({f['prompted_for_review'] / f['patients_scanned']:.1%} of the list), "
          f"of which {f['review_this_week']} this week\n")

    print("Review tiers")
    for tier in ("review this week", "review this month", "consider at next contact"):
        print(f"  {result['by_tier'].get(tier, 0):>5}  {tier}")

    print("\nCohort composition")
    if e["cairn_cohort_non_cancer_share"] is not None:
        print(f"  {e['cairn_cohort_non_cancer_share']:.0%} of the identified cohort is non-cancer")
        print(f"  {e['newly_identified_non_cancer_share']:.0%} of newly identified patients are non-cancer")
        print("  Historical register comparator: about 1 in 3 of those identified were non-cancer")
    print("\n  Flag rate by IMD quintile (1 = most deprived)")
    for q, rate in e["flag_rate_by_imd_quintile"].items():
        print(f"    Q{q}: {rate:.1%}")

    print("\nTop of the worklist")
    for item in result["worklist"][:5]:
        print(f"  [{item['tier']}] {item['patient_id']}, {item['age']}y, "
              f"{item['signal_count']} indicators")
        for s in item["signals"][:3]:
            print(f"      {s['label']}  ({s['evidence']})")
