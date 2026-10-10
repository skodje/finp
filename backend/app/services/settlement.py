import json
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Person, SettledMonth, Transaction
from app.domain.enums import Ownership
from app.domain.errors import Invalid
from app.services.transactions import _query

CENT = Decimal("0.01")


def settle(db: Session, month: str) -> dict:
    """Who owes whom for `month` (YYYY-MM).

    Payer = owner of the account the money left. Common spend is split between all people by
    their `common_share` (equal by default); private spend belongs to its person (or the payer if none). Transfers are ignored,
    as is spend on ownerless (joint) accounts: nobody fronted it.
    """
    try:
        start = date.fromisoformat(f"{month}-01")
    except ValueError:
        raise Invalid("Ugyldig måned.") from None
    end = date(start.year + start.month // 12, start.month % 12 + 1, 1)

    persons = list(db.scalars(select(Person)))
    people = {p.id: p.name for p in persons}
    total_share = sum((p.common_share for p in persons), Decimal(0))
    balance: dict = defaultdict(Decimal)
    unclassified = 0
    txs = db.scalars(
        _query().where(
            Transaction.posted_at >= start,
            Transaction.posted_at < end,
            Transaction.is_transfer.is_(False),
        )
    ).unique()
    for tx in txs:
        payer = tx.account.owner_id
        if payer is None:
            continue
        if not tx.allocations:
            unclassified += 1
            continue
        balance[payer] += tx.amount
        for alloc in tx.allocations:  # one per slice of the cost; percentages total 100
            part = tx.amount * alloc.percentage / 100
            if alloc.ownership == Ownership.COMMON:
                for p in persons:
                    balance[p.id] -= part * p.common_share / total_share
            else:
                balance[alloc.person_id or payer] -= part

    balance = {pid: balance[pid].quantize(CENT) for pid in people}
    # greedy: largest debtor pays largest creditor
    owed = sorted(((b, p) for p, b in balance.items() if b > 0), key=lambda x: -x[0])
    debt = sorted(((-b, p) for p, b in balance.items() if b < 0), key=lambda x: -x[0])
    payments, i, j = [], 0, 0
    owed, debt = [list(x) for x in owed], [list(x) for x in debt]
    while i < len(debt) and j < len(owed):
        amount = min(debt[i][0], owed[j][0])
        if amount >= CENT:
            payments.append(
                {"from": people[debt[i][1]], "to": people[owed[j][1]], "amount": amount}
            )
        debt[i][0] -= amount
        owed[j][0] -= amount
        i += debt[i][0] < CENT
        j += owed[j][0] < CENT
    return {
        "month": month,
        "balances": {people[p]: b for p, b in balance.items()},
        "payments": payments,
        "unclassified": unclassified,
    }


def get_settlement(db: Session, month: str) -> dict:
    """The frozen result if the month was settled, otherwise the live one."""
    row = db.get(SettledMonth, month)
    if row:
        return {**row.payload, "settled_at": row.settled_at}
    return {**settle(db, month), "settled_at": None}


def mark_settled(db: Session, month: str) -> dict:
    if db.get(SettledMonth, month):
        raise Invalid("Måneden er allerede oppgjort.")
    result = settle(db, month)
    # JSON column: Decimals go in as strings, the Settlement schema parses them back
    db.add(SettledMonth(month=month, payload=json.loads(json.dumps(result, default=str))))
    db.commit()
    return get_settlement(db, month)


def undo_settled(db: Session, month: str) -> None:
    row = db.get(SettledMonth, month)
    if row:
        db.delete(row)
        db.commit()


def history(db: Session) -> list[dict]:
    rows = db.scalars(select(SettledMonth).order_by(SettledMonth.month.desc()))
    return [{**r.payload, "settled_at": r.settled_at} for r in rows]
