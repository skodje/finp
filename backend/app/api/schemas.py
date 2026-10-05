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
