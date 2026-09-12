"""
Where patients come from.

Two sources with the same shape, so nothing downstream cares which one is live:

  FixtureSource  a synthetic population, so the whole pipeline runs with no network
  NHSSimSource   the NHS-SIM API

Adapt `NHSSimSource._normalise` when you see the real schema. That method is the only
place in Cairn that should need to change, and the offline fixtures let you keep testing
while the API is unreachable, rate limited or wrong.
"""

from __future__ import annotations

import json
import os
import random
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator, Protocol


class PatientSource(Protocol):
    def iter_patients(self) -> Iterator[dict]: ...


# ---------------------------------------------------------------------------
# Offline fixtures
# ---------------------------------------------------------------------------

CONDITIONS = [
    ("COPD", 0.09), ("heart failure", 0.07), ("dementia", 0.05),
    ("CKD stage 4", 0.03), ("metastatic cancer", 0.02), ("advanced cancer", 0.02),
    ("parkinson disease", 0.01), ("motor neurone disease", 0.002),
    ("cirrhosis", 0.01), ("multiple sclerosis", 0.01),
    ("type 2 diabetes", 0.18), ("hypertension", 0.28), ("asthma", 0.11),
]


class FixtureSource:
    """A synthetic neighbourhood. Shapes only; no claim to represent real epidemiology."""

    def __init__(self, n: int = 5000, seed: int = 12):
        self.n, self.seed = n, seed

    def iter_patients(self) -> Iterator[dict]:
        rng = random.Random(self.seed)
        for i in range(1, self.n + 1):
            age = min(100, max(18, int(rng.gauss(48, 21))))
            old = age >= 70
            conds = [c for c, pr in CONDITIONS
                     if rng.random() < pr * (2.2 if old and c not in
                                             ("asthma", "type 2 diabetes") else 1)]
            frail = None
            if old and rng.random() < 0.35:
                frail = rng.choice([4, 5, 5, 6, 6, 7, 8])
            adms = [{"months_ago": rng.randint(1, 12), "emergency": True}
                    for _ in range(rng.choices([0, 1, 2, 3], [0.72, 0.17, 0.08, 0.03])[0])]
            p = {
                "id": f"NHS{i:06d}",
                "age": age,
                "sex": rng.choice(["F", "M"]),
                "conditions": conds,
                "admissions": adms,
                "imd_quintile": rng.choices([1, 2, 3, 4, 5], [0.24, 0.22, 0.2, 0.18, 0.16])[0],
                "frailty_cfs": frail,
                "frailty_recorded_months_ago": rng.randint(1, 30) if frail else None,
            }
            if rng.random() < 0.05:
                p["weight_loss_pct"] = rng.randint(5, 18)
            if old and rng.random() < 0.06:
                p["care_package_increase"] = rng.randint(1, 10)
            if rng.random() < 0.05:
                p["performance_status"] = rng.choice([2, 3, 4])
            if "heart failure" in conds:
                p["nyha"] = rng.choice([1, 2, 3, 3, 4])
            if "COPD" in conds:
                p["mrc_dyspnoea"] = rng.choice([1, 2, 3, 4, 5])
            # The register is deliberately skewed towards cancer, matching the
            # historical pattern Cairn is trying to correct.
            cancer = any("cancer" in c for c in conds)
            on_reg = rng.random() < (0.45 if cancer else 0.04)
            p["palliative_register"] = on_reg
            p["acp_record"] = on_reg and rng.random() < 0.5
            yield p


# ---------------------------------------------------------------------------
# NHS-SIM
# ---------------------------------------------------------------------------

class NHSSimSource:
    """
    Thin client. Set base URL and token via environment or constructor:

        export NHS_SIM_URL=https://...   NHS_SIM_TOKEN=...
        python -m cairn.demo --live

    `_normalise` is the single adapter point. Map their field names onto the keys
    `cairn.signals` reads, and everything downstream keeps working unchanged.
    """

    def __init__(self, base_url: str | None = None, token: str | None = None,
                 page_size: int = 200, max_patients: int | None = None):
        self.base = (base_url or os.environ.get("NHS_SIM_URL", "")).rstrip("/")
        self.token = token or os.environ.get("NHS_SIM_TOKEN", "")
        self.page_size = page_size
        self.max_patients = max_patients
        if not self.base:
            raise RuntimeError("Set NHS_SIM_URL, or pass base_url.")

    def _get(self, path: str, params: dict | None = None) -> Any:
        url = f"{self.base}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url)
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())

    def iter_patients(self) -> Iterator[dict]:
        seen, page = 0, 1
        while True:
            try:
                data = self._get("/patients", {"page": page, "page_size": self.page_size})
            except urllib.error.HTTPError as e:
                raise RuntimeError(f"NHS-SIM returned {e.code} for /patients. "
                                   f"Check the path and token.") from e
            rows = data.get("results") or data.get("data") or data if isinstance(data, list) else []
            if not rows:
                return
            for row in rows:
                yield self._normalise(row)
                seen += 1
                if self.max_patients and seen >= self.max_patients:
                    return
            page += 1

    @staticmethod
    def _normalise(row: dict) -> dict:
        """
        THE ADAPTER. Change the right-hand sides to match NHS-SIM, leave the keys alone.
        Anything missing simply means the corresponding indicator never fires, which is
        safe: Cairn under-identifies rather than inventing evidence.
        """
        return {
            "id": row.get("id") or row.get("nhs_number"),
            "age": row.get("age"),
            "sex": row.get("sex") or row.get("gender"),
            "conditions": row.get("conditions") or row.get("problems") or [],
            "admissions": row.get("admissions") or [],
            "imd_quintile": row.get("imd_quintile") or row.get("deprivation_quintile"),
            "frailty_cfs": row.get("frailty_cfs") or row.get("clinical_frailty_scale"),
            "frailty_recorded_months_ago": row.get("frailty_recorded_months_ago"),
            "weight_loss_pct": row.get("weight_loss_pct"),
            "care_package_increase": row.get("care_package_increase"),
            "performance_status": row.get("performance_status"),
            "nyha": row.get("nyha"),
            "mrc_dyspnoea": row.get("mrc_dyspnoea"),
            "palliative_register": row.get("palliative_register", False),
            "acp_record": row.get("acp_record", False),
        }


def load_source(live: bool = False, n: int = 5000) -> PatientSource:
    if live:
        return NHSSimSource()
    return FixtureSource(n=n)
