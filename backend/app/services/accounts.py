from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Account, Person
from app.domain.enums import AccountType
from app.domain.errors import Invalid, NotFound


def list_persons(db: Session) -> list[Person]:
    return list(db.scalars(select(Person).order_by(Person.name)))


def get_or_create_person(db: Session, name: str, common_share: Decimal) -> Person:
    existing = db.scalars(select(Person).where(Person.name == name)).first()
    if existing:
        return existing
    person = Person(name=name, common_share=common_share)
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


def rename_person(db: Session, person_id: UUID, name: str, common_share: Decimal) -> Person:
    person = db.get(Person, person_id)
    if not person:
        raise NotFound("Person ikke funnet")
    if db.scalars(select(Person).where(Person.name == name, Person.id != person_id)).first():
        raise Invalid("Det finnes allerede en person med det navnet.")
    person.name, person.common_share = name, common_share
    db.commit()
    return person


def update_account(
    db: Session, account_id: UUID, name: str, type: AccountType, owner_id: UUID | None
) -> Account:
    account = require_account(db, account_id)
    if owner_id and not db.get(Person, owner_id):
        raise NotFound("Person ikke funnet")
    account.name, account.type, account.owner_id = name, type, owner_id
    db.commit()
    db.refresh(account)
    return account
