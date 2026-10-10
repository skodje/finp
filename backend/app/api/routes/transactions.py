from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import ClassificationUpdate, TransactionCreate, TransactionRead
from app.services import transactions as svc

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
