from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import (
    ClassificationUpdate,
    Settlement,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)
from app.services import transactions as svc
from app.services import settlement as settle_svc

router = APIRouter()


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(db: Session = Depends(get_db)):
    return [TransactionRead.from_tx(tx) for tx in svc.list_transactions(db)]


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    return TransactionRead.from_tx(svc.create_transaction(db, **payload.model_dump()))


@router.patch("/transactions/{transaction_id}/classification", response_model=TransactionRead)
def update_classification(
    transaction_id: UUID, payload: ClassificationUpdate, db: Session = Depends(get_db)
):
    tx = svc.update_classification(
        db, transaction_id, payload.ownership, payload.person_id, payload.category_id
    )
    return TransactionRead.from_tx(tx)


@router.patch("/transactions/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: UUID, payload: TransactionUpdate, db: Session = Depends(get_db)
):
    return TransactionRead.from_tx(
        svc.update_transaction(db, transaction_id, **payload.model_dump())
    )


@router.get("/settlement", response_model=Settlement)
def settlement(month: str, db: Session = Depends(get_db)):
    return settle_svc.get_settlement(db, month)


@router.post("/settlement", response_model=Settlement, status_code=201)
def mark_settled(month: str, db: Session = Depends(get_db)):
    return settle_svc.mark_settled(db, month)


@router.delete("/settlement", status_code=204)
def undo_settled(month: str, db: Session = Depends(get_db)):
    settle_svc.undo_settled(db, month)


@router.get("/settlements", response_model=list[Settlement])
def settlement_history(db: Session = Depends(get_db)):
    return settle_svc.history(db)
