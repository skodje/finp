import { money } from '../format';
import type { Tx } from '../types';

export function SpendChart({ transactions }: { transactions: Tx[] }) {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    const key = tx.category ?? 'Ukategorisert';
    totals.set(key, (totals.get(key) ?? 0) + Number(tx.amount));
  }
  const rows = [...totals].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  const sum = rows.reduce((t, [, v]) => t + v, 0);

  return (
    <section className="card">
      <div className="sectionHead">
        <h2>Hvor går pengene</h2>
      </div>
      {rows.length === 0 && <p className="muted">Ingen utgifter i denne måneden.</p>}
      {rows.map(([category, value]) => (
        <div className="bar" key={category}>
          <span>{category}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <b>
            {money(value)} <small>{Math.round((value / sum) * 100)}%</small>
          </b>
        </div>
      ))}
    </section>
  );
}
