from datetime import date
from decimal import Decimal

from app.db.session import Base, SessionLocal, engine
from app.models.entities import Account, AccountType, Allocation, Category, Merchant, Ownership, Person, Transaction
from app.services.classification import classify

Base.metadata.create_all(engine)

db = SessionLocal()
try:
    if db.query(Person).count() == 0:
        ole = Person(name="Ole")
        mari = Person(name="Mari")
        db.add_all([ole, mari])
        db.flush()
        account = Account(name="Amex Ole", type=AccountType.CREDIT_CARD, owner_id=ole.id)
        db.add(account)
        categories = {name: Category(name=name) for name in ["Mat", "Barn", "Bil", "Hus"]}
        db.add_all(categories.values())
        db.flush()
        samples = [
            ("REMA 1000", "1284.00", "Mat"),
            ("Circle K lading", "420.00", "Bil"),
            ("Elkjøp", "4999.00", "Hus"),
            ("XXL", "1240.00", "Barn"),
        ]
        for merchant_name, amount, category_name in samples:
            merchant = Merchant(name=merchant_name, normalized_name=merchant_name.casefold())
            db.add(merchant)
            db.flush()
            result = classify(merchant_name)
            tx = Transaction(account_id=account.id, merchant_id=merchant.id, category_id=categories[category_name].id,
                             posted_at=date.today(), description=merchant_name, amount=Decimal(amount),
                             classification_confidence=result.confidence if result else Decimal("0.63"))
            db.add(tx)
            db.flush()
            db.add(Allocation(transaction_id=tx.id, ownership=Ownership.COMMON if result else Ownership.PRIVATE,
                              person_id=None, percentage=Decimal("100")))
        db.commit()
        print("Seeded sample household data")
    else:
        print("Database already contains data; nothing changed")
finally:
    db.close()
