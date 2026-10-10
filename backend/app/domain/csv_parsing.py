"""Pure CSV -> transaction-row parsing. No FastAPI, no DB."""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.domain.classification import classify, is_transfer
from app.domain.enums import Ownership
from app.domain.errors import Invalid

MERCHANT_MAX = 200  # merchants.name is String(200)


@dataclass(frozen=True)
class ParsedRow:
    row_number: int
    posted_at: date
    description: str
    amount: Decimal
    currency: str
    merchant: str
    category: str | None
    ownership: Ownership | None
    confidence: Decimal | None
    error: str | None
    is_transfer: bool = False


def parse_date(value: str) -> date:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Ugyldig dato: {value}")


def parse_amount(value: str) -> Decimal:
    value = value.strip().replace("\u00a0", "").replace(" ", "")
    if not value:
        raise ValueError("Beløp mangler")
    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        value = value.replace(",", ".")
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"Ugyldig beløp: {value}") from exc
    if not amount.is_finite():  # Decimal accepts "NaN" / "Infinity"
        raise ValueError(f"Ugyldig beløp: {value}")
    return amount


DATE_NAMES = ("date", "dato", "posted_at", "bokføringsdato", "transaksjonsdato")
DESC_NAMES = ("description", "beskrivelse", "tekst", "details", "transaction")
AMOUNT_NAMES = ("amount", "beløp", "belop", "sum")


def _parses(fn, value: str) -> bool:
    try:
        fn(value)
        return True
    except ValueError:
        return False


def infer_columns(rows: list[list[str]]) -> dict[str, int] | None:
    """Guess which column is date / description / amount from the values alone.

    ponytail: first column where every value is a number wins amount (so date, text, amount,
    balance works); a file with the balance before the amount gets the wrong one. Upgrade
    path: let the user pick columns in the import preview.
    """
    sample = rows[:50]
    width = min(len(r) for r in sample)
    cols = [[r[i].strip() for r in sample if r[i].strip()] for i in range(width)]

    def all_parse(i, fn):
        return bool(cols[i]) and all(_parses(fn, v) for v in cols[i])

    date_i = next((i for i in range(width) if all_parse(i, parse_date)), None)
    amount_i = next((i for i in range(width) if i != date_i and all_parse(i, parse_amount)), None)
    text = [
        (sum(map(len, cols[i])) / len(cols[i]), i)
        for i in range(width)
        if i not in (date_i, amount_i) and cols[i] and not all_parse(i, parse_amount)
    ]
    if date_i is None or amount_i is None or not text:
        return None
    return {"date": date_i, "amount": amount_i, "description": max(text)[1]}


def _dialect(text: str):
    """Pick the delimiter whose field count is the same on every line (and > 1).

    Order matters: Norwegian exports use ';' with decimal commas, which fools csv.Sniffer.
    """
    head = [line for line in text.splitlines()[:20] if line.strip()]
    for delimiter in ";\t,":
        counts = {len(next(csv.reader([line], delimiter=delimiter))) for line in head}
        if len(counts) == 1 and counts != {1}:

            class Found(csv.excel):
                pass

            Found.delimiter = delimiter
            return Found
    return csv.excel


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1252", errors="replace")  # older Norwegian bank exports


@dataclass(frozen=True)
class CsvRead:
    rows: list[ParsedRow]
    columns: list[str]  # label per column, for the mapping dropdowns
    mapping: dict[str, int | None]  # date / description / amount -> column index
    has_header: bool


FIELDS = {"date": DATE_NAMES, "description": DESC_NAMES, "amount": AMOUNT_NAMES}


def read_csv(
    content: bytes, mapping: dict[str, int | None] | None = None, header: bool | None = None
) -> CsvRead:
    """Parse a CSV. Columns come from the header names, else are inferred from the values;
    `mapping` (column indexes) and `header` override whatever was detected."""
    text = _decode(content)
    lines = list(csv.reader(io.StringIO(text), dialect=_dialect(text)))
    lines = [r for r in lines if any(c.strip() for c in r)]
    if not lines:
        raise Invalid("CSV-filen er tom.")
    width = max(map(len, lines))

    known = {n.casefold() for names in FIELDS.values() for n in names}
    has_header = (
        header if header is not None else any(c.strip().casefold() in known for c in lines[0])
    )
    body = lines[1:] if has_header else lines
    names = [c.strip().casefold() for c in lines[0]] if has_header else []

    def by_name(aliases):
        return next((names.index(a) for a in aliases if a in names), None)

    cols = {k: by_name(a) for k, a in FIELDS.items()}
    if None in cols.values():
        guess = infer_columns(body) if body else None
        cols = {k: guess[k] if guess else None for k in FIELDS}
    for key, index in (mapping or {}).items():
        if index is not None:
            if not 0 <= index < width:
                raise Invalid("Ugyldig kolonne.")
            cols[key] = index
    currency_col = by_name(("currency", "valuta"))

    if has_header:
        labels = [
            (lines[0][i].strip() if i < len(lines[0]) else "") or f"Kolonne {i + 1}"
            for i in range(width)
        ]
    else:
        labels = [
            f"Kolonne {i + 1}: {lines[0][i] if i < len(lines[0]) else ''}" for i in range(width)
        ]

    def cell(row, index):
        return row[index].strip() if index is not None and index < len(row) else ""

    rows: list[ParsedRow] = []
    for row_number, raw in enumerate(body, start=2 if has_header else 1):
        description = cell(raw, cols["description"])
        currency = cell(raw, currency_col) or "NOK"
        error = None
        try:
            posted_at = parse_date(cell(raw, cols["date"]))
            amount = parse_amount(cell(raw, cols["amount"]))
            if not description:
                raise ValueError("Beskrivelse mangler")
        except ValueError as exc:
            posted_at = date.today()
            amount = Decimal("0")
            error = str(exc)

        classification = classify(description)
        rows.append(
            ParsedRow(
                row_number=row_number,
                posted_at=posted_at,
                description=description,
                amount=amount,
                currency=currency[:3].upper(),
                merchant=description[:MERCHANT_MAX],
                category=classification.category if classification else None,
                ownership=classification.ownership if classification else None,
                confidence=classification.confidence if classification else None,
                error=error,
                is_transfer=is_transfer(description),
            )
        )
    return CsvRead(rows, labels, cols, has_header)


def parse_csv(content: bytes) -> list[ParsedRow]:
    return read_csv(content).rows
