from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Account, Allocation, Category, Person, Transaction
from app.domain.enums import Ownership
from app.domain.errors import NotFound
from app.services.accounts import require_account


def _query():
    return (
        select(Transaction)
        .options(
            joinedload(Transaction.account).joinedload(Account.owner),
            joinedload(Transaction.merchant),
            joinedload(Transaction.category),
            joinedload(Transaction.allocations),
        )
        # fresh relationships even if the object is already in the session
        .execution_options(populate_existing=True)
    )


def list_transactions(db: Session) -> list[Transaction]:
    return list(db.scalars(_query().order_by(Transaction.posted_at.desc())).unique())


def load_transaction(db: Session, transaction_id: UUID) -> Transaction:
    tx = db.scalars(_query().where(Transaction.id == transaction_id)).unique().first()
    if not tx:
        raise NotFound("Transaksjon ikke funnet")
    return tx


def create_transaction(
    db: Session,
    account_id: UUID,
    posted_at: date,
    description: str,
    amount: Decimal,
    currency: str,
) -> Transaction:
    require_account(db, account_id)
    tx = Transaction(
        account_id=account_id,
        posted_at=posted_at,
        description=description,
        amount=amount,
        currency=currency,
    )
    db.add(tx)
    db.commit()
    return load_transaction(db, tx.id)


def update_classification(
    db: Session,
    transaction_id: UUID,
    ownership: Ownership,
    person_id: UUID | None,
    category_id: UUID | None,
) -> Transaction:
    tx = load_transaction(db, transaction_id)
    if person_id and not db.get(Person, person_id):
        raise NotFound("Person ikke funnet")
    if category_id and not db.get(Category, category_id):
        raise NotFound("Kategori ikke funnet")

    tx.allocations.clear()
    tx.allocations.append(
        Allocation(ownership=ownership, person_id=person_id, percentage=Decimal("100"))
    )
    if category_id:
        tx.category_id = category_id
    tx.classification_confidence = Decimal("1.0000")
    db.commit()
    return load_transaction(db, transaction_id)
