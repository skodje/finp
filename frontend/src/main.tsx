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

type Person = { id: string; name: string };

type Account = {
  id: string;
  name: string;
  type: 'bank' | 'credit_card';
  owner_id: string | null;
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

function money(value: string | number) {
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(value))} kr`;
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('nb-NO', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00`));
}

function accountTypeLabel(type: Account['type']) {
  return type === 'credit_card' ? 'Kredittkort' : 'Bankkonto';
}

function App() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<Account['type']>('credit_card');
  const [accountOwner, setAccountOwner] = useState('');
  const [personName, setPersonName] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPerson, setSavingPerson] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  function loadTransactions() {
    setLoading(true);
    setError(null);

    fetch(`${API}/transactions`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then(setTransactions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }

  function loadAccounts() {
    fetch(`${API}/accounts`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then(setAccounts)
      .catch((err) => console.error('Failed to load accounts:', err));
  }

  function loadPeople() {
    fetch(`${API}/persons`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then(setPeople)
      .catch((err) => console.error('Failed to load people:', err));
  }

  useEffect(() => {
    loadTransactions();
    loadAccounts();
    loadPeople();
  }, []);

  const availableMonths = [...new Set(transactions.map((tx) => monthKey(tx.posted_at)))]
    .sort()
    .reverse();
  const currentMonth = selectedMonth || availableMonths[0] || new Date().toISOString().slice(0, 7);
  const monthTransactions = transactions.filter((tx) => monthKey(tx.posted_at) === currentMonth);

  const visible = monthTransactions.filter(
    (tx) =>
      filter === 'all' ||
      (filter === 'review' && Number(tx.confidence ?? 1) < 0.8) ||
      (filter === 'common' && tx.ownership === 'common'),
  );

  const total = monthTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const commonTotal = monthTransactions
    .filter((tx) => tx.ownership === 'common')
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const reviewCount = monthTransactions.filter((tx) => Number(tx.confidence ?? 1) < 0.8).length;

  async function createPerson() {
    const name = personName.trim();
    if (!name) return;

    setSavingPerson(true);
    setAccountError(null);

    try {
      const response = await fetch(`${API}/persons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Could not create person (${response.status})`);

      const person: Person = body;
      setPeople((current) =>
        [...current.filter((item) => item.id !== person.id), person].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setAccountOwner(person.id);
      setPersonName('');
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not create person');
    } finally {
      setSavingPerson(false);
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!accountName.trim()) {
      setAccountError('Skriv inn et navn på kontoen.');
      return;
    }

    setSavingAccount(true);
    setAccountError(null);

    try {
      const response = await fetch(`${API}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: accountName.trim(),
          type: accountType,
          owner_id: accountOwner || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Could not create account (${response.status})`);

      const account: Account = body;
      setAccounts((current) =>
        [...current.filter((item) => item.id !== account.id), account].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setSelectedAccount(account.id);
      setAccountName('');
      setAccountType('credit_card');
      setAccountOwner('');
      setAccountError(null);
      setAccountModalOpen(false);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setSavingAccount(false);
    }
  }

  async function previewCsv(file: File) {
    if (!selectedAccount) {
      setImportError('Velg konto eller kort før du velger CSV-fil.');
      return;
    }

    setImportError(null);
    const form = new FormData();
    form.append('file', file);

    try {
      const response = await fetch(
        `${API}/imports/csv/preview?account_id=${encodeURIComponent(selectedAccount)}`,
        { method: 'POST', body: form },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Import preview failed (${response.status})`);
      setPreview(body);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import preview failed');
    }
  }

  function updatePreviewRow(rowNumber: number, patch: Partial<PreviewRow>) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.row_number === rowNumber ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  }

  async function confirmImport() {
    if (!preview || !selectedAccount) return;

    setImporting(true);
    setImportError(null);

    try {
      const response = await fetch(`${API}/imports/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, rows: preview.rows }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? `Import failed (${response.status})`);

      setPreview(null);
      setImportOpen(false);
      setImportError(null);
      loadTransactions();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function openImport() {
    setImportError(null);
    setPreview(null);
    setImportOpen(true);
    if (!selectedAccount && accounts.length === 1) setSelectedAccount(accounts[0].id);
  }

  function closeImport() {
    if (importing) return;
    setImportOpen(false);
    setPreview(null);
    setImportError(null);
  }

  return (
    <main className="app">
      <div className="shell">
        <header>
          <div className="brand">
            <div className="logo">H</div>
            <div>
              <h1>Husøkonomi</h1>
              <p>Familieoversikt · {monthLabel(currentMonth)}</p>
            </div>
          </div>

          <div className="actions">
            <button type="button" onClick={() => setAccountModalOpen(true)}>
              Kontoer
            </button>
            <button type="button" onClick={openImport}>
              Importer
            </button>
            <button type="button" className="primary">
              + Transaksjon
            </button>
          </div>
        </header>

        <section className="monthbar">
          <button
            type="button"
            aria-label="Forrige måned"
            onClick={() => {
              const index = availableMonths.indexOf(currentMonth);
              if (index >= 0 && index < availableMonths.length - 1) {
                setSelectedMonth(availableMonths[index + 1]);
              }
            }}
          >
            ‹
          </button>

          <select
            id="month-select"
            name="month"
            value={currentMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            aria-label="Velg måned"
          >
            {availableMonths.length ? (
              availableMonths.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))
            ) : (
              <option value={currentMonth}>{monthLabel(currentMonth)}</option>
            )}
          </select>

          <button
            type="button"
            aria-label="Neste måned"
            onClick={() => {
              const index = availableMonths.indexOf(currentMonth);
              if (index > 0) setSelectedMonth(availableMonths[index - 1]);
            }}
          >
            ›
          </button>
        </section>

        <section className="hero">
          <Stat label="Totalt brukt" value={money(total)} note="Valgt måned" />
          <Stat label="Felles" value={money(commonTotal)} note="Klassifisert felles" />
          <Stat label="Trenger svar" value={String(reviewCount)} note="Lav confidence" />
          <Stat label="Transaksjoner" value={String(monthTransactions.length)} note="I valgt måned" />
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
                  type="button"
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
              <small>API: {API}/transactions</small>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">Ingen transaksjoner i denne måneden.</p>
          ) : (
            visible.map((transaction) => (
              <div className="row" key={transaction.id}>
                <div>
                  <strong>{transaction.merchant ?? transaction.description}</strong>
                  <small>
                    {transaction.posted_at} · {transaction.account}
                    {transaction.owner ? ` · ${transaction.owner}` : ''}
                  </small>
                </div>
                <span className="pill">
                  {transaction.ownership ?? 'Uavklart'} ·{' '}
                  {transaction.confidence
                    ? Math.round(Number(transaction.confidence) * 100)
                    : 0}
                  %
                </span>
                <b>{money(transaction.amount)}</b>
              </div>
            ))
          )}
        </section>
      </div>

      {accountModalOpen && (
        <div className="modalBackdrop" onClick={() => setAccountModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHead">
              <div>
                <h2>Kontoer og kort</h2>
                <p>Opprett kontoene og kortene du vil importere transaksjoner fra.</p>
              </div>
              <button type="button" onClick={() => setAccountModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="accountList">
              {accounts.length === 0 ? (
                <p className="muted">Ingen kontoer opprettet ennå.</p>
              ) : (
                accounts.map((account) => (
                  <div className="accountRow" key={account.id}>
                    <div>
                      <strong>{account.name}</strong>
                      <span>
                        {accountTypeLabel(account.type)}
                        {account.owner ? ` · ${account.owner}` : ' · Felles'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form className="accountForm" onSubmit={createAccount}>
              <h3>Ny konto eller kort</h3>

              <label className="field">
                <span>Navn</span>
                <input
                  id="account-name"
                  name="accountName"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  placeholder="F.eks. Lars Amex"
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span>Type</span>
                <select
                  id="account-type"
                  name="accountType"
                  value={accountType}
                  onChange={(event) => setAccountType(event.target.value as Account['type'])}
                >
                  <option value="credit_card">Kredittkort</option>
                  <option value="bank">Bankkonto</option>
                </select>
              </label>

              <label className="field">
                <span>Eier</span>
                <select
                  id="account-owner"
                  name="accountOwner"
                  value={accountOwner}
                  onChange={(event) => setAccountOwner(event.target.value)}
                >
                  <option value="">Felles / ingen eier</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="newPerson">
                <label className="field">
                  <span>Ny person</span>
                  <input
                    id="person-name"
                    name="personName"
                    value={personName}
                    onChange={(event) => setPersonName(event.target.value)}
                    placeholder="F.eks. Lars"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  onClick={createPerson}
                  disabled={savingPerson || !personName.trim()}
                >
                  {savingPerson ? 'Oppretter…' : 'Legg til'}
                </button>
              </div>

              {accountError && <div className="error">{accountError}</div>}

              <div className="modalActions">
                <button type="button" onClick={() => setAccountModalOpen(false)}>
                  Avbryt
                </button>
                <button type="submit" className="primary" disabled={savingAccount}>
                  {savingAccount ? 'Lagrer…' : 'Opprett konto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modalBackdrop" onClick={closeImport}>
          <div className="modal importModal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHead">
              <div>
                <h2>Importer CSV</h2>
                <p>Velg konto, last opp CSV og kontroller forslagene før import.</p>
              </div>
              <button type="button" onClick={closeImport} disabled={importing}>
                ×
              </button>
            </div>

            {!preview ? (
              <>
                <label className="field">
                  <span>Konto eller kredittkort</span>
                  <select
                    id="import-account"
                    name="accountId"
                    value={selectedAccount}
                    onChange={(event) => setSelectedAccount(event.target.value)}
                  >
                    <option value="">Velg konto…</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                        {account.owner ? ` · ${account.owner}` : ' · Felles'}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  className={`dropzone ${!selectedAccount ? 'disabled' : ''}`}
                  onClick={() => selectedAccount && fileInput.current?.click()}
                >
                  <strong>{selectedAccount ? 'Velg CSV-fil' : 'Velg konto først'}</strong>
                  <span>
                    {selectedAccount
                      ? 'Dato, beskrivelse og beløp er nødvendig.'
                      : 'Velg kontoen eller kortet CSV-filen kommer fra.'}
                  </span>
                  <input
                    id="csv-file"
                    name="csvFile"
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void previewCsv(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </div>

                {accounts.length === 0 && (
                  <div className="importHint">
                    Du har ingen kontoer ennå. Opprett en konto under <strong>Kontoer</strong> først.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="importSummary">
                  <strong>{preview.valid_rows} transaksjoner klare</strong>
                  <span>
                    {preview.error_rows} med feil · {preview.filename}
                  </span>
                </div>

                <div className="previewTable">
                  {preview.rows.slice(0, 100).map((row) => (
                    <div className={`previewRow ${row.error ? 'bad' : ''}`} key={row.row_number}>
                      <span>{row.posted_at}</span>
                      <strong>{row.merchant || row.description}</strong>
                      <span>{money(row.amount)}</span>

                      <select
                        id={`ownership-${row.row_number}`}
                        name={`ownership-${row.row_number}`}
                        value={row.ownership ?? ''}
                        onChange={(event) =>
                          updatePreviewRow(row.row_number, {
                            ownership: event.target.value || null,
                            confidence: event.target.value ? '1.0000' : null,
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
                        onChange={(event) =>
                          updatePreviewRow(row.row_number, {
                            category: event.target.value || null,
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
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>

                      {row.error && <span className="rowError">{row.error}</span>}
                    </div>
                  ))}
                </div>

                {preview.rows.length > 100 && (
                  <p className="muted">Viser de første 100 av {preview.rows.length} rader.</p>
                )}

                <div className="modalActions">
                  <button type="button" onClick={() => setPreview(null)} disabled={importing}>
                    Velg annen fil
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={confirmImport}
                    disabled={importing || preview.valid_rows === 0}
                  >
                    {importing ? 'Importerer…' : `Importer ${preview.valid_rows} transaksjoner`}
                  </button>
                </div>
              </>
            )}

            {importError && <div className="error">{importError}</div>}
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
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
