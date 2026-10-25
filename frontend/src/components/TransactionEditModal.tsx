import { useState, type FormEvent } from 'react';
import * as api from '../api';
import { money } from '../format';
import type { Person, Tx } from '../types';
import { Modal } from './Modal';

type Props = {
  tx: Tx;
  people: Person[];
  onClose: () => void;
  onSaved: (tx: Tx) => void;
  onDeleted: (id: string) => void;
};

function equalShares(people: Person[]) {
  if (people.length === 0) return {};
  const base = Math.floor(100 / people.length);
  return Object.fromEntries(
    people.map((p, i) => [
      p.id,
      String(i === people.length - 1 ? 100 - base * (people.length - 1) : base),
    ]),
  );
}

function initialShares(people: Person[], tx: Tx) {
  if (tx.splits.length > 0) {
    return Object.fromEntries(
      people.map((p) => [
        p.id,
        tx.splits.find((s) => s.person_id === p.id)?.percentage.replace(/\.0+$/, '') ?? '0',
      ]),
    );
  }
  return equalShares(people);
}

// The API derives "split" from the allocations. In the editor a custom split is just a
// common expense with an adjusted distribution, so present it as "Felles" + split.
function initialOwnership(tx: Tx) {
  return tx.ownership === 'split' ? 'common' : (tx.ownership ?? '');
}

export function TransactionEditModal({ tx, people, onClose, onSaved, onDeleted }: Props) {
  const [date, setDate] = useState(tx.posted_at);
  const [description, setDescription] = useState(tx.description);
  const [amount, setAmount] = useState(tx.amount);
  const [category, setCategory] = useState(tx.category ?? '');
  const [ownership, setOwnership] = useState(initialOwnership(tx));
  const [personId, setPersonId] = useState(tx.person_id ?? '');
  // A custom split is stored as one private allocation per person; the payer fronts the full amount.
  const [splitBetweenPeople, setSplitBetweenPeople] = useState(tx.splits.length > 0);
  const [shares, setShares] = useState<Record<string, string>>(() => initialShares(people, tx));
  const [isTransfer, setIsTransfer] = useState(tx.is_transfer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number(amount.trim().replace(/\s/g, '').replace(',', '.'));
  const absoluteAmount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : 0;
  const sharesValid = people.every((p) => Number.isFinite(Number(shares[p.id] || 0)));
  const shareTotal = people.reduce((total, p) => total + Number(shares[p.id] || 0), 0);
  const customSplit = ownership === 'common' && splitBetweenPeople;
  const shareAmount = (id: string) => (absoluteAmount * Number(shares[id] || 0)) / 100;

  function updateShare(personId: string, raw: string) {
    const value = raw.replace(',', '.');
    if (people.length !== 2 || !value.trim()) {
      setShares({ ...shares, [personId]: value });
      return;
    }
    const parsed = Number(value);
    const other = people.find((p) => p.id !== personId);
    if (!other || !Number.isFinite(parsed)) {
      setShares({ ...shares, [personId]: value });
      return;
    }
    // With two people there is only one degree of freedom: keep the other side at 100 - x.
    const rest = Math.min(100, Math.max(0, Math.round((100 - parsed) * 100) / 100));
    setShares({ ...shares, [personId]: value, [other.id]: String(rest) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = amount.trim().replace(/\s/g, '').replace(',', '.');
    if (!description.trim()) return setError('Skriv inn en beskrivelse.');
    if (!normalized || !Number.isFinite(Number(normalized))) return setError('Ugyldig beløp.');

    if (customSplit && (!sharesValid || Math.abs(shareTotal - 100) > 0.001))
      return setError(
        sharesValid
          ? `Fordelingen må summere til 100 % (nå ${Number(shareTotal.toFixed(2))} %).`
          : 'Fordelingen må bestå av tall som summerer til 100 %.',
      );

    setSaving(true);
    setError(null);
    try {
      onSaved(
        await api.updateTransaction(tx.id, {
          posted_at: date,
          description: description.trim(),
          amount: normalized,
          category: category.trim() || null,
          // "split" is derived from the allocations, never sent as an ownership value.
          ownership: ownership || null,
          person_id: ownership === 'private' ? personId || null : null,
          splits: customSplit
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

  async function remove() {
    if (!window.confirm('Slett denne transaksjonen? Dette kan ikke angres.')) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteTransaction(tx.id);
      onDeleted(tx.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete transaction');
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
          <small>
            Bruk negative beløp for utgifter og positive beløp for refusjoner og inntekter.
          </small>
        </label>
        <label className="field">
          <span>Kategori</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="field">
          <span>Hvem dekker kostnaden?</span>
          <select value={ownership} onChange={(e) => setOwnership(e.target.value)}>
            <option value="">Ikke avklart</option>
            <option value="common">Felles</option>
            <option value="private">Privat</option>
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
        {ownership === 'common' && people.length > 1 && (
          <>
            <label className="splitToggle">
              <input
                type="checkbox"
                checked={splitBetweenPeople}
                onChange={(e) => setSplitBetweenPeople(e.target.checked)}
              />
              <span>Juster fordelingen mellom personer</span>
            </label>
            {splitBetweenPeople && (
              <div className="splitEditor">
                <small className="muted">
                  Kontoen betaler hele beløpet. Fordelingen bestemmer hvor mye hver person dekker i
                  oppgjøret.
                </small>
                {people.map((p) => (
                  <label className="splitRow" key={p.id}>
                    <span>{p.name}</span>
                    <input
                      inputMode="decimal"
                      aria-label={`${p.name} prosent`}
                      value={shares[p.id]}
                      onChange={(e) => updateShare(p.id, e.target.value)}
                    />
                    <span className="splitPercent">%</span>
                    <b>{money(shareAmount(p.id))}</b>
                  </label>
                ))}
                <div
                  className={`splitTotal${
                    !sharesValid || Math.abs(shareTotal - 100) > 0.001 ? ' invalid' : ''
                  }`}
                >
                  {sharesValid ? `Sum: ${Number(shareTotal.toFixed(2))} %` : 'Sum: ugyldig'}
                </div>
              </div>
            )}
          </>
        )}
        <label className="checkField">
          <input
            type="checkbox"
            checked={isTransfer}
            onChange={(e) => setIsTransfer(e.target.checked)}
          />
          <span>
            <strong>Overføring</strong>
            <small>F.eks. kortregning. Teller ikke som utgift.</small>
          </span>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modalActions">
          <button type="button" className="danger" onClick={remove} disabled={saving}>
            Slett transaksjon
          </button>
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
