import { useState } from 'react';
import * as api from '../api';
import { money, monthLabel } from '../format';
import type { Settlement } from '../types';

type Props = {
  settlement: Settlement | null;
  history: Settlement[];
  month: string;
  onSelectMonth: (month: string) => void;
  onChange: (settlement: Settlement) => void;
};

const Payments = ({ s }: { s: Settlement }) =>
  s.payments.length === 0 ? (
    <p className="muted">Ingen skylder noe denne måneden.</p>
  ) : (
    <>
      {s.payments.map((p) => (
        <p className="settle" key={`${p.from}-${p.to}`}>
          <strong>{p.from}</strong> skylder <strong>{p.to}</strong> <b>{money(p.amount)}</b>
        </p>
      ))}
    </>
  );

export function SettlementCard({ settlement, history, month, onSelectMonth, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function act(settle: boolean) {
    setError(null);
    try {
      if (settle) onChange(await api.markSettled(month));
      else {
        await api.undoSettled(month);
        onChange(await api.getSettlement(month));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feil');
    }
  }

  return (
    <section className="card">
      <div className="sectionHead">
        <h2>Oppgjør</h2>
        {settlement?.settled_at && <span className="pill">Oppgjort</span>}
      </div>
      {!settlement ? (
        <p className="muted">Laster…</p>
      ) : (
        <>
          <Payments s={settlement} />
          {settlement.settled_at ? (
            <button type="button" onClick={() => act(false)}>
              Angre oppgjør
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => act(true)}>
              Marker som oppgjort
            </button>
          )}
          {settlement.unclassified > 0 && !settlement.settled_at && (
            <small className="muted">
              {settlement.unclassified} transaksjoner mangler fordeling og er ikke med.
            </small>
          )}
        </>
      )}
      {error && <div className="error">{error}</div>}

      {history.length > 0 && (
        <details className="history">
          <summary>Historikk</summary>
          {history.map((h) => (
            <button type="button" className="historyRow" key={h.month} onClick={() => onSelectMonth(h.month)}>
              <span>{monthLabel(h.month)}</span>
              <small>
                {h.payments.length
                  ? h.payments.map((p) => `${p.from} → ${p.to} ${money(p.amount)}`).join(', ')
                  : 'Ingen utestående'}
              </small>
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
