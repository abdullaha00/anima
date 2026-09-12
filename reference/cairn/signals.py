"""
Case-finding signals.

Design rule, and it is the whole safety argument: this module never produces a
probability, a risk score or a prognosis. It reports which recognised indicators are
present in a patient's record, with the evidence for each one, and leaves the judgement
to a clinician.

The indicators are shaped after SPICT and the GSF Prognostic Indicator Guidance. They are
prompts for clinical review. They are not validated individual-level predictors, and the
Surprise Question they descend from has a pooled positive predictive value of about 0.40
(Gupta et al., 2024). Cairn is built so that number cannot be misread as a claim.

Each signal carries:
  id        stable code, so a flag can be audited months later
  label     what a clinician sees
  family    general deterioration, disease-specific, or service-use
  basis     which published tool this indicator is shaped after
  evidence  a function producing the specific record entry that fired it
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

Patient = dict[str, Any]


@dataclass(frozen=True)
class Signal:
    id: str
    label: str
    family: str
    basis: str
    test: Callable[[Patient], bool]
    evidence: Callable[[Patient], str]


def _has(p: Patient, *codes: str) -> bool:
    cs = {c.lower() for c in p.get("conditions", [])}
    return any(any(code in c for c in cs) for code in codes)


def _admissions(p: Patient, months: int = 12) -> list[dict]:
    return [a for a in p.get("admissions", []) if a.get("months_ago", 99) <= months
            and a.get("emergency", True)]


# --- General indicators of deteriorating health (SPICT-style) -----------------

GENERAL = [
    Signal(
        "GEN_ADMISSIONS", "Two or more unplanned admissions in the past year",
        "service-use", "SPICT general indicator",
        lambda p: len(_admissions(p)) >= 2,
        lambda p: f"{len(_admissions(p))} emergency admissions in 12 months "
                  f"(most recent {min(a['months_ago'] for a in _admissions(p))} months ago)",
    ),
    Signal(
        "GEN_FRAILTY", "Moderate to severe frailty",
        "general", "Clinical Frailty Scale / electronic frailty index",
        lambda p: (p.get("frailty_cfs") or 0) >= 6,
        lambda p: f"Clinical Frailty Scale {p.get('frailty_cfs')} recorded "
                  f"{p.get('frailty_recorded_months_ago', '?')} months ago",
    ),
    Signal(
        "GEN_WEIGHT", "Progressive weight loss or low BMI",
        "general", "SPICT general indicator",
        lambda p: bool(p.get("weight_loss_pct")) and p["weight_loss_pct"] >= 10,
        lambda p: f"{p['weight_loss_pct']}% weight loss over the past 6 months",
    ),
    Signal(
        "GEN_CARE_NEEDS", "New or increased care needs",
        "general", "SPICT general indicator",
        lambda p: bool(p.get("care_package_increase")),
        lambda p: f"Care package increased {p.get('care_package_increase')} months ago",
    ),
    Signal(
        "GEN_PERFORMANCE", "Poor performance status, largely dependent",
        "general", "SPICT general indicator",
        lambda p: (p.get("performance_status") or 0) >= 3,
        lambda p: f"Performance status {p.get('performance_status')} recorded",
    ),
]

# --- Disease-specific indicators ---------------------------------------------

DISEASE = [
    Signal(
        "DIS_CANCER", "Advanced or metastatic cancer with declining function",
        "disease-specific", "SPICT cancer indicator",
        lambda p: _has(p, "metastatic", "advanced cancer") and (p.get("performance_status") or 0) >= 2,
        lambda p: "Advanced or metastatic cancer recorded with reduced performance status",
    ),
    Signal(
        "DIS_HEART", "Heart failure with symptoms at rest or on minimal exertion",
        "disease-specific", "SPICT heart and vascular indicator",
        lambda p: _has(p, "heart failure") and (p.get("nyha") or 0) >= 3,
        lambda p: f"Heart failure, NYHA class {p.get('nyha')}",
    ),
    Signal(
        "DIS_RESP", "Severe chronic lung disease with breathlessness at rest",
        "disease-specific", "SPICT respiratory indicator",
        lambda p: _has(p, "copd", "pulmonary fibrosis") and
                  (p.get("mrc_dyspnoea") or 0) >= 4,
        lambda p: f"Chronic lung disease, MRC dyspnoea grade {p.get('mrc_dyspnoea')}",
    ),
    Signal(
        "DIS_NEURO", "Progressive neurological disease with declining function",
        "disease-specific", "SPICT neurological indicator",
        lambda p: _has(p, "motor neurone", "parkinson", "multiple sclerosis", "dementia"),
        lambda p: "Progressive neurological condition on the problem list",
    ),
    Signal(
        "DIS_RENAL", "Advanced kidney disease, stage 4 or 5, deteriorating",
        "disease-specific", "SPICT kidney indicator",
        lambda p: _has(p, "ckd stage 4", "ckd stage 5", "esrf"),
        lambda p: "Advanced chronic kidney disease recorded",
    ),
    Signal(
        "DIS_LIVER", "Advanced liver disease with complications",
        "disease-specific", "SPICT liver indicator",
        lambda p: _has(p, "cirrhosis", "liver failure"),
        lambda p: "Advanced liver disease recorded",
    ),
]

ALL_SIGNALS = GENERAL + DISEASE


def signals_for(patient: Patient) -> list[dict]:
    """Every indicator present in this record, with its evidence. No score, ever."""
    out = []
    for s in ALL_SIGNALS:
        try:
            if s.test(patient):
                out.append({
                    "id": s.id, "label": s.label, "family": s.family,
                    "basis": s.basis, "evidence": s.evidence(patient),
                })
        except Exception:
            continue  # a missing field means the indicator simply does not fire
    return out


# Review tiers. These describe how strongly the record prompts a review, and they
# deliberately carry no numbers. A tier is a queue position for a clinician.
#
# Service use alone never prompts an end-of-life conversation. Two admissions in a year
# describes a great many people who are not approaching the end of life, so admissions
# count only alongside a clinical indicator. Erring towards a smaller, better-founded
# list is the right trade here: a bloated list gets ignored, and an ignored list helps
# nobody.
def tier_for(sigs: list[dict]) -> str:
    disease = sum(1 for s in sigs if s["family"] == "disease-specific")
    clinical = sum(1 for s in sigs if s["family"] == "general")
    service = sum(1 for s in sigs if s["family"] == "service-use")

    if disease and (clinical + service) >= 2:
        return "review this week"
    if (disease and (clinical + service) >= 1) or clinical >= 2:
        return "review this month"
    if disease or clinical >= 1:
        return "consider at next contact"
    return "no prompt"


def assess(patient: Patient) -> dict:
    sigs = signals_for(patient)
    tier = tier_for(sigs)
    return {
        "patient_id": patient.get("id"),
        "signals": sigs,
        "signal_count": len(sigs),
        "tier": tier,
        "already_on_register": bool(patient.get("palliative_register")),
        "has_acp": bool(patient.get("acp_record")),
        # Said plainly, in the payload, so it reaches any surface that renders it.
        "interpretation": "Indicators present in the record. This is a prompt for "
                          "clinical review, not a prediction about this patient.",
    }
