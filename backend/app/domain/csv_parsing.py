"""Pure CSV -> transaction-row parsing. No FastAPI, no DB."""

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from dateutil.parser import parse
from datetime import date


from app.domain.classification import classify
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


def parse_date(value: str) -> date:
    return parse(value.strip(), dayfirst=True).date()


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


def _pick(row: dict, *names: str) -> str:
    normalized = {
        str(k).strip().casefold(): (v.strip() if isinstance(v, str) else "") for k, v in row.items()
    }
    for name in names:
        if name.casefold() in normalized:
            return normalized[name.casefold()]
    return ""


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("cp1252", errors="replace")  # older Norwegian bank exports


def parse_csv(content: bytes) -> list[ParsedRow]:
    text = _decode(content)
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel()

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise Invalid("CSV-filen mangler kolonneoverskrift.")

    rows: list[ParsedRow] = []
    for row_number, raw in enumerate(reader, start=2):
        date_value = _pick(raw, "date", "dato", "posted_at", "bokføringsdato", "transaksjonsdato")
        description = _pick(raw, "description", "beskrivelse", "tekst", "details", "transaction")
        amount_value = _pick(raw, "amount", "beløp", "belop", "sum")
        currency = _pick(raw, "currency", "valuta") or "NOK"
        error = None
        try:
            posted_at = parse_date(date_value)
            amount = parse_amount(amount_value)
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
            )
        )
    return rows
