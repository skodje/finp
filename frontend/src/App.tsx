import { useEffect, useState } from 'react';
import * as api from './api';
import { AccountsModal } from './components/AccountsModal';
import { ImportModal } from './components/ImportModal';
import { MonthBar } from './components/MonthBar';
import { Stat } from './components/Stat';
import { TransactionList } from './components/TransactionList';
import { TransactionModal } from './components/TransactionModal';
import { money, monthKey, monthLabel, needsReview } from './format';
import type { Account, Person, Tx } from './types';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const upsert = <T extends { id: string; name: string }>(items: T[], item: T) =>
  [...items.filter((i) => i.id !== item.id), item].sort(byName);

export function App() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountsOpen, setAccountsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');

  function loadTransactions() {
    setLoading(true);
    setError(null);
    api
      .getTransactions()
      .then(setTransactions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTransactions();
    api
      .getAccounts()
      .then(setAccounts)
      .catch((err) => console.error('Failed to load accounts:', err));
    api
      .getPeople()
      .then(setPeople)
      .catch((err) => console.error('Failed to load people:', err));
  }, []);

  const months = [...new Set(transactions.map((tx) => monthKey(tx.posted_at)))].sort().reverse();
  const currentMonth = selectedMonth || months[0] || new Date().toISOString().slice(0, 7);
  const monthTransactions = transactions.filter((tx) => monthKey(tx.posted_at) === currentMonth);

  const visible = monthTransactions.filter(
    (tx) =>
      filter === 'all' ||
      (filter === 'review' && needsReview(tx.confidence)) ||
      (filter === 'common' && tx.ownership === 'common'),
  );

  const sum = (txs: Tx[]) => txs.reduce((total, tx) => total + Number(tx.amount), 0);
  const total = sum(monthTransactions);
  const commonTotal = sum(monthTransactions.filter((tx) => tx.ownership === 'common'));
  const reviewCount = monthTransactions.filter((tx) => needsReview(tx.confidence)).length;

  function preselectOnlyAccount() {
    if (!selectedAccount && accounts.length === 1) setSelectedAccount(accounts[0].id);
  }

  function openImport() {
    preselectOnlyAccount();
    setImportOpen(true);
  }

  function openTransaction() {
    preselectOnlyAccount();
    setTransactionOpen(true);
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
            <button type="button" onClick={() => setAccountsOpen(true)}>
              Kontoer
            </button>
            <button type="button" onClick={openImport}>
              Importer
            </button>
            <button type="button" className="primary" onClick={openTransaction}>
              + Transaksjon
            </button>
          </div>
        </header>

        <MonthBar months={months} current={currentMonth} onChange={setSelectedMonth} />

        <section className="hero">
          <Stat label="Totalt brukt" value={money(total)} note="Valgt måned" />
          <Stat label="Felles" value={money(commonTotal)} note="Klassifisert felles" />
          <Stat label="Trenger svar" value={String(reviewCount)} note="Lav confidence" />
          <Stat
            label="Transaksjoner"
            value={String(monthTransactions.length)}
            note="I valgt måned"
          />
        </section>

        <TransactionList
          transactions={visible}
          loading={loading}
          error={error}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>

      {accountsOpen && (
        <AccountsModal
          accounts={accounts}
          people={people}
          onClose={() => setAccountsOpen(false)}
          onPersonCreated={(person) => setPeople((current) => upsert(current, person))}
          onAccountCreated={(account) => {
            setAccounts((current) => upsert(current, account));
            setSelectedAccount(account.id);
          }}
        />
      )}

      {transactionOpen && (
        <TransactionModal
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={setSelectedAccount}
          onClose={() => setTransactionOpen(false)}
          onCreated={(tx) => {
            setSelectedMonth(monthKey(tx.posted_at)); // jump to the month it landed in
            loadTransactions();
          }}
        />
      )}

      {importOpen && (
        <ImportModal
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={setSelectedAccount}
          onClose={() => setImportOpen(false)}
          onImported={loadTransactions}
        />
      )}
    </main>
  );
}
