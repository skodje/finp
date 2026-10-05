from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Ownership(str, Enum):
    COMMON = "common"
    PRIVATE = "private"


class AccountType(str, Enum):
    BANK = "bank"
    CREDIT_CARD = "credit_card"


class Person(Base):
    __tablename__ = "persons"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[AccountType] = mapped_column(SAEnum(AccountType), nullable=False)
    owner_id: Mapped[UUID | None] = mapped_column(ForeignKey("persons.id"))
    owner: Mapped[Person | None] = relationship()


class Merchant(Base):
    __tablename__ = "merchants"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    merchant_id: Mapped[UUID | None] = mapped_column(ForeignKey("merchants.id"))
    category_id: Mapped[UUID | None] = mapped_column(ForeignKey("categories.id"))
    posted_at: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="NOK", nullable=False)
    classification_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped[Account] = relationship()
    merchant: Mapped[Merchant | None] = relationship()
    category: Mapped[Category | None] = relationship()
    allocations: Mapped[list[Allocation]] = relationship(back_populates="transaction", cascade="all, delete-orphan")


class Allocation(Base):
    __tablename__ = "allocations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    transaction_id: Mapped[UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False)
    person_id: Mapped[UUID | None] = mapped_column(ForeignKey("persons.id"))
    ownership: Mapped[Ownership] = mapped_column(SAEnum(Ownership), nullable=False)
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    transaction: Mapped[Transaction] = relationship(back_populates="allocations")
    person: Mapped[Person | None] = relationship()


class Rule(Base):
    __tablename__ = "rules"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    merchant_pattern: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    category_id: Mapped[UUID | None] = mapped_column(ForeignKey("categories.id"))
    ownership: Mapped[Ownership] = mapped_column(SAEnum(Ownership), nullable=False)
    person_id: Mapped[UUID | None] = mapped_column(ForeignKey("persons.id"))
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.90"))
