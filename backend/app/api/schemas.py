from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.db.models import Account, Transaction
from app.domain.enums import AccountType, Ownership

Name100 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Name120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


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
            ownership=allocation.ownership.value if allocation else None,
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


class PersonRead(BaseModel):
    id: UUID
    name: str


class PersonCreate(BaseModel):
    name: Name100


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
    rows: list[ImportRow]


class ImportResultRead(BaseModel):
    imported: int
    skipped_duplicates: int
