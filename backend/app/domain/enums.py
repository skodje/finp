from enum import Enum


class Ownership(str, Enum):
    COMMON = "common"
    PRIVATE = "private"


class AccountType(str, Enum):
    BANK = "bank"
    CREDIT_CARD = "credit_card"


class ExpenseSign(str, Enum):
    """Sign used by the source CSV for outgoing expenses."""

    NEGATIVE = "negative"
    POSITIVE = "positive"
