import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

type Tx = {
  id: string;
  posted_at: string;
  description: string;
  amount: string;
  currency: string;
  merchant: string | null;
  category: string | null;
  ownership: string | null;
  confidence: string | null;
  account: string;
  owner: string | null;
};

type PreviewRow = {
  row_number: number;
  posted_at: string;
  description: string;
  amount: string;
  currency: string;
  merchant: string;
  category: string | null;
  ownership: string | null;
  confidence: string | null;
  account_id: string;
  error: string | null;
};

type Preview = {
  filename: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  rows: PreviewRow[];
};

function money(v: string | number) {
  return (
    new Intl.NumberFormat('nb-NO', {
      maximumFractionDigits: 0,
    }).format(Number(v)) + ' kr'
  );
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function App() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [accounts, setAccounts] = useState<
    { id: string; name: string; owner: string | null }[]
  >([]);

  const fileInput = useRef<HTMLInputElement>(null);

  function loadTransactions() {
    setLoading(true);

    fetch(`${API}/transactions`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        return response.json();
      })
      .then(setTransactions)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(loadTransactions, []);

  useEffect(() => {
    fetch(`${API}/accounts`)
      .then((response) => response.json())
      .then(setAccounts)
      .catch(() => undefined);
  }, []);

  const availableMonths = [
    ...new Set(transactions.map((t) => monthKey(t.posted_at))),
  ]
    .sort()
    .reverse();

  const currentMonth =
    selectedMonth ||
    availableMonths[0] ||
    new Date().toISOString().slice(0, 7);

  const monthTransactions = transactions.filter(
    (t) => monthKey(t.posted_at) === currentMonth,
  );

  const visible = monthTransactions.filter(
    (t) =>
      filter === 'all' ||
      (filter === 'review' && Number(t.confidence ?? 1) < 0.8) ||
      (filter === 'common' && t.ownership === 'common'),
  );

  const total = monthTransactions.reduce(
    (sum, t) => sum + Number(t.amount),
    0,
  );

  const commonTotal = monthTransactions
    .filter((t) => t.ownership === 'common')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const reviewCount = monthTransactions.filter(
    (t) => Number(t.confidence ?? 1) < 0.8,
  ).length;

  async function previewCsv(file: File) {
    setImportError(null);

    const form = new FormData();
    form.append('file', file);

    const accountId = selectedAccount;

    if (!accountId) {
      throw new Error('Velg konto/kort før du laster opp CSV.');
    }

    const response = await fetch(
      `${API}/imports/csv/preview?account_id=${accountId}`,
      {
        method: 'POST',
        body: form,
      },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));

      throw new Error(
        body.detail ?? `Import preview failed (${response.status})`,
      );
    }

    setPreview(await response.json());
  }

  function updatePreviewRow(
    rowNumber: number,
    patch: Partial<PreviewRow>,
  ) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.row_number === rowNumber
                ? { ...row, ...patch }
                : row,
            ),
          }
        : current,
    );
  }

  async function confirmImport() {
    if (!preview) {
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const response = await fetch(`${API}/imports/csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: selectedAccount,
          rows: preview.rows,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));

        throw new Error(
          body.detail ?? `Import failed (${response.status})`,
        );
      }

      setPreview(null);
      setImportOpen(false);
      loadTransactions();
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Import failed',
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="app">
      <div className="shell">
        <header>
          <div className="brand">
            <div className="logo">H</div>

            <div>
              <h1>Husøkonomi</h1>
              <p>Familieoversikt · {currentMonth}</p>
            </div>
          </div>

          <div className="actions">
            <button onClick={() => setImportOpen(true)}>
              Importer CSV
            </button>

            <button className="primary">+ Transaksjon</button>
          </div>
        </header>

        <section className="monthbar">
          <button
            aria-label="Forrige måned"
            onClick={() => {
              const i = availableMonths.indexOf(currentMonth);

              if (i >= 0 && i < availableMonths.length - 1) {
                setSelectedMonth(availableMonths[i + 1]);
              }
            }}
          >
            ‹
          </button>

          <select
            id="month-select"
            name="month"
            value={currentMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Velg måned"
          >
            {availableMonths.length ? (
              availableMonths.map((month) => (
                <option key={month} value={month}>
                  {new Intl.DateTimeFormat('nb-NO', {
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(`${month}-01`))}
                </option>
              ))
            ) : (
              <option value={currentMonth}>{currentMonth}</option>
            )}
          </select>

          <button
            aria-label="Neste måned"
            onClick={() => {
              const i = availableMonths.indexOf(currentMonth);

              if (i > 0) {
                setSelectedMonth(availableMonths[i - 1]);
              }
            }}
          >
            ›
          </button>
        </section>

        <section className="hero">
          <Stat
            label="Totalt brukt"
            value={money(total)}
            note="Valgt måned"
          />

          <Stat
            label="Felles"
            value={money(commonTotal)}
            note="Klassifisert felles"
          />

          <Stat
            label="Trenger svar"
            value={String(reviewCount)}
            note="Lav confidence"
          />

          <Stat
            label="Transaksjoner"
            value={String(monthTransactions.length)}
            note="I valgt måned"
          />
        </section>

        <section className="card">
          <div className="sectionHead">
            <h2>Transaksjoner</h2>

            <div className="tabs">
              {[
                ['all', 'Alle'],
                ['review', 'Trenger svar'],
                ['common', 'Felles'],
              ].map(([key, label]) => (
                <button
                  className={filter === key ? 'active' : ''}
                  onClick={() => setFilter(key)}
                  key={key}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="muted">Laster fra backend…</p>
          ) : error ? (
            <div className="error">
              <strong>Kunne ikke hente transaksjoner</strong>
              <p>{error}</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">
              Ingen transaksjoner i denne måneden.
            </p>
          ) : (
            visible.map((transaction) => (
              <div className="row" key={transaction.id}>
                <div>
                  <strong>
                    {transaction.merchant ?? transaction.description}
                  </strong>

                  <small>
                    {transaction.posted_at} · {transaction.account}
                    {transaction.owner
                      ? ` · ${transaction.owner}`
                      : ''}
                  </small>
                </div>

                <span className="pill">
                  {transaction.ownership ?? 'Uavklart'} ·{' '}
                  {transaction.confidence
                    ? Math.round(
                        Number(transaction.confidence) * 100,
                      )
                    : 0}
                  %
                </span>

                <b>{money(transaction.amount)}</b>
              </div>
            ))
          )}
        </section>
      </div>

      {importOpen && (
        <div
          className="modalBackdrop"
          onClick={() => !importing && setImportOpen(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modalHead">
              <div>
                <h2>Importer CSV</h2>
                <p>
                  Last opp en kontoutskrift og sjekk forslagene før de
                  lagres.
                </p>
              </div>

              <button onClick={() => setImportOpen(false)}>
                ×
              </button>
            </div>

            {!preview ? (
              <>
                <div
                  className={`dropzone ${
                    !selectedAccount ? 'disabled' : ''
                  }`}
                  onClick={() =>
                    selectedAccount && fileInput.current?.click()
                  }
                >
                  <strong>Velg CSV-fil</strong>
                  <span>
                    Dato, beskrivelse og beløp er nødvendig.
                  </span>

                  <input
                    id="csv-file"
                    name="csvFile"
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(e) =>
                      e.target.files?.[0] &&
                      previewCsv(e.target.files[0]).catch((err) =>
                        setImportError(
                          err instanceof Error
                            ? err.message
                            : 'Import failed',
                        ),
                      )
                    }
                  />
                </div>

                <label className="field">
                  <span>Konto eller kredittkort</span>

                  <select
                    id="import-account"
                    name="accountId"
                    value={selectedAccount}
                    onChange={(e) =>
                      setSelectedAccount(e.target.value)
                    }
                  >
                    <option value="">Velg konto…</option>

                    {accounts.map((account) => (
                      <option
                        key={account.id}
                        value={account.id}
                      >
                        {account.name}
                        {account.owner
                          ? ` · ${account.owner}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <div className="importSummary">
                  <strong>
                    {preview.valid_rows} transaksjoner klare
                  </strong>

                  <span>
                    {preview.error_rows} med feil ·{' '}
                    {preview.filename}
                  </span>
                </div>

                <div className="previewTable">
                  {preview.rows
                    .slice(0, 100)
                    .map((row) => (
                      <div
                        className={`previewRow ${
                          row.error ? 'bad' : ''
                        }`}
                        key={row.row_number}
                      >
                        <span>{row.posted_at}</span>

                        <strong>
                          {row.merchant || row.description}
                        </strong>

                        <span>{money(row.amount)}</span>

                        <select
                          id={`ownership-${row.row_number}`}
                          name={`ownership-${row.row_number}`}
                          value={row.ownership ?? ''}
                          onChange={(e) =>
                            updatePreviewRow(row.row_number, {
                              ownership:
                                e.target.value || null,
                              confidence: e.target.value
                                ? '1.0000'
                                : null,
                            })
                          }
                        >
                          <option value="">Uavklart</option>
                          <option value="common">Felles</option>
                          <option value="private">Privat</option>
                        </select>

                        <select
                          id={`category-${row.row_number}`}
                          name={`category-${row.row_number}`}
                          value={row.category ?? ''}
                          onChange={(e) =>
                            updatePreviewRow(row.row_number, {
                              category:
                                e.target.value || null,
                            })
                          }
                        >
                          <option value="">Kategori</option>

                          {[
                            'Mat',
                            'Barn',
                            'Bil',
                            'Hus',
                            'Transport',
                            'Fritid',
                            'Helse',
                            'Restaurant',
                            'Annet',
                          ].map((category) => (
                            <option
                              key={category}
                              value={category}
                            >
                              {category}
                            </option>
                          ))}
                        </select>

                        {row.error && (
                          <span className="rowError">
                            {row.error}
                          </span>
                        )}
                      </div>
                    ))}
                </div>

                {preview.rows.length > 100 && (
                  <p className="muted">
                    Viser de første 100 av {preview.rows.length}{' '}
                    rader.
                  </p>
                )}

                <div className="modalActions">
                  <button
                    onClick={() => setPreview(null)}
                    disabled={importing}
                  >
                    Velg annen fil
                  </button>

                  <button
                    className="primary"
                    onClick={confirmImport}
                    disabled={
                      importing || preview.valid_rows === 0
                    }
                  >
                    {importing
                      ? 'Importerer…'
                      : `Importer ${preview.valid_rows} transaksjoner`}
                  </button>
                </div>
              </>
            )}

            {importError && (
              <div className="error">{importError}</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
