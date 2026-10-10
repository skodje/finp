from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import AccountCreate, AccountRead, PersonCreate, PersonRead
from app.services import accounts as svc

router = APIRouter()


@router.get("/persons", response_model=list[PersonRead])
def list_persons(db: Session = Depends(get_db)):
    return svc.list_persons(db)


@router.post("/persons", response_model=PersonRead, status_code=201)
def create_person(payload: PersonCreate, db: Session = Depends(get_db)):
    return svc.get_or_create_person(db, payload.name, payload.common_share)


@router.get("/accounts", response_model=list[AccountRead])
def list_accounts(db: Session = Depends(get_db)):
    return [AccountRead.from_account(a) for a in svc.list_accounts(db)]


@router.post("/accounts", response_model=AccountRead, status_code=201)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    return AccountRead.from_account(
        svc.create_account(db, payload.name, payload.type, payload.owner_id)
    )


@router.patch("/persons/{person_id}", response_model=PersonRead)
def rename_person(person_id: UUID, payload: PersonCreate, db: Session = Depends(get_db)):
    return svc.rename_person(db, person_id, payload.name, payload.common_share)


@router.patch("/accounts/{account_id}", response_model=AccountRead)
def update_account(account_id: UUID, payload: AccountCreate, db: Session = Depends(get_db)):
    return AccountRead.from_account(
        svc.update_account(db, account_id, payload.name, payload.type, payload.owner_id)
    )
