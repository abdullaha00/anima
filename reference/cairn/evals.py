"""
Cairn's evals.

What is deliberately NOT measured: predictive accuracy. Cairn makes no prediction, so
reporting sensitivity against later deaths would imply a claim the tool does not make and
the underlying indicators do not support. If a judge asks for it, that refusal is the
answer, and it is a stronger one than a number.

What is measured, all of it demonstrable in the simulated data today:

  1. ATTRIBUTION      every flagged patient has at least one named indicator with the
                      record evidence that fired it. Target 100%. A flag with no
                      traceable reason is a defect.
  2. LANGUAGE         no output anywhere claims a prognosis, a probability or a risk
                      score. Automated, because it is easy to violate by accident when
                      four people are writing copy at speed.
  3. GOVERNANCE       no record can be signed by Cairn, shared unsigned, signed with an
                      unsourced clinical field, or altered after signature.
  4. COHORT           who Cairn surfaces, and how that composition compares with the
                      historical register pattern. Descriptive, not predictive.
  5. ROUND TRIP       a record survives serialisation and reload without losing fields.

    python -m cairn.evals
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any

from .casefind import sweep
from .guide import build, render_text
from .record import CairnRecord
from .signals import assess
from .sources import load_source

# Phrases that would turn an indicator prompt into a prognosis claim.
BANNED = [
    r"\bwill die\b", r"\bgoing to die\b", r"\bexpected to die\b",
    r"\bprobability of death\b", r"\brisk of death\b", r"\bmortality risk\b",
    r"\bpredict(s|ed|ion)? (death|mortality|survival)\b",
    r"\bprognosis (is|of)\b", r"\b\d+\s?% (chance|risk|probability)\b",
    r"\brisk score\b", r"\blikelihood of dying\b", r"\bmonths to live\b",
    r"\bterminal\b",
]
BANNED_RE = [re.compile(p, re.I) for p in BANNED]


def _scan(text: str, where: str) -> list[dict]:
    return [{"where": where, "phrase": m.group(0)}
            for r in BANNED_RE for m in [r.search(text)] if m]


def run(n: int = 5000, live: bool = False) -> dict[str, Any]:
    src = load_source(live=live, n=n)
    patients = list(src.iter_patients())
    result = sweep(patients)
    work = result["worklist"]
    report: dict[str, Any] = {}

    # 1. Attribution -------------------------------------------------------
    unattributed = [f["patient_id"] for f in work
                    if not f["signals"] or any(not s.get("evidence") for s in f["signals"])]
    report["attribution"] = {
        "flagged": len(work),
        "with_traceable_evidence": len(work) - len(unattributed),
        "rate": round((len(work) - len(unattributed)) / len(work), 4) if work else 1.0,
        "failures": unattributed[:10],
    }

    # 2. Language ----------------------------------------------------------
    violations: list[dict] = []
    by_id = {p["id"]: p for p in patients}
    for f in work[:200]:
        violations += _scan(json.dumps(f), f"worklist:{f['patient_id']}")
        g = build(by_id[f["patient_id"]], f)
        violations += _scan(render_text(g), f"guide:{f['patient_id']}")
    violations += _scan(json.dumps(result["equity"]), "equity summary")
    report["language"] = {
        "surfaces_checked": min(len(work), 200) * 2 + 1,
        "violations": len(violations),
        "examples": violations[:5],
    }

    # 3. Governance --------------------------------------------------------
    checks: list[tuple[str, bool]] = []
    r = CairnRecord(patient_id="TEST001")

    ready = r.request_signature()
    checks.append(("incomplete draft cannot be signed", ready["ready"] is False))

    for fld, val in [
        ("what_matters", "To stay at home with my dog"),
        ("clinical_summary", "Advanced COPD, MRC 4, two admissions this year"),
        ("preferences_for_care", "Priority on comfort, avoid admission where possible"),
        ("recommended_interventions", "Community nursing, rescue medication at home"),
        ("cpr_recommendation", "CPR not recommended, discussed and agreed"),
        ("capacity_assessment", "Has capacity for this decision"),
        ("people_involved", "Daughter present, community matron informed"),
    ]:
        r.set(fld, val, source="conversation 2026-09-12", recorded_by="Dr A Patel")

    try:
        r.sign("Dr A Patel")
        signed_before_request = True
    except PermissionError:
        signed_before_request = False
    checks.append(("cannot sign before the draft is submitted", signed_before_request is False))

    ready = r.request_signature()
    checks.append(("complete draft is ready for signature", ready["ready"] is True))

    try:
        r.share(["ambulance"])
        shared_unsigned = True
    except PermissionError:
        shared_unsigned = False
    checks.append(("unsigned record cannot be shared", shared_unsigned is False))

    try:
        r.sign("Cairn")
        cairn_signed = True
    except PermissionError:
        cairn_signed = False
    checks.append(("Cairn cannot sign a record", cairn_signed is False))

    r.sign("Dr A Patel")
    checks.append(("named clinician can sign", r.status == "signed"))

    try:
        r.set("cpr_recommendation", "changed", "x", "y")
        mutated = True
    except PermissionError:
        mutated = False
    checks.append(("signed record is immutable", mutated is False))

    r.share(["ambulance", "out_of_hours", "hospice"])
    amb = r.view_for("ambulance")
    checks.append(("ambulance view carries the CPR recommendation",
                   bool(amb.get("cpr_recommendation"))))
    checks.append(("ambulance view omits the personal narrative",
                   "concerns_and_fears" not in amb and "what_matters" not in amb))
    checks.append(("ambulance view states recommendations are not binding",
                   "not legally binding" in (amb.get("note") or "")))

    unsigned = CairnRecord(patient_id="TEST002")
    checks.append(("unsigned record discloses nothing",
                   "error" in unsigned.view_for("gp")))

    # Unsourced field blocks signature
    r2 = CairnRecord(patient_id="TEST003")
    for fld, val in [("what_matters", "a"), ("clinical_summary", "b"),
                     ("preferences_for_care", "c"), ("recommended_interventions", "d"),
                     ("cpr_recommendation", "e"), ("capacity_assessment", "f"),
                     ("people_involved", "g")]:
        r2.set(fld, val, source="conversation", recorded_by="Dr B")
    r2.clinical_summary.source = ""   # simulate a field arriving with no provenance
    checks.append(("unsourced clinical field blocks signature",
                   r2.request_signature()["ready"] is False))

    report["governance"] = {
        "checks": len(checks),
        "passed": sum(1 for _, ok in checks if ok),
        "failures": [name for name, ok in checks if not ok],
    }

    # 4. Cohort ------------------------------------------------------------
    report["cohort"] = result["funnel"] | {
        "non_cancer_share_of_cohort": result["equity"]["cairn_cohort_non_cancer_share"],
        "non_cancer_share_newly_identified": result["equity"]["newly_identified_non_cancer_share"],
        "flag_rate_by_imd_quintile": result["equity"]["flag_rate_by_imd_quintile"],
        "comparator": "Historically about 29% of people who died were on a palliative care "
                      "register, roughly 67% of cancer patients against 20% of non-cancer "
                      "(Harrison et al., BJGP 2012).",
    }

    # 5. Round trip --------------------------------------------------------
    again = CairnRecord.from_dict(json.loads(r.to_json()))
    report["round_trip"] = {
        "fields_preserved": all(
            (getattr(again, f) is None) == (getattr(r, f) is None)
            for f in CairnRecord.CLINICAL_FIELDS),
        "cpr_matches": (again.cpr_recommendation.value if again.cpr_recommendation else None)
                       == (r.cpr_recommendation.value if r.cpr_recommendation else None),
    }

    ok = (report["attribution"]["rate"] == 1.0
          and report["language"]["violations"] == 0
          and not report["governance"]["failures"]
          and report["round_trip"]["fields_preserved"]
          and report["round_trip"]["cpr_matches"])
    report["all_passed"] = ok
    return report


def main() -> int:
    live = "--live" in sys.argv
    rep = run(live=live)
    print(json.dumps(rep, indent=2))
    if not rep["all_passed"]:
        print("\nFAILURES ABOVE. Fix before demoing.", file=sys.stderr)
        return 1
    print("\nAll checks passed. Note what is not claimed: Cairn reports indicators, "
          "not prognosis, and these evals deliberately measure no predictive accuracy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
