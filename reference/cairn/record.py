"""
The advance care planning record: the part of Cairn that travels.

Two rules are enforced in code, and both exist because a clinical judge will ask:

1. Nothing leaves draft without a named clinician signing it. ReSPECT produces
   clinician-completed recommendations made with the person or their representative,
   so an automatically issued record would be wrong in a way no demo polish can fix.
2. Every clinical field carries provenance: who said it, when, and where it came from.
   A field with no source cannot be shared.

ReSPECT recommendations are not legally binding and are not a DNACPR form. An advance
decision to refuse treatment (ADRT) is a separate, legally binding document, so it is
referenced here rather than generated.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Literal

Status = Literal["draft", "awaiting_signature", "signed", "shared", "superseded"]

AUDIENCES = ["gp", "out_of_hours", "ambulance", "hospice", "hospital", "family"]


@dataclass
class Entry:
    """One clinical field with its provenance. No provenance, no sharing."""
    value: str
    source: str          # "conversation 2026-09-12 with Dr A Patel" or "record: problem list"
    recorded_by: str
    recorded_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def ok(self) -> bool:
        return bool(self.value and self.source and self.recorded_by)


@dataclass
class CairnRecord:
    patient_id: str
    status: Status = "draft"

    # What matters to the person. Their words come first, deliberately.
    what_matters: Entry | None = None
    concerns_and_fears: Entry | None = None

    # Clinical recommendations. ReSPECT-shaped.
    clinical_summary: Entry | None = None
    preferences_for_care: Entry | None = None       # priority: comfort <-> life-sustaining
    recommended_interventions: Entry | None = None  # what to do
    not_recommended: Entry | None = None            # ceilings of treatment
    cpr_recommendation: Entry | None = None
    preferred_place_of_care: Entry | None = None
    preferred_place_of_death: Entry | None = None

    # Capacity and representation.
    capacity_assessment: Entry | None = None
    adrt_exists: Entry | None = None                # referenced, never generated
    lpa_health_welfare: Entry | None = None
    people_involved: Entry | None = None

    # Governance.
    signed_by: str | None = None
    signed_at: str | None = None
    shared_with: list[str] = field(default_factory=list)
    audit: list[str] = field(default_factory=list)

    CLINICAL_FIELDS = (
        "clinical_summary", "preferences_for_care", "recommended_interventions",
        "not_recommended", "cpr_recommendation", "preferred_place_of_care",
        "preferred_place_of_death", "capacity_assessment",
    )

    # -- validation ---------------------------------------------------------

    def missing_for_signature(self) -> list[str]:
        """What a clinician still has to complete. Shown in the UI as a checklist."""
        required = ["what_matters", "clinical_summary", "preferences_for_care",
                    "recommended_interventions", "cpr_recommendation",
                    "capacity_assessment", "people_involved"]
        return [f for f in required if getattr(self, f) is None]

    def unsourced_fields(self) -> list[str]:
        out = []
        for f in self.CLINICAL_FIELDS + ("what_matters", "concerns_and_fears", "people_involved"):
            e = getattr(self, f)
            if e is not None and not e.ok():
                out.append(f)
        return out

    # -- state machine ------------------------------------------------------

    def set(self, field_name: str, value: str, source: str, recorded_by: str) -> None:
        if not hasattr(self, field_name):
            raise KeyError(f"no field {field_name}")
        if self.status in ("signed", "shared"):
            raise PermissionError("Signed record is immutable. Create a new version instead.")
        setattr(self, field_name, Entry(value=value, source=source, recorded_by=recorded_by))
        self._log(f"set {field_name} from {source}")

    def request_signature(self) -> dict:
        missing = self.missing_for_signature()
        unsourced = self.unsourced_fields()
        if missing or unsourced:
            return {"ready": False, "missing": missing, "unsourced": unsourced}
        self.status = "awaiting_signature"
        self._log("draft complete, awaiting clinician signature")
        return {"ready": True, "missing": [], "unsourced": []}

    def sign(self, clinician: str) -> None:
        """Only a named human signs. Cairn never calls this on its own behalf."""
        if self.status != "awaiting_signature":
            raise PermissionError(f"Cannot sign from status '{self.status}'.")
        if not clinician or clinician.lower().startswith("cairn"):
            raise PermissionError("A record must be signed by a named clinician.")
        self.status = "signed"
        self.signed_by = clinician
        self.signed_at = datetime.now(timezone.utc).isoformat()
        self._log(f"signed by {clinician}")

    def share(self, audiences: list[str]) -> None:
        if self.status not in ("signed", "shared"):
            raise PermissionError("Only a signed record can be shared.")
        bad = [a for a in audiences if a not in AUDIENCES]
        if bad:
            raise ValueError(f"unknown audience {bad}")
        self.shared_with = sorted(set(self.shared_with) | set(audiences))
        self.status = "shared"
        self._log(f"shared with {', '.join(audiences)}")

    def _log(self, msg: str) -> None:
        self.audit.append(f"{datetime.now(timezone.utc).isoformat()}  {msg}")

    # -- views --------------------------------------------------------------

    def view_for(self, audience: str) -> dict:
        """
        What each service sees. An ambulance crew at 3am needs four lines, and a hospice
        needs the whole picture. Same record, different surface.
        """
        if audience not in AUDIENCES:
            raise ValueError(f"unknown audience {audience}")
        if self.status not in ("signed", "shared"):
            return {"error": "Record is not signed. Nothing is shared."}

        def v(name):
            e = getattr(self, name)
            return e.value if e else None

        base = {"patient_id": self.patient_id, "status": self.status,
                "signed_by": self.signed_by, "signed_at": self.signed_at}

        if audience == "ambulance":
            return base | {
                "cpr_recommendation": v("cpr_recommendation"),
                "preferences_for_care": v("preferences_for_care"),
                "not_recommended": v("not_recommended"),
                "preferred_place_of_care": v("preferred_place_of_care"),
                "note": "Recommendations, not legally binding. Clinical judgement applies.",
            }
        if audience == "family":
            return base | {
                "what_matters": v("what_matters"),
                "preferred_place_of_care": v("preferred_place_of_care"),
                "people_involved": v("people_involved"),
                "note": "Shared with consent recorded in the conversation.",
            }
        full = {f: v(f) for f in self.CLINICAL_FIELDS}
        return base | full | {
            "what_matters": v("what_matters"),
            "concerns_and_fears": v("concerns_and_fears"),
            "adrt_exists": v("adrt_exists"),
            "lpa_health_welfare": v("lpa_health_welfare"),
            "people_involved": v("people_involved"),
        }

    # -- serialisation, for the EPaCCS-shaped payload -----------------------

    def to_dict(self) -> dict:
        d = asdict(self)
        d["missing_for_signature"] = self.missing_for_signature()
        return d

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, default=str)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "CairnRecord":
        rec = cls(patient_id=d["patient_id"], status=d.get("status", "draft"))
        for f in [*cls.CLINICAL_FIELDS, "what_matters", "concerns_and_fears",
                  "adrt_exists", "lpa_health_welfare", "people_involved"]:
            e = d.get(f)
            if isinstance(e, dict) and e.get("value"):
                setattr(rec, f, Entry(**{k: e[k] for k in
                        ("value", "source", "recorded_by", "recorded_at") if k in e}))
        rec.signed_by = d.get("signed_by")
        rec.signed_at = d.get("signed_at")
        rec.shared_with = list(d.get("shared_with") or [])
        rec.audit = list(d.get("audit") or [])
        return rec
