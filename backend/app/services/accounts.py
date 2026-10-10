from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Account, Person
from app.domain.enums import AccountType
from app.domain.errors import NotFound


def list_persons(db: Session) -> list[Person]:
    return list(db.scalars(select(Person).order_by(Person.name)))


def get_or_create_person(db: Session, name: str) -> Person:
    existing = db.scalars(select(Person).where(Person.name == name)).first()
    if existing:
        return existing
    person = Person(name=name)
    db.add(person)
    db.commit()
    return person


def list_accounts(db: Session) -> list[Account]:
    return list(
        db.scalars(select(Account).options(joinedload(Account.owner)).order_by(Account.name))
    )


def require_account(db: Session, account_id: UUID) -> Account:
    account = db.get(Account, account_id)
    if not account:
        raise NotFound("Konto ikke funnet")
    return account


def create_account(db: Session, name: str, type: AccountType, owner_id: UUID | None) -> Account:
    if owner_id and not db.get(Person, owner_id):
        raise NotFound("Person ikke funnet")
    account = Account(name=name, type=type, owner_id=owner_id)
    db.add(account)
    db.commit()
    db.refresh(account)  # loads .owner lazily for serialization
    return account
