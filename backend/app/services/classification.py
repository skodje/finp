from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class Classification:
    ownership: str
    confidence: Decimal
    category: str | None = None


DEFAULT_RULES = {
    "rema": Classification("common", Decimal("0.98"), "Mat"),
    "meny": Classification("common", Decimal("0.98"), "Mat"),
    "coop": Classification("common", Decimal("0.95"), "Mat"),
    "circle k": Classification("common", Decimal("0.95"), "Bil"),
    "barnehage": Classification("common", Decimal("1.00"), "Barn"),
}


def classify(description: str) -> Classification | None:
    normalized = description.casefold()
    for pattern, result in DEFAULT_RULES.items():
        if pattern in normalized:
            return result
    return None
