import { useState, type FormEvent } from 'react';
import * as api from '../api';
import type { Person, Tx } from '../types';
import { Modal } from './Modal';

type Props = {
  tx: Tx;
  people: Person[];
  onClose: () => void;
  onSaved: (tx: Tx) => void;
};

export function TransactionEditModal({ tx, people, onClose, onSaved }: Props) {
  const [date, setDate] = useState(tx.posted_at);
  const [description, setDescription] = useState(tx.description);
  const [amount, setAmount] = useState(tx.amount);
  const [category, setCategory] = useState(tx.category ?? '');
  const [ownership, setOwnership] = useState(tx.ownership ?? '');
  const [personId, setPersonId] = useState(tx.person_id ?? '');
  // percent per person when ownership === 'split'; each person's slice is private to them
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      people.map((p) => [
        p.id,
        tx.splits.find((s) => s.person_id === p.id)?.percentage.replace(/\.0+$/, '') ??
          String(Math.round(100 / people.length)),
      ]),
    ),
  );
  const [isTransfer, setIsTransfer] = useState(tx.is_transfer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = amount.trim().replace(/\s/g, '').replace(',', '.');
    if (!description.trim()) return setError('Skriv inn en beskrivelse.');
    if (!normalized || !Number.isFinite(Number(normalized))) return setError('Ugyldig beløp.');

    const total = people.reduce((t, p) => t + Number(shares[p.id] || 0), 0);
    if (ownership === 'split' && Math.abs(total - 100) > 0.001)
      return setError(`Fordelingen må summere til 100 % (nå ${total} %).`);

    setSaving(true);
    setError(null);
    try {
      onSaved(
        await api.updateTransaction(tx.id, {
          posted_at: date,
          description: description.trim(),
          amount: normalized,
          category: category.trim() || null,
          ownership: ownership || null,
          person_id: ownership === 'private' ? personId || null : null,
          splits:
            ownership === 'split'
              ? people
                  .filter((p) => Number(shares[p.id]) > 0)
                  .map((p) => ({
                    ownership: 'private' as const,
                    person_id: p.id,
                    percentage: shares[p.id],
                  }))
              : null,
          is_transfer: isTransfer,
        }),
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update transaction');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Rediger transaksjon"
      subtitle={`${tx.account}`}
      onClose={onClose}
      closeDisabled={saving}
    >
      <form className="accountForm" onSubmit={submit}>
        <label className="field">
          <span>Dato</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Beskrivelse</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="field">
          <span>Beløp</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span>Kategori</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="field">
          <span>Fordeling</span>
          <select value={ownership} onChange={(e) => setOwnership(e.target.value)}>
            <option value="">Uavklart</option>
            <option value="common">Felles</option>
            <option value="private">Privat</option>
            <option value="split">Egendefinert fordeling</option>
          </select>
        </label>
        {ownership === 'private' && (
          <label className="field">
            <span>Person</span>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Velg person…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {ownership === 'split' &&
          people.map((p) => (
            <label className="field" key={p.id}>
              <span>{p.name} (%)</span>
              <input
                inputMode="decimal"
                value={shares[p.id]}
                onChange={(e) =>
                  setShares({ ...shares, [p.id]: e.target.value.replace(',', '.') })
                }
              />
            </label>
          ))}
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={isTransfer}
              onChange={(e) => setIsTransfer(e.target.checked)}
            />{' '}
            Overføring (f.eks. kortregning) – teller ikke som utgift
          </span>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modalActions">
          <button type="button" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Lagrer…' : 'Lagre'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
