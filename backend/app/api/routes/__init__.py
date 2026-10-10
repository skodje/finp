from fastapi import APIRouter

from app.api.routes import accounts, imports, transactions

router = APIRouter(prefix="/api")
router.include_router(accounts.router)
router.include_router(transactions.router)
router.include_router(imports.router)


@router.get("/health")
def health():
    return {"status": "ok"}
