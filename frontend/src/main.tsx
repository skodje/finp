import React, { useEffect, useState } from 'react';
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

function money(v: string | number) {
  return (
    new Intl.NumberFormat('nb-NO', {
      maximumFractionDigits: 0,
    }).format(Number(v)) + ' kr'
  );
}

function App() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/transactions`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        return response.json();
      })
      .then(setTransactions)
      .catch((err) => {
        console.error('Failed to load transactions:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const visible = transactions.filter(
    (t) =>
      filter === 'all' ||
      (filter === 'review' && Number(t.confidence ?? 1) < 0.8) ||
      (filter === 'common' && t.ownership === 'common'),
  );

  const total = transactions.reduce((sum, transaction) => {
    return sum + Number(transaction.amount);
  }, 0);

  const commonTotal = transactions
    .filter((transaction) => transaction.ownership === 'common')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const reviewCount = transactions.filter(
    (transaction) => Number(transaction.confidence ?? 1) < 0.8,
  ).length;

  return (
    <main className="app">
      <div className="shell">
        <header>
          <div className="brand">
            <div className="logo">H</div>

            <div>
              <h1>Husøkonomi</h1>
              <p>Familieoversikt · live data</p>
            </div>
          </div>

          <div className="actions">
            <button>Importer</button>
            <button className="primary">+ Transaksjon</button>
          </div>
        </header>

        <section className="hero">
          <Stat
            label="Totalt brukt"
            value={money(total)}
            note="Fra API-et"
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
            value={String(transactions.length)}
            note="Importert"
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
              <small>
                API: {API}/transactions
              </small>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">
              Ingen transaksjoner ennå. Kjør seed/import for å fylle
              databasen.
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
