import { useState, type FormEvent } from 'react';
import * as api from '../api';
import { accountTypeLabel } from '../format';
import type { Account, Person } from '../types';
import { Modal } from './Modal';

type Props = {
  accounts: Account[];
  people: Person[];
  onClose: () => void;
  onPersonCreated: (person: Person) => void;
  onAccountCreated: (account: Account) => void;
};

export function AccountsModal({
  accounts,
  people,
  onClose,
  onPersonCreated,
  onAccountCreated,
}: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('credit_card');
  const [owner, setOwner] = useState('');
  const [personName, setPersonName] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPerson, setSavingPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPerson() {
    const trimmed = personName.trim();
    if (!trimmed) return;

    setSavingPerson(true);
    setError(null);
    try {
      const person = await api.createPerson(trimmed);
      onPersonCreated(person);
      setOwner(person.id);
      setPersonName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create person');
    } finally {
      setSavingPerson(false);
    }
  }

  async function addAccount(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Skriv inn et navn på kontoen.');
      return;
    }

    setSavingAccount(true);
    setError(null);
    try {
      const account = await api.createAccount({
        name: name.trim(),
        type,
        owner_id: owner || null,
      });
      onAccountCreated(account);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
      setSavingAccount(false);
    }
  }

  return (
    <Modal
      title="Kontoer og kort"
      subtitle="Opprett kontoene og kortene du vil importere transaksjoner fra."
      onClose={onClose}
    >
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

      <form className="accountForm" onSubmit={addAccount}>
        <h3>Ny konto eller kort</h3>

        <label className="field">
          <span>Navn</span>
          <input
            id="account-name"
            name="accountName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="F.eks. Lars Amex"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Type</span>
          <select
            id="account-type"
            name="accountType"
            value={type}
            onChange={(event) => setType(event.target.value as Account['type'])}
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
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
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
          <button type="button" onClick={addPerson} disabled={savingPerson || !personName.trim()}>
            {savingPerson ? 'Oppretter…' : 'Legg til'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modalActions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={savingAccount}>
            {savingAccount ? 'Lagrer…' : 'Opprett konto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
