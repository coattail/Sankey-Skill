from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
MANUAL_COMPANY_OVERRIDES_PATH = DATA_DIR / "manual-company-overrides.json"
SUPPLEMENTAL_COMPONENTS_PATH = DATA_DIR / "supplemental-components.json"


def _load_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def load_manual_company_overrides() -> dict[str, Any]:
    return _load_json_dict(MANUAL_COMPANY_OVERRIDES_PATH)


def load_supplemental_components() -> dict[str, Any]:
    return _load_json_dict(SUPPLEMENTAL_COMPONENTS_PATH)


def normalized_lookup_candidates(company: dict[str, Any]) -> list[str]:
    values = {
        str(company.get("id") or "").strip().lower(),
        str(company.get("ticker") or "").strip().lower(),
        str(company.get("slug") or "").strip().lower(),
        re.sub(r"[^a-z0-9]+", "", str(company.get("ticker") or "").strip().lower()),
    }
    expanded = set(values)
    for value in list(values):
        if not value:
            continue
        compact = re.sub(r"[^a-z0-9]+", "", value)
        expanded.add(compact)
        expanded.add(value.replace("-inc", ""))
        expanded.add(value.replace("-corp", ""))
        expanded.add(value.replace("-corporation", ""))
        expanded.add(value.replace("-co", ""))
        expanded.add(value.replace("inc", ""))
        expanded.add(value.replace("corporation", ""))
        expanded.add(value.replace("company", ""))
        expanded.add(value.replace("-", ""))
        if compact.endswith("inc"):
            expanded.add(compact[:-3])
        if compact.endswith("corp"):
            expanded.add(compact[:-4])
        if compact.endswith("corporation"):
            expanded.add(compact[:-11])
        if compact.endswith("company"):
            expanded.add(compact[:-7])
    return [value for value in expanded if value]


def lookup_company_record(payload: dict[str, Any], company: dict[str, Any]) -> dict[str, Any] | None:
    candidates = normalized_lookup_candidates(company)
    for candidate in candidates:
        value = payload.get(candidate)
        if isinstance(value, dict):
            return value
    return None

