import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.schemas import (
    ClassificationUpdate,
    CsvImportRequest,
    CsvImportResponse,
    CsvPreviewResponse,
    CsvPreviewRow,
    TransactionCreate,
    TransactionRead,
)
from app.db.session import SessionLocal
from app.models.entities import (
    Account,
    Allocation,
    Category,
    Merchant,
    MonthlyPeriod,
    Ownership,
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


def transaction_query():
    return (
        select(Transaction)
        .options(
            joinedload(Transaction.account).joinedload(Account.owner),
            joinedload(Transaction.merchant),
            joinedload(Transaction.category),
            joinedload(Transaction.allocations),
        )
        .order_by(Transaction.posted_at.desc())
    )


def parse_date(value: str) -> date:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return (
                date.fromisoformat(value)
                if fmt == "%Y-%m-%d"
                else datetime.strptime(value, fmt).date()
            )
        except ValueError:
            continue
    raise ValueError(f"Ugyldig dato: {value}")


def parse_amount(value: str) -> Decimal:
    normalized = value.strip().replace(" ", "").replace("NOK", "").replace("kr", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    else:
        normalized = normalized.replace(",", ".")
    return Decimal(normalized)


def find_column(fieldnames: list[str], *names: str) -> str | None:
    normalized = {field.strip().casefold(): field for field in fieldnames}
    for name in names:
        if name.casefold() in normalized:
            return normalized[name.casefold()]
    return None


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.scalars(select(Account).options(joinedload(Account.owner))).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type.value,
            "owner": a.owner.name if a.owner else None,
        }
        for a in accounts
    ]


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(db: Session = Depends(get_db)):
    query = transaction_query()
    return [serialize(tx) for tx in db.scalars(query).unique().all()]


@router.post("/transactions", response_model=TransactionRead, status_code=201)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    account = db.get(Account, payload.account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    tx = Transaction(**payload.model_dump())
    db.add(tx)
    db.commit()
    tx = db.scalars(transaction_query().where(Transaction.id == tx.id)).unique().one()
    return serialize(tx)


@router.patch("/transactions/{transaction_id}/classification", response_model=TransactionRead)
def classify_transaction(
    transaction_id: UUID, payload: ClassificationUpdate, db: Session = Depends(get_db)
):
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
    tx = db.scalars(transaction_query().where(Transaction.id == tx.id)).unique().one()
    return serialize(tx)


@router.post("/imports/csv/preview", response_model=CsvPreviewResponse)
async def preview_csv(
    account_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Filen må være en CSV-fil")
    if not db.get(Account, account_id):
        raise HTTPException(404, "Account not found")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise HTTPException(400, "CSV-filen mangler kolonneoverskrifter")

    date_col = find_column(reader.fieldnames, "date", "dato", "posted_at", "bokføringsdato")
    description_col = find_column(
        reader.fieldnames, "description", "beskrivelse", "tekst", "text", "merchant"
    )
    amount_col = find_column(reader.fieldnames, "amount", "beløp", "belop", "sum")
    currency_col = find_column(reader.fieldnames, "currency", "valuta")
    if not date_col or not description_col or not amount_col:
        raise HTTPException(
            400,
            "Fant ikke nødvendige kolonner. CSV må ha dato, beskrivelse og beløp.",
        )

    rows: list[CsvPreviewRow] = []
    for row_number, row in enumerate(reader, start=2):
        try:
            posted_at = parse_date(row.get(date_col, ""))
            amount = parse_amount(row.get(amount_col, ""))
            description = (row.get(description_col) or "").strip()
            if not description:
                raise ValueError("Mangler beskrivelse")
            result = classify(description)
            rows.append(
                CsvPreviewRow(
                    row_number=row_number,
                    posted_at=posted_at,
                    description=description,
                    amount=amount,
                    currency=(row.get(currency_col) or "NOK").strip() if currency_col else "NOK",
                    merchant=description,
                    category=result.category if result else None,
                    ownership=result.ownership if result else None,
                    confidence=result.confidence if result else None,
                    account_id=account_id,
                )
            )
        except (ValueError, InvalidOperation) as exc:
            rows.append(
                CsvPreviewRow(
                    row_number=row_number,
                    posted_at=date.today(),
                    description=(row.get(description_col) or "").strip(),
                    amount=Decimal("0"),
                    account_id=account_id,
                    merchant=(row.get(description_col) or "").strip(),
                    error=str(exc),
                )
            )

    return CsvPreviewResponse(
        filename=file.filename,
        total_rows=len(rows),
        valid_rows=sum(row.error is None for row in rows),
        error_rows=sum(row.error is not None for row in rows),
        rows=rows,
    )


@router.post("/imports/csv", response_model=CsvImportResponse)
def import_csv(payload: CsvImportRequest, db: Session = Depends(get_db)):
    if not db.get(Account, payload.account_id):
        raise HTTPException(404, "Account not found")

    imported_ids: list[UUID] = []
    skipped = 0
    categories = {c.name.casefold(): c for c in db.scalars(select(Category)).all()}
    merchants = {m.normalized_name: m for m in db.scalars(select(Merchant)).all()}

    for row in payload.rows:
        if row.error:
            skipped += 1
            continue
        normalized = row.merchant.casefold().strip()
        merchant = merchants.get(normalized)
        if merchant is None:
            merchant = Merchant(name=row.merchant, normalized_name=normalized)
            db.add(merchant)
            db.flush()
            merchants[normalized] = merchant

        category = categories.get(row.category.casefold()) if row.category else None
        period = db.scalar(
            select(MonthlyPeriod).where(
                MonthlyPeriod.year == row.posted_at.year, MonthlyPeriod.month == row.posted_at.month
            )
        )
        if period is None:
            period = MonthlyPeriod(year=row.posted_at.year, month=row.posted_at.month)
            db.add(period)
            db.flush()

        tx = Transaction(
            account_id=payload.account_id,
            period_id=period.id,
            merchant_id=merchant.id,
            category_id=category.id if category else None,
            posted_at=row.posted_at,
            description=row.description,
            amount=row.amount,
            currency=row.currency,
            classification_confidence=row.confidence,
        )
        db.add(tx)
        db.flush()
        if row.ownership:
            db.add(
                Allocation(
                    transaction_id=tx.id,
                    ownership=Ownership(row.ownership),
                    percentage=Decimal("100"),
                )
            )
        imported_ids.append(tx.id)

    db.commit()
    return CsvImportResponse(
        imported=len(imported_ids), skipped=skipped, transaction_ids=imported_ids
    )
