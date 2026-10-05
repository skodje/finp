# Husøkonomi

Family finance application focused on automatic classification of household vs private spending.

## Stack

- Backend: Python 3.13, FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, pytest, Ruff
- Frontend: React + TypeScript + Vite
- Local infrastructure: Docker Compose

## Run backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API: http://localhost:8000/docs

## Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

## Run database

```bash
docker compose up db -d
```

## Architecture

The transaction model deliberately separates who paid (`Account.owner`) from who the
transaction belongs to (`Allocation`). This lets a transaction paid by person 1 be 100%
common, private to person 1, or split between people. Rules and confidence are
first-class concepts so bank integrations can later feed the same normalized transaction
pipeline.
