import { useState, type FormEvent } from 'react';
import * as api from '../api';
import { normalizeAmount, parseAmount } from '../format';
import type { Account, Tx } from '../types';
import { AccountField } from './AccountField';
import { Modal } from './Modal';

type Props = {
  accounts: Account[];
  selectedAccount: string;
  onSelectAccount: (id: string) => void;
  onClose: () => void;
  onCreated: (tx: Tx) => void;
};

export function TransactionModal({
  accounts,
  selectedAccount,
  onSelectAccount,
  onClose,
  onCreated,
}: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeAmount(amount);
    if (!selectedAccount) return setError('Velg konto eller kort.');
    if (!description.trim()) return setError('Skriv inn en beskrivelse.');
    if (parseAmount(amount) === null) return setError('Ugyldig beløp.');

    setSaving(true);
    setError(null);
    try {
      onCreated(
        await api.createTransaction({
          account_id: selectedAccount,
          posted_at: date,
          description: description.trim(),
          amount: normalized,
        }),
      );
      onClose();
    } catch (err) {
      setError(api.errorMessage(err, 'Could not create transaction'));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Ny transaksjon"
      subtitle="Legg inn en transaksjon manuelt."
      onClose={onClose}
      closeDisabled={saving}
    >
      <form className="accountForm" onSubmit={submit}>
        <AccountField
          id="tx-account"
          name="accountId"
          accounts={accounts}
          value={selectedAccount}
          onChange={onSelectAccount}
        />

        <label className="field">
          <span>Dato</span>
          <input
            id="tx-date"
            name="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Beskrivelse</span>
          <input
            id="tx-description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="F.eks. REMA 1000"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Beløp (NOK)</span>
          <input
            id="tx-amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="F.eks. 249,90"
            autoComplete="off"
          />
        </label>

        {accounts.length === 0 && (
          <div className="importHint">
            Du har ingen kontoer ennå. Opprett en konto under <strong>Kontoer</strong> først.
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <div className="modalActions">
          <button type="button" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Lagrer…' : 'Legg til'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
