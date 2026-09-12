"""
The conversation guide.

Deliberately thin and template-driven. It arranges what is already in the record into the
order a good ACP conversation tends to follow, and it invents nothing. Every prompt is
either a standard opening or a line tied to a specific record entry, shown alongside it,
so the clinician can see why they are being asked to raise something.

Keep it this way under time pressure. A guide that quietly generates clinical content is
the fastest way to lose a clinical judge's trust.
"""

from __future__ import annotations

from typing import Any

OPENINGS = [
    ("Permission", "Would it be alright if we talked about what matters to you if things "
                   "change with your health?"),
    ("Understanding", "What is your understanding of where things are with your health "
                      "at the moment?"),
    ("Information", "Some people want to know what might lie ahead, and some would rather "
                    "not. Where do you sit?"),
]

CLOSINGS = [
    ("What matters", "If time were shorter, what would matter most to you?"),
    ("Worries", "Is there anything you are particularly worried about?"),
    ("Place", "If you became more unwell, where would you want to be cared for?"),
    ("People", "Who should be involved in decisions, and who should we contact?"),
    ("Capacity and representation", "Is there a lasting power of attorney for health and "
                                    "welfare, or an advance decision already in place?"),
]


def build(patient: dict, assessment: dict) -> dict[str, Any]:
    """Returns a structured guide. Each clinical prompt names the record entry behind it."""
    sigs = assessment.get("signals", [])

    specifics = []
    for s in sigs:
        prompt = SIGNAL_PROMPTS.get(s["id"])
        if prompt:
            specifics.append({
                "prompt": prompt,
                "because": s["evidence"],
                "indicator": s["label"],
                "basis": s["basis"],
            })

    return {
        "patient_id": patient.get("id"),
        "header": {
            "age": patient.get("age"),
            "conditions": patient.get("conditions", []),
            "indicators_present": len(sigs),
            "tier": assessment.get("tier"),
            "already_on_register": assessment.get("already_on_register"),
        },
        "why_now": [
            {"indicator": s["label"], "evidence": s["evidence"], "basis": s["basis"]}
            for s in sigs
        ],
        "opening": [{"stage": a, "prompt": b} for a, b in OPENINGS],
        "specific_to_this_patient": specifics,
        "closing": [{"stage": a, "prompt": b} for a, b in CLOSINGS],
        "record_after": [
            "What matters to the person, in their words",
            "Preferences for care, and any ceilings of treatment",
            "CPR recommendation, with the reasoning",
            "Preferred place of care and of death",
            "Capacity, and who was involved",
        ],
        "caution": "These are conversation prompts drawn from the record. Cairn makes no "
                   "prediction about this patient and no recommendation about their care.",
    }


SIGNAL_PROMPTS = {
    "GEN_ADMISSIONS":
        "You have been into hospital a few times this year. How have those admissions "
        "felt for you, and would you want to avoid another if we could manage things at home?",
    "GEN_FRAILTY":
        "How are you managing day to day at the moment, and has that changed over the past year?",
    "GEN_WEIGHT":
        "Your weight has been dropping. Have you noticed a change in your strength or appetite?",
    "GEN_CARE_NEEDS":
        "Your care needs have increased recently. How is that working, and what would you "
        "want if you needed more help?",
    "GEN_PERFORMANCE":
        "How much of the day are you spending resting now compared with six months ago?",
    "DIS_CANCER":
        "What have the oncology team told you about what to expect, and what questions are "
        "still unanswered for you?",
    "DIS_HEART":
        "When your heart failure flares, what would you want to happen, and where would you "
        "want to be treated?",
    "DIS_RESP":
        "When your breathing gets bad, what has helped, and what would you want us to do "
        "if it became very difficult?",
    "DIS_NEURO":
        "Looking ahead with your condition, are there treatments or situations you would "
        "want to avoid?",
    "DIS_RENAL":
        "Have you had a conversation about what you would want if dialysis stopped helping, "
        "or if you chose not to start?",
    "DIS_LIVER":
        "Have you talked with the liver team about what happens if things do not improve?",
}


def render_text(guide: dict) -> str:
    """Plain text for the clinician, printable and readable on a phone."""
    h = guide["header"]
    L = [f"Conversation guide  |  {guide['patient_id']}  |  {h['age']}y  |  {h['tier']}",
         f"Conditions: {', '.join(h['conditions']) or 'none recorded'}", ""]
    L.append("Why this patient, now")
    for w in guide["why_now"]:
        L.append(f"  - {w['indicator']}: {w['evidence']}  [{w['basis']}]")
    L += ["", "Opening"]
    for o in guide["opening"]:
        L.append(f"  {o['stage']}: {o['prompt']}")
    if guide["specific_to_this_patient"]:
        L += ["", "Specific to this patient"]
        for s in guide["specific_to_this_patient"]:
            L.append(f"  {s['prompt']}")
            L.append(f"      raised because: {s['because']}")
    L += ["", "Before you close"]
    for c in guide["closing"]:
        L.append(f"  {c['stage']}: {c['prompt']}")
    L += ["", "Record afterwards"]
    for r in guide["record_after"]:
        L.append(f"  - {r}")
    L += ["", guide["caution"]]
    return "\n".join(L)
