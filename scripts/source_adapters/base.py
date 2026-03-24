from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AdapterResult:
    adapter_id: str
    kind: str
    label: str
    priority: int
    payload: dict[str, Any]
    field_priorities: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    enabled: bool = True
