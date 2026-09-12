#!/usr/bin/env python3
"""Read an existing bounded simulator export; inventory outcome fields without inventing labels."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re


def audit(directory):
    resources, patients, kinds, candidates, files = {}, set(), collections.Counter(), [], []
    for file in sorted(directory.glob("*.json")):
        if file.name in {"manifest.json", "clock.json", "team.json", "mortality-audit.json"}:
            continue
        raw = file.read_bytes()
        data = json.loads(raw)
        if not isinstance(data, dict):
            continue
        files.append({"path": file.name, "sha256": hashlib.sha256(raw).hexdigest()})
        entries = data.get("resources", []) + [e["resource"] for e in data.get("entry", []) if "resource" in e]
        for record in entries:
            key = record.get("id")
            if not key or key in resources:
                continue
            resources[key] = record
            if record.get("patientId"):
                patients.add(record["patientId"])
            kinds[record.get("kind", record.get("resourceType", "unknown"))] += 1

            def visit(value, pointer=""):
                if isinstance(value, dict):
                    for field, item in value.items():
                        location = pointer + "/" + field.replace("~", "~0").replace("/", "~1")
                        if re.search(r"death|deceas|surviv|follow.?up", field, re.I):
                            candidates.append({"file": file.name, "recordId": key, "pointer": location,
                                               "type": type(item).__name__, "requiresOutcomeAdjudication": True})
                        visit(item, location)
                elif isinstance(value, list):
                    for i, item in enumerate(value):
                        visit(item, pointer + "/" + str(i))
            visit(record)
    manifest = json.loads((directory / "manifest.json").read_text())
    return {"schemaVersion": "mortality-audit-v1", "scope": manifest.get("scope"),
            "probeStartedAt": manifest.get("startedAt"), "probeFinishedAt": manifest.get("finishedAt"),
            "failedProbes": [name for name, result in manifest.get("probes", {}).items() if not result.get("ok")],
            "uniqueResources": len(resources), "exactPatientIds": len(patients), "resourceKinds": dict(kinds),
            "candidateFields": candidates, "files": files,
            "trainingReadiness": "requires_verified_death_events_and_survival_followup",
            "limitations": ["Bounded views are not a full population audit.",
                            "Follow-up plans are not proof of survival through a prediction horizon.",
                            "No outcome labels are inferred from text, absence of records, model outputs or selected patient IDs."]}


def audit_collections(directories):
    """Audit existing collector manifests; never collect more data or infer labels."""
    rows, candidates, seen = [], [], set()
    for directory in directories:
        root = directory / "record"
        manifest = json.loads((root / "manifest.json").read_text())
        patient_id = manifest["patientId"]
        paths = []
        def visit(node, file):
            if isinstance(node, list):
                for child in node:
                    visit(child, file)
            elif isinstance(node, dict):
                owner = node.get("patientId")
                for field in ("subject", "patient"):
                    ref = node.get(field, {}).get("reference") if isinstance(node.get(field), dict) else None
                    if isinstance(ref, str) and ref.startswith("Patient/"):
                        owner = ref[8:]
                if node.get("id") == patient_id:
                    owner = patient_id
                if owner:
                    if owner != patient_id or not node.get("id"):
                        return
                    key = (patient_id, node.get("kind", node.get("resourceType", "directory")), node["id"])
                    if key in seen:
                        return
                    seen.add(key)
                    def fields(value, pointer=""):
                        if isinstance(value, dict):
                            for name, item in value.items():
                                loc = pointer + "/" + name.replace("~", "~0").replace("/", "~1")
                                if re.search(r"death|deceas|surviv|follow.?up", name, re.I):
                                    candidates.append({"patientId": patient_id, "file": str(file), "recordId": node["id"], "pointer": loc, "type": type(item).__name__, "requiresOutcomeAdjudication": True})
                                fields(item, loc)
                        elif isinstance(value, list):
                            for index, item in enumerate(value):
                                fields(item, pointer + "/" + str(index))
                    fields(node)
                    return
                for field in ("items", "resources", "documents", "entry", "resource"):
                    if field in node:
                        visit(node[field], file)
        for source in manifest["sources"]:
            if source["status"] != "ok":
                continue
            file = (root / source["relativePath"]).resolve()
            if not file.is_relative_to(root.resolve()):
                raise ValueError("Source outside collection")
            raw = file.read_bytes()
            paths.append({"path": str(file), "sha256": hashlib.sha256(raw).hexdigest()})
            visit(json.loads(raw), file)
        rows.append({"patientId": patient_id, "files": paths, "failedSources": [x["name"] for x in manifest["sources"] if x["status"] != "ok"]})
    return {"schemaVersion": "mortality-collection-audit-v1", "collections": rows, "uniqueResources": len(seen), "exactPatientIds": len({x[0] for x in seen}), "candidateFields": candidates,
            "trainingReadiness": "requires_verified_death_events_and_survival_followup",
            "limitations": ["Bounded fictional collection, not a population outcome audit.", "Field matches require adjudication; follow-up plans and absence of death do not prove survival.", "No labels were generated."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, nargs="?")
    parser.add_argument("--collection", type=Path, action="append")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if bool(args.directory) == bool(args.collection):
        parser.error("Supply an export directory or one or more --collection directories")
    result = audit_collections(args.collection) if args.collection else audit(args.directory)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ("uniqueResources", "exactPatientIds", "trainingReadiness")}))
