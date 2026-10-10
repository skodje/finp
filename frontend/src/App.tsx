import { useEffect, useState } from 'react';
import * as api from './api';
import { AccountsModal } from './components/AccountsModal';
import { ImportModal } from './components/ImportModal';
import { PeopleModal } from './components/PeopleModal';
import { MonthBar } from './components/MonthBar';
import { Stat } from './components/Stat';
import { TransactionList } from './components/TransactionList';
import { TransactionEditModal } from './components/TransactionEditModal';
import { TransactionModal } from './components/TransactionModal';
import { money, monthKey, monthLabel, needsReview } from './format';
import { SettlementCard } from './components/SettlementCard';
import { SpendChart } from './components/SpendChart';
import type { Account, Person, Settlement, Tx } from './types';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const upsert = <T extends { id: string; name: string }>(items: T[], item: T) =>
  [...items.filter((i) => i.id !== item.id), item].sort(byName);

export function App() {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [history, setHistory] = useState<Settlement[]>([]);
  const [filter, setFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountsOpen, setAccountsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
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

  const loadHistory = () => api.getSettlementHistory().then(setHistory).catch(console.error);

  useEffect(() => {
    loadTransactions();
    loadHistory();
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
  const allMonthTransactions = transactions.filter((tx) => monthKey(tx.posted_at) === currentMonth);
  const monthTransactions = allMonthTransactions.filter((tx) => !tx.is_transfer);

  useEffect(() => {
    api
      .getSettlement(currentMonth)
      .then(setSettlement)
      .catch((err) => console.error('Failed to load settlement:', err));
  }, [currentMonth, transactions]);

  const visible = allMonthTransactions.filter(
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
            <button type="button" onClick={() => setPeopleOpen(true)}>
              Personer
            </button>
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

        <div className="insights">
          <SettlementCard
            settlement={settlement}
            history={history}
            onSelectMonth={setSelectedMonth}
            onChange={(s) => {
              setSettlement(s);
              loadHistory();
            }}
            month={currentMonth}
          />
          <SpendChart transactions={monthTransactions} />
        </div>

        <TransactionList
          transactions={visible}
          loading={loading}
          error={error}
          filter={filter}
          onFilterChange={setFilter}
          onEdit={setEditing}
        />
      </div>

      {accountsOpen && (
        <AccountsModal
          accounts={accounts}
          people={people}
          onClose={() => setAccountsOpen(false)}
          onAccountSaved={(account) => {
            setAccounts((current) => upsert(current, account));
            setSelectedAccount(account.id);
            loadTransactions(); // account name/owner shows on every row
          }}
        />
      )}

      {peopleOpen && (
        <PeopleModal
          people={people}
          onClose={() => setPeopleOpen(false)}
          onSaved={(person) => {
            setPeople((current) => upsert(current, person));
            api.getAccounts().then(setAccounts);
            loadTransactions(); // also refreshes the settlement
          }}
        />
      )}

      {editing && (
        <TransactionEditModal
          tx={editing}
          people={people}
          onClose={() => setEditing(null)}
          onSaved={loadTransactions}
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
