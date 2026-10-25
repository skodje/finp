# Husøkonomi

Family finance application focused on automatic classification of household vs private spending.

## Stack

- Backend: Python 3.13+, FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, pytest, Ruff
- Frontend: React + TypeScript + Vite
- Local infrastructure: Docker Compose

## Run locally

Start the pieces in this order (three terminals, or run the database detached).

### 1. Database

```bash
docker compose up db -d
```

### 2. Backend

```bash
cd backend
uv sync
uv run alembic upgrade head      # re-run after pulling: new migrations are added over time
uv run uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

Optional sample data (two people, one card, a few transactions; does nothing if data exists):

```bash
uv run python seed.py
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173. It talks to `http://localhost:8000/api` by default; set
`VITE_API_URL` to point elsewhere.

### First use

1. **Kontoer** → add a person and an account or card.
2. **Importer** → pick the account, upload a CSV (needs date, description and amount columns;
   Norwegian or English headers, `,` `;` or tab separated). Check the preview, then import.
   Rows already stored for that account (same date, description and amount) are skipped, so
   overlapping exports are safe to upload.
3. **+ Transaksjon** adds a single transaction by hand.

## Run everything in Docker

```bash
docker compose up --build
```

Starts Postgres and the backend (migrations run on container start) on port 8000. The frontend
is not containerised, so run it with `npm run dev` as above.

## Tests and checks

```bash
cd backend
uv run pytest            # uses in-memory SQLite, no database needed
uv run ruff check .
uv run ruff format .

cd frontend
npm run build            # production build (also the only compile check; there is no tsc step yet)
npm run format:check
```

## Configuration

Backend settings come from environment variables or `backend/.env`:

| Variable       | Default                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL` | `postgresql+psycopg://family:family@localhost:5432/family_finance`       |
| `CORS_ORIGINS` | `http://localhost:5173` (comma separated)                                |

There is no authentication. Run it locally or behind something that provides it.

## Architecture

The transaction model deliberately separates who paid (`Account.owner`) from who the
transaction belongs to (`Allocation`). This lets a transaction paid by person 1 be 100%
common, private to person 1, or split between people. Rules and confidence are
first-class concepts so bank integrations can later feed the same normalized transaction
pipeline.

### Backend layout

```
backend/app/
  domain/     Pure Python: enums, errors, classification rules, CSV parsing. No FastAPI/SQLAlchemy.
  services/   Use cases that talk to the DB (accounts, transactions, imports).
  db/         SQLAlchemy session and ORM models.
  api/        FastAPI routes (thin), request/response schemas, dependencies.
  core/       Settings.
```

Dependencies point inward: `api` → `services` → `domain`, and `db` implements storage for
`services`. Services raise `domain.errors` exceptions; `main.py` turns them into 404/400 responses.

### Frontend layout

```
frontend/src/
  App.tsx        State and layout
  api.ts         All backend calls and error handling
  types.ts       API types
  format.ts      Formatting helpers
  components/    Modals, month bar, grouped transaction list, etc.
```
