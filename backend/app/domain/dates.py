"""Date parsing and date-format inference for imported bank exports."""

import itertools
from collections.abc import Sequence
from datetime import date, datetime

# Year-first formats come first (an ISO date is unambiguous when the day is > 12).
# Day-first before month-first keeps the Norwegian default when a single row is ambiguous.
DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%Y.%m.%d",
    "%d.%m.%Y",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d.%m.%y",
    "%d-%m-%y",
    "%d/%m/%y",
    "%m/%d/%y",
)
SAMPLE_SIZE = 200


def parse_date(value: str, fmt: str | None = None) -> date:
    value = value.strip()
    for candidate in (fmt,) if fmt else DATE_FORMATS:
        try:
            return datetime.strptime(value, candidate).date()
        except ValueError:
            pass
    raise ValueError(f"Ugyldig dato: {value}")


def _date_order_score(dates: list[date]) -> tuple[int, int]:
    """How well the dates follow the file's order, and how tightly they are spaced.

    Bank statements are sorted by date, so the correct day/month order is the one where
    consecutive rows stay in order and close together. Swapping day and month usually
    makes the sequence jump around (or pushes the gaps to about a month).
    """
    ascending = sum(a <= b for a, b in itertools.pairwise(dates))
    descending = sum(a >= b for a, b in itertools.pairwise(dates))
    gap = sum(abs((b - a).days) for a, b in itertools.pairwise(dates))
    return max(ascending, descending), -gap


def infer_date_format(values: Sequence[str]) -> str | None:
    """Pick the format that parses every sampled date and keeps the statement in order."""
    sample = [value.strip() for value in values if value and value.strip()][:SAMPLE_SIZE]
    if not sample:
        return None
    best: tuple[tuple[int, int], str] | None = None
    for fmt in DATE_FORMATS:
        try:
            parsed = [datetime.strptime(value, fmt).date() for value in sample]
        except ValueError:
            continue
        score = _date_order_score(parsed)
        if best is None or score > best[0]:
            best = (score, fmt)
    return best[1] if best else None
