from dataclasses import dataclass
from decimal import Decimal

from app.domain.enums import Ownership


@dataclass(frozen=True)
class Classification:
    ownership: Ownership
    confidence: Decimal
    category: str | None = None


DEFAULT_RULES = {
    "rema": Classification(Ownership.COMMON, Decimal("0.98"), "Mat"),
    "meny": Classification(Ownership.COMMON, Decimal("0.98"), "Mat"),
    "coop": Classification(Ownership.COMMON, Decimal("0.95"), "Mat"),
    "circle k": Classification(Ownership.COMMON, Decimal("0.95"), "Bil"),
    "barnehage": Classification(Ownership.COMMON, Decimal("1.00"), "Barn"),
}


# Card-bill payments and account-to-account moves: not expenses, must not be split.
TRANSFER_HINTS = ("innbetaling", "avdrag", "kortregning", "betaling mottatt", "payment received")


def is_transfer(description: str) -> bool:
    normalized = description.casefold()
    return any(hint in normalized for hint in TRANSFER_HINTS)


def classify(description: str) -> Classification | None:
    normalized = description.casefold()
    for pattern, result in DEFAULT_RULES.items():
        if pattern in normalized:
            return result
    return None
