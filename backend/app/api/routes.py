import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.schemas import (
    AccountCreate,
    CsvImportRequest,
    ImportPreviewRead,
    ImportRow,
    AccountRead,
    ClassificationUpdate,
    PersonCreate,
    PersonRead,
    TransactionCreate,
    TransactionRead,
)
from app.db.session import SessionLocal
from app.models.entities import (
    Account,
    AccountType,
    Allocation,
    Category,
    Merchant,
    Ownership,
    Person,
    Transaction,
)
from app.services.classification import classify

router = APIRouter(prefix="/api")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize(tx: Transaction) -> TransactionRead:
    allocation = tx.allocations[0] if tx.allocations else None
    return TransactionRead(
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


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/persons", response_model=list[PersonRead])
def list_persons(db: Session = Depends(get_db)):
    return db.scalars(select(Person).order_by(Person.name)).all()


@router.post("/persons", response_model=PersonRead, status_code=201)
def create_person(payload: PersonCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Person name is required")

    existing = db.scalars(select(Person).where(Person.name == name)).first()
    if existing:
        return existing

    person = Person(name=name)
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@router.get("/accounts", response_model=list[AccountRead])
def list_accounts(db: Session = Depends(get_db)):
    accounts = (
        db.scalars(select(Account).options(joinedload(Account.owner)).order_by(Account.name))
        .unique()
        .all()
    )
    return [
        AccountRead(
            id=account.id,
            name=account.name,
            type=account.type.value,
            owner_id=account.owner_id,
            owner=account.owner.name if account.owner else None,
        )
        for account in accounts
    ]


@router.post("/accounts", response_model=AccountRead, status_code=201)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Account name is required")

    try:
        account_type = AccountType(payload.type)
    except ValueError as exc:
        raise HTTPException(400, "Invalid account type") from exc

    owner = db.get(Person, payload.owner_id) if payload.owner_id else None
    if payload.owner_id and not owner:
        raise HTTPException(404, "Person not found")

    account = Account(name=name, type=account_type, owner_id=payload.owner_id)
    db.add(account)
    db.commit()
    db.refresh(account)

    return AccountRead(
        id=account.id,
        name=account.name,
        type=account.type.value,
        owner_id=account.owner_id,
        owner=owner.name if owner else None,
    )


def _parse_date(value: str) -> date:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Ugyldig dato: {value}")


def _parse_amount(value: str) -> Decimal:
    value = value.strip().replace("\u00a0", "").replace(" ", "")
    if not value:
        raise ValueError("Beløp mangler")
    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        value = value.replace(",", ".")
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"Ugyldig beløp: {value}") from exc


def _pick(row: dict[str, str], *names: str) -> str:
    normalized = {str(k).strip().casefold(): (v or "") for k, v in row.items()}
    for name in names:
        if name.casefold() in normalized:
            return normalized[name.casefold()].strip()
    return ""


def _csv_rows(content: bytes, account_id: UUID) -> list[ImportRow]:
    text = content.decode("utf-8-sig")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel()

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise HTTPException(400, "CSV-filen mangler kolonneoverskrift.")

    rows: list[ImportRow] = []
    for row_number, raw in enumerate(reader, start=2):
        date_value = _pick(raw, "date", "dato", "posted_at", "bokføringsdato", "transaksjonsdato")
        description = _pick(raw, "description", "beskrivelse", "tekst", "details", "transaction")
        amount_value = _pick(raw, "amount", "beløp", "belop", "sum")
        currency = _pick(raw, "currency", "valuta") or "NOK"
        error = None
        try:
            posted_at = _parse_date(date_value)
            amount = _parse_amount(amount_value)
            if not description:
                raise ValueError("Beskrivelse mangler")
        except ValueError as exc:
            posted_at = date.today()
            amount = Decimal("0")
            error = str(exc)

        classification = classify(description)
        rows.append(
            ImportRow(
                row_number=row_number,
                posted_at=posted_at,
                description=description,
                amount=amount,
                currency=currency[:3].upper(),
                merchant=description,
                category=classification.category if classification else None,
                ownership=classification.ownership if classification else None,
                confidence=classification.confidence if classification else None,
                account_id=account_id,
                error=error,
            )
        )
    return rows


@router.post("/imports/csv/preview", response_model=ImportPreviewRead)
async def preview_csv(
    account_id: UUID = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not db.get(Account, account_id):
        raise HTTPException(404, "Account not found")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Last opp en CSV-fil.")

    rows = _csv_rows(await file.read(), account_id)
    return ImportPreviewRead(
        filename=file.filename,
        total_rows=len(rows),
        valid_rows=sum(1 for row in rows if row.error is None),
        error_rows=sum(1 for row in rows if row.error is not None),
        rows=rows,
    )


@router.post("/imports/csv")
def import_csv(payload: CsvImportRequest, db: Session = Depends(get_db)):
    if not db.get(Account, payload.account_id):
        raise HTTPException(404, "Account not found")

    imported = 0
    for row in payload.rows:
        if row.error:
            continue

        merchant_name = (row.merchant or row.description).strip()
        merchant = db.scalars(select(Merchant).where(Merchant.name == merchant_name)).first()
        if not merchant:
            merchant = Merchant(name=merchant_name, normalized_name=merchant_name.casefold())
            db.add(merchant)
            db.flush()

        category = None
        if row.category:
            category = db.scalars(select(Category).where(Category.name == row.category)).first()
            if not category:
                category = Category(name=row.category)
                db.add(category)
                db.flush()

        tx = Transaction(
            account_id=payload.account_id,
            merchant_id=merchant.id,
            category_id=category.id if category else None,
            posted_at=row.posted_at,
            description=row.description,
            amount=row.amount,
            currency=row.currency,
            classification_confidence=row.confidence,
        )
        if row.ownership:
            tx.allocations.append(
                Allocation(
                    ownership=Ownership(row.ownership),
                    percentage=Decimal("100"),
                )
            )
        db.add(tx)
        imported += 1

    db.commit()
    return {"imported": imported}


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(db: Session = Depends(get_db)):
    query = (
        select(Transaction)
        .options(
            joinedload(Transaction.account).joinedload(Account.owner),
            joinedload(Transaction.merchant),
            joinedload(Transaction.category),
            joinedload(Transaction.allocations),
        )
        .order_by(Transaction.posted_at.desc())
    )
    return [serialize(tx) for tx in db.scalars(query).unique().all()]


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    account = db.get(Account, payload.account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    tx = Transaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    tx = (
        db.scalars(
            select(Transaction)
            .options(
                joinedload(Transaction.account).joinedload(Account.owner),
                joinedload(Transaction.merchant),
                joinedload(Transaction.category),
                joinedload(Transaction.allocations),
            )
            .where(Transaction.id == tx.id)
        )
        .unique()
        .one()
    )
    return serialize(tx)


@router.patch("/transactions/{transaction_id}/classification", response_model=TransactionRead)
def classify(transaction_id: UUID, payload: ClassificationUpdate, db: Session = Depends(get_db)):
    tx = db.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    tx.allocations.clear()
    tx.allocations.append(
        Allocation(
            ownership=Ownership(payload.ownership),
            person_id=payload.person_id,
            percentage=Decimal("100"),
        )
    )
    if payload.category_id:
        tx.category_id = payload.category_id
    tx.classification_confidence = Decimal("1.0000")
    db.commit()
    db.refresh(tx)
    tx = (
        db.scalars(
            select(Transaction)
            .options(
                joinedload(Transaction.account).joinedload(Account.owner),
                joinedload(Transaction.merchant),
                joinedload(Transaction.category),
                joinedload(Transaction.allocations),
            )
            .where(Transaction.id == tx.id)
        )
        .unique()
        .one()
    )
    return serialize(tx)
