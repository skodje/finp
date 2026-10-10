from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.schemas import CsvImportRequest, ImportPreviewRead, ImportResultRead, ImportRow
from app.domain.csv_parsing import ParsedRow
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
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise Invalid("Last opp en CSV-fil.")

    content = file.file.read(svc.MAX_CSV_BYTES + 1)  # +1 so the service can detect oversize
    mapping = {"date": date_col, "description": description_col, "amount": amount_col}
    parsed, duplicates = svc.preview_csv(db, account_id, content, mapping, header)
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
