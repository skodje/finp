from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


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


class TransactionCreate(BaseModel):
    account_id: UUID
    posted_at: date
    description: str
    amount: Decimal
    currency: str = "NOK"


class ClassificationUpdate(BaseModel):
    ownership: str
    person_id: UUID | None = None
    category_id: UUID | None = None


class PersonRead(BaseModel):
    id: UUID
    name: str


class PersonCreate(BaseModel):
    name: str


class AccountRead(BaseModel):
    id: UUID
    name: str
    type: str
    owner_id: UUID | None = None
    owner: str | None = None


class AccountCreate(BaseModel):
    name: str
    type: str
    owner_id: UUID | None = None


class ImportRow(BaseModel):
    row_number: int
    posted_at: date
    description: str
    amount: Decimal
    currency: str = "NOK"
    merchant: str = ""
    category: str | None = None
    ownership: str | None = None
    confidence: Decimal | None = None
    account_id: UUID
    error: str | None = None


class CsvImportRequest(BaseModel):
    account_id: UUID
    rows: list[ImportRow]


class ImportPreviewRead(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    error_rows: int
    rows: list[ImportRow]
