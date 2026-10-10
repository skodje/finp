from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.db.models import Account, Transaction
from app.domain.enums import AccountType, Ownership

Name100 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Name120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class Split(BaseModel):
    ownership: Ownership
    person_id: UUID | None = None
    percentage: Decimal = Field(gt=0, le=100)


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    posted_at: date
    description: str
    amount: Decimal
    currency: str
    merchant: str | None = None
    category: str | None = None
    ownership: str | None = None
    person_id: UUID | None = None
    splits: list[Split] = []  # only when the cost is divided; otherwise empty
    is_transfer: bool = False
    confidence: Decimal | None = None
    account: str
    owner: str | None = None

    @classmethod
    def from_tx(cls, tx: Transaction) -> TransactionRead:
        allocation = tx.allocations[0] if tx.allocations else None
        return cls(
            id=tx.id,
            posted_at=tx.posted_at,
            description=tx.description,
            amount=tx.amount,
            currency=tx.currency,
            merchant=tx.merchant.name if tx.merchant else None,
            category=tx.category.name if tx.category else None,
            ownership=(
                "split"
                if len(tx.allocations) > 1
                else allocation.ownership.value
                if allocation
                else None
            ),
            person_id=allocation.person_id if allocation else None,
            splits=[
                Split(ownership=a.ownership, person_id=a.person_id, percentage=a.percentage)
                for a in tx.allocations
            ]
            if len(tx.allocations) > 1
            else [],
            is_transfer=tx.is_transfer,
            confidence=tx.classification_confidence,
            account=tx.account.name,
            owner=tx.account.owner.name if tx.account.owner else None,
        )


class TransactionCreate(BaseModel):
    account_id: UUID
    posted_at: date
    description: str = Field(min_length=1)
    amount: Decimal
    currency: str = Field(default="NOK", min_length=3, max_length=3)


class ClassificationUpdate(BaseModel):
    ownership: Ownership
    person_id: UUID | None = None
    category_id: UUID | None = None


class TransactionUpdate(BaseModel):
    posted_at: date
    description: str = Field(min_length=1)
    amount: Decimal
    category: Name100 | None = None  # by name; created if new
    ownership: Ownership | None = None  # None = leave allocation untouched
    person_id: UUID | None = None
    splits: list[Split] | None = None  # overrides ownership/person_id; must total 100
    is_transfer: bool = False


class Settlement(BaseModel):
    month: str
    balances: dict[str, Decimal]  # person -> net (positive = is owed money)
    payments: list[dict]  # [{from, to, amount}]
    unclassified: int  # expenses skipped because ownership is unset
    settled_at: datetime | None = None


class PersonRead(BaseModel):
    id: UUID
    name: str
    common_share: Decimal


class PersonCreate(BaseModel):
    name: Name100
    common_share: Decimal = Field(default=Decimal(1), gt=0, lt=10000)


class AccountRead(BaseModel):
    id: UUID
    name: str
    type: AccountType
    owner_id: UUID | None = None
    owner: str | None = None

    @classmethod
    def from_account(cls, account: Account) -> AccountRead:
        return cls(
            id=account.id,
            name=account.name,
            type=account.type,
            owner_id=account.owner_id,
            owner=account.owner.name if account.owner else None,
        )


class AccountCreate(BaseModel):
    name: Name120
    type: AccountType
    owner_id: UUID | None = None


class ImportRow(BaseModel):
    row_number: int
    posted_at: date
    description: str
    amount: Decimal
    currency: str = Field(default="NOK", max_length=3)
    merchant: str = Field(default="", max_length=200)
    category: str | None = Field(default=None, max_length=100)
    ownership: Ownership | None = None
    confidence: Decimal | None = None
    account_id: UUID
    error: str | None = None
    is_transfer: bool = False
    duplicate: bool = False  # already stored for this account; skipped on import


class CsvImportRequest(BaseModel):
    account_id: UUID
    rows: list[ImportRow]


class ImportPreviewRead(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    duplicate_rows: int = 0
    error_rows: int
    columns: list[str]
    mapping: dict[str, int | None]
    has_header: bool
    rows: list[ImportRow]


class ImportResultRead(BaseModel):
    imported: int
    skipped_duplicates: int
