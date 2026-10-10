from enum import Enum


class Ownership(str, Enum):
    COMMON = "common"
    PRIVATE = "private"


class AccountType(str, Enum):
    BANK = "bank"
    CREDIT_CARD = "credit_card"
