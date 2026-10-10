FROM python:3.13-slim

WORKDIR /app

ENV PYTHONPATH=/app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

RUN useradd --system app
USER app

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
