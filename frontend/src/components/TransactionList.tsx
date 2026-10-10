import { useState } from 'react';
import { API } from '../api';
import { money } from '../format';
import type { Tx } from '../types';

type Props = {
  transactions: Tx[];
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (filter: string) => void;
  onEdit: (tx: Tx) => void;
};

const FILTERS = [
  ['all', 'Alle'],
  ['review', 'Trenger svar'],
  ['common', 'Felles'],
];

const UNCATEGORIZED = 'Ukategorisert';

function groupByCategory(transactions: Tx[]) {
  const groups = new Map<string, { items: Tx[]; total: number }>();
  for (const tx of transactions) {
    const key = tx.is_transfer ? 'Overføringer' : (tx.category ?? UNCATEGORIZED);
    const group = groups.get(key) ?? { items: [], total: 0 };
    group.items.push(tx);
    group.total += Number(tx.amount);
    groups.set(key, group);
  }
  // biggest spend first
  return [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
}

function TransactionRow({ transaction, onEdit }: { transaction: Tx; onEdit: (tx: Tx) => void }) {
  return (
    <div className={`row${transaction.is_transfer ? ' transfer' : ''}`}
      onClick={() => onEdit(transaction)} style={{ cursor: 'pointer' }}>
      <div>
        <strong>{transaction.merchant ?? transaction.description}</strong>
        <small>
          {transaction.posted_at} · {transaction.account}
          {transaction.owner ? ` · ${transaction.owner}` : ''}
        </small>
      </div>
      <span className="pill">
        {transaction.ownership === 'split' ? 'Delt' : (transaction.ownership ?? 'Uavklart')} ·{' '}
        {transaction.confidence ? Math.round(Number(transaction.confidence) * 100) : 0}%
      </span>
      <b>{money(transaction.amount)}</b>
    </div>
  );
}

export function TransactionList({ transactions, loading, error, filter, onFilterChange, onEdit }: Props) {
  const [grouped, setGrouped] = useState(true);

  return (
    <section className="card">
      <div className="sectionHead">
        <h2>Transaksjoner</h2>
        <div className="tabs">
          {FILTERS.map(([key, label]) => (
            <button
              type="button"
              className={filter === key ? 'active' : ''}
              onClick={() => onFilterChange(key)}
              key={key}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={grouped ? 'active' : ''}
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
          >
            Grupper
          </button>
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
      ) : transactions.length === 0 ? (
        <p className="muted">Ingen transaksjoner i denne måneden.</p>
      ) : grouped ? (
        groupByCategory(transactions).map(([category, { items, total }]) => (
          <details className="group" key={category} open>
            <summary>
              <span className="chevron" aria-hidden="true">
                ›
              </span>
              <strong>{category}</strong>
              <small>{items.length}</small>
              <b>{money(total)}</b>
            </summary>
            {items.map((transaction) => (
              <TransactionRow transaction={transaction} onEdit={onEdit} key={transaction.id} />
            ))}
          </details>
        ))
      ) : (
        transactions.map((transaction) => (
          <TransactionRow transaction={transaction} onEdit={onEdit} key={transaction.id} />
        ))
      )}
    </section>
  );
}
