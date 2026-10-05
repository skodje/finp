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
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Number(v)) + ' kr';
}

function App() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/transactions`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTransactions)
      .finally(() => setLoading(false));
  }, []);
  const visible = transactions.filter(
    (t) =>
      filter === 'all' ||
      (filter === 'review' && Number(t.confidence ?? 1) < 0.8) ||
      (filter === 'common' && t.ownership === 'common'),
  );
  const total = transactions.reduce((s, t) => s + Number(t.amount), 0);
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
          <Stat label="Totalt brukt" value={money(total)} note="Fra API-et" />
          <Stat
            label="Felles"
            value={money(
              transactions
                .filter((t) => t.ownership === 'common')
                .reduce((s, t) => s + Number(t.amount), 0),
            )}
            note="Klassifisert felles"
          />
          <Stat
            label="Trenger svar"
            value={String(transactions.filter((t) => Number(t.confidence ?? 1) < 0.8).length)}
            note="Lav confidence"
          />
          <Stat label="Transaksjoner" value={String(transactions.length)} note="Importert" />
        </section>
        <section className="card">
          <div className="sectionHead">
            <h2>Transaksjoner</h2>
            <div className="tabs">
              {[
                ['all', 'Alle'],
                ['review', 'Trenger svar'],
                ['common', 'Felles'],
              ].map(([k, l]) => (
                <button
                  className={filter === k ? 'active' : ''}
                  onClick={() => setFilter(k)}
                  key={k}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="muted">Laster fra backend…</p>
          ) : visible.length === 0 ? (
            <p className="muted">
              Ingen transaksjoner ennå. Kjør seed/import for å fylle databasen.
            </p>
          ) : (
            visible.map((t) => (
              <div className="row" key={t.id}>
                <div>
                  <strong>{t.merchant ?? t.description}</strong>
                  <small>
                    {t.posted_at} · {t.account}
                    {t.owner ? ` · ${t.owner}` : ''}
                  </small>
                </div>
                <span className="pill">
                  {t.ownership ?? 'Uavklart'} ·{' '}
                  {t.confidence ? Math.round(Number(t.confidence) * 100) : 0}%
                </span>
                <b>{money(t.amount)}</b>
              </div>
            ))
          )}
        </section>
      </div>
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
createRoot(document.getElementById('root')!).render(<App />);
