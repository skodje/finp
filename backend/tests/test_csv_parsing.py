from datetime import date
from decimal import Decimal

import pytest

from app.domain.csv_parsing import parse_amount, parse_csv, parse_date
from app.domain.enums import Ownership
from app.domain.errors import Invalid


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1 234,56", "1234.56"),
        ("1.234,56", "1234.56"),
        ("1,234.56", "1234.56"),
        ("-99,5", "-99.5"),
        ("1 234", "1234"),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == Decimal(expected)


@pytest.mark.parametrize("raw", ["", "abc", "NaN", "Infinity"])
def test_parse_amount_rejects(raw):
    with pytest.raises(ValueError):
        parse_amount(raw)


def test_parse_date_formats():
    assert parse_date("2025-03-04") == date(2025, 3, 4)
    assert parse_date("04.03.2025") == date(2025, 3, 4)
    with pytest.raises(ValueError):
        parse_date("i går")


def test_parse_csv_semicolon_norwegian_headers_and_classification():
    rows = parse_csv("Dato;Tekst;Beløp\n04.03.2025;REMA 1000 Skui;-1 284,00\n".encode())
    assert len(rows) == 1
    r = rows[0]
    assert (r.posted_at, r.amount, r.error) == (date(2025, 3, 4), Decimal("-1284.00"), None)
    assert (r.ownership, r.category) == (Ownership.COMMON, "Mat")


def test_parse_csv_bad_rows_flagged_not_dropped():
    rows = parse_csv(
        b"date,description,amount\n2025-01-01,,10\nnope,Kiosk,10\n2025-01-01,Kiosk,x\n"
    )
    assert [r.error for r in rows] == [
        "Beskrivelse mangler",
        "Ugyldig dato: nope",
        "Ugyldig beløp: x",
    ]


def test_parse_csv_latin1_and_long_description():
    rows = parse_csv("date,description,amount\n2025-01-01,Bjørn,10\n".encode("latin-1"))
    assert rows[0].description == "Bjørn"
    long = parse_csv(f"date,description,amount\n2025-01-01,{'x' * 300},10\n".encode())
    assert len(long[0].merchant) == 200


def test_parse_csv_without_header():
    with pytest.raises(Invalid):
        parse_csv(b"")
