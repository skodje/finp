from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Allocation, Category, Merchant, Transaction
from app.domain.csv_parsing import CsvRead, ParsedRow, read_csv
from app.domain.errors import Invalid
from app.services.accounts import require_account

MAX_CSV_BYTES = 5 * 1024 * 1024
CENT = Decimal("0.01")


@dataclass(frozen=True)
class ImportResult:
    imported: int
    skipped_duplicates: int


def _key(row: ParsedRow) -> tuple:
    return (row.posted_at, row.description, row.amount.quantize(CENT))


def _split_duplicates(
    db: Session, account_id: UUID, valid: Sequence[ParsedRow]
) -> tuple[list[ParsedRow], list[ParsedRow]]:
    """Split rows into (new, already_stored).

    A row is a duplicate if the account already has one with the same date, text and amount.
    Counting, not a set, so two genuinely identical purchases on one day still import, and a
    re-upload of a partly overlapping file only adds what's missing.
    """
    if not valid:
        return [], []
    existing = Counter(
        (d, desc, amt)
        for d, desc, amt in db.execute(
            select(Transaction.posted_at, Transaction.description, Transaction.amount).where(
                Transaction.account_id == account_id,
                Transaction.posted_at.between(
                    min(r.posted_at for r in valid), max(r.posted_at for r in valid)
                ),
            )
        )
    )
    new, duplicates = [], []
    for row in valid:
        key = _key(row)
        if existing[key] > 0:
            existing[key] -= 1
            duplicates.append(row)
        else:
            new.append(row)
    return new, duplicates


def preview_csv(
    db: Session,
    account_id: UUID,
    content: bytes,
    mapping: dict[str, int | None] | None = None,
    header: bool | None = None,
) -> tuple[CsvRead, set[int]]:
    """Parsed CSV plus the row numbers that are already stored (shown as skipped in the UI)."""
    require_account(db, account_id)
    if len(content) > MAX_CSV_BYTES:
        raise Invalid("Filen er for stor (maks 5 MB).")
    parsed = read_csv(content, mapping, header)
    _, duplicates = _split_duplicates(db, account_id, [r for r in parsed.rows if not r.error])
    return parsed, {r.row_number for r in duplicates}


def commit_import(db: Session, account_id: UUID, rows: Sequence[ParsedRow]) -> ImportResult:
    require_account(db, account_id)
    new, duplicates = _split_duplicates(db, account_id, [r for r in rows if not r.error])
    if not new:
        return ImportResult(0, len(duplicates))

    merchants: dict[str, Merchant] = {}
    categories: dict[str, Category] = {}

    def merchant_for(name: str) -> Merchant:
        if name not in merchants:
            merchant = db.scalars(select(Merchant).where(Merchant.name == name)).first()
            if not merchant:
                merchant = Merchant(name=name, normalized_name=name.casefold())
                db.add(merchant)
                db.flush()
            merchants[name] = merchant
        return merchants[name]

    def category_for(name: str) -> Category:
        if name not in categories:
            category = db.scalars(select(Category).where(Category.name == name)).first()
            if not category:
                category = Category(name=name)
                db.add(category)
                db.flush()
            categories[name] = category
        return categories[name]

    for row in new:
        merchant_name = (row.merchant or row.description).strip()
        if not merchant_name:
            raise Invalid(f"Rad {row.row_number}: beskrivelse mangler.")
        category = category_for(row.category) if row.category else None

        tx = Transaction(
            account_id=account_id,
            merchant_id=merchant_for(merchant_name).id,
            category_id=category.id if category else None,
            posted_at=row.posted_at,
            description=row.description,
            amount=row.amount,
            currency=row.currency,
            is_transfer=row.is_transfer,
            classification_confidence=row.confidence,
        )
        if row.ownership:
            tx.allocations.append(Allocation(ownership=row.ownership, percentage=Decimal("100")))
        db.add(tx)

    db.commit()
    return ImportResult(len(new), len(duplicates))
