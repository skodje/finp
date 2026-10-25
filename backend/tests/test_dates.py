from datetime import date

import pytest

from app.domain.dates import infer_date_format, parse_date


def test_parse_date_known_formats():
    assert parse_date("2025-03-04") == date(2025, 3, 4)
    assert parse_date("04.03.2025") == date(2025, 3, 4)
    assert parse_date("04/03/2025", "%m/%d/%Y") == date(2025, 4, 3)


def test_parse_date_rejects_unknown_formats():
    with pytest.raises(ValueError):
        parse_date("i går")


def test_infer_month_first_format_from_statement_order():
    assert infer_date_format(["10/08/2026", "10/07/2026", "10/06/2026"]) == "%m/%d/%Y"


def test_infer_day_first_format_from_statement_order():
    assert infer_date_format(["05.10.2026", "04.10.2026", "03.10.2026"]) == "%d.%m.%Y"


def test_infer_iso_format():
    assert infer_date_format(["2026-10-08", "2026-10-07", "2026-10-06"]) == "%Y-%m-%d"


def test_infer_returns_none_without_dates():
    assert infer_date_format([]) is None
    assert infer_date_format(["", "  "]) is None
    assert infer_date_format(["not a date"]) is None
