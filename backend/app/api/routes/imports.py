from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import CsvImportRequest, ImportPreviewRead, ImportResultRead, ImportRow
from app.domain.csv_parsing import ParsedRow
from app.domain.enums import ExpenseSign
from app.domain.errors import Invalid
from app.services import imports as svc

router = APIRouter()


# Sync handlers on purpose: they do blocking DB work, FastAPI runs them in a threadpool.
@router.post("/imports/csv/preview", response_model=ImportPreviewRead)
def preview_csv(
    account_id: UUID = Query(...),
    date_col: int | None = Query(None),
    description_col: int | None = Query(None),
    amount_col: int | None = Query(None),
    header: bool | None = Query(None),
    expense_sign: ExpenseSign | None = Query(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise Invalid("Velg en CSV- eller XLSX-fil.")
    suffix = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if suffix not in {"csv", "xlsx"}:
        raise Invalid("Last opp en CSV- eller XLSX-fil.")

    content = file.file.read(svc.MAX_CSV_BYTES + 1)  # +1 so the service can detect oversize
    if len(content) > svc.MAX_CSV_BYTES:
        raise Invalid("Filen er for stor (maks 5 MB).")
    if suffix == "xlsx":
        from app.domain.csv_parsing import xlsx_to_csv

        content = xlsx_to_csv(content)
        if len(content) > svc.MAX_CSV_BYTES:
            raise Invalid("Excel-filen er for stor etter konvertering (maks 5 MB).")
    mapping = {"date": date_col, "description": description_col, "amount": amount_col}
    parsed, duplicates = svc.preview_csv(db, account_id, content, mapping, header, expense_sign)
    rows = parsed.rows
    errors = sum(1 for r in rows if r.error is not None)
    return ImportPreviewRead(
        filename=file.filename,
        total_rows=len(rows),
        valid_rows=len(rows) - errors - len(duplicates),  # rows that will actually be added
        duplicate_rows=len(duplicates),
        error_rows=errors,
        columns=parsed.columns,
        mapping=parsed.mapping,
        has_header=parsed.has_header,
        rows=[
            ImportRow(account_id=account_id, duplicate=r.row_number in duplicates, **asdict(r))
            for r in rows
        ],
    )


@router.post("/imports/csv", response_model=ImportResultRead)
def import_csv(payload: CsvImportRequest, db: Session = Depends(get_db)):
    rows = [ParsedRow(**r.model_dump(exclude={"account_id", "duplicate"})) for r in payload.rows]
    result = svc.commit_import(db, payload.account_id, rows)
    return ImportResultRead(imported=result.imported, skipped_duplicates=result.skipped_duplicates)
