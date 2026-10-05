from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.schemas import ClassificationUpdate, TransactionCreate, TransactionRead
from app.db.session import SessionLocal
from app.models.entities import Account, Allocation, Category, Merchant, Ownership, Transaction

router = APIRouter(prefix="/api")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize(tx: Transaction) -> TransactionRead:
    allocation = tx.allocations[0] if tx.allocations else None
    return TransactionRead(
        id=tx.id,
        posted_at=tx.posted_at,
        description=tx.description,
        amount=tx.amount,
        currency=tx.currency,
        merchant=tx.merchant.name if tx.merchant else None,
        category=tx.category.name if tx.category else None,
        ownership=allocation.ownership.value if allocation else None,
        confidence=tx.classification_confidence,
        account=tx.account.name,
        owner=tx.account.owner.name if tx.account.owner else None,
    )


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(db: Session = Depends(get_db)):
    query = (
        select(Transaction)
        .options(
            joinedload(Transaction.account).joinedload(Account.owner),
            joinedload(Transaction.merchant),
            joinedload(Transaction.category),
            joinedload(Transaction.allocations),
        )
        .order_by(Transaction.posted_at.desc())
    )
    return [serialize(tx) for tx in db.scalars(query).unique().all()]


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    account = db.get(Account, payload.account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    tx = Transaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx = (
        db.scalars(
            select(Transaction)
            .options(
                joinedload(Transaction.account).joinedload(Account.owner),
                joinedload(Transaction.merchant),
                joinedload(Transaction.category),
                joinedload(Transaction.allocations),
            )
            .where(Transaction.id == tx.id)
        )
        .unique()
        .one()
    )
    return serialize(tx)


@router.patch("/transactions/{transaction_id}/classification", response_model=TransactionRead)
def classify(transaction_id: UUID, payload: ClassificationUpdate, db: Session = Depends(get_db)):
    tx = db.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    tx.allocations.clear()
    tx.allocations.append(
        Allocation(
            ownership=Ownership(payload.ownership),
            person_id=payload.person_id,
            percentage=Decimal("100"),
        )
    )
    if payload.category_id:
        tx.category_id = payload.category_id
    tx.classification_confidence = Decimal("1.0000")
    db.commit()
    db.refresh(tx)
    tx = (
        db.scalars(
            select(Transaction)
            .options(
                joinedload(Transaction.account).joinedload(Account.owner),
                joinedload(Transaction.merchant),
                joinedload(Transaction.category),
                joinedload(Transaction.allocations),
            )
            .where(Transaction.id == tx.id)
        )
        .unique()
        .one()
    )
    return serialize(tx)
