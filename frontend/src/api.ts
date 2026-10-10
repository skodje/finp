import type { Account, ImportResult, Person, Preview, PreviewRow, Settlement, Tx } from './types';

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';

// FastAPI sends `detail` as a string for our errors and as a list of {msg} for validation errors.
function detailMessage(body: any, fallback: string): string {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) return detail.map((d) => d.msg).join(', ');
  return fallback;
}

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  failure: string,
): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(detailMessage(body, `${failure} (${response.status})`));
  return body as T;
}

const send = (method: string) => (body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const post = send('POST');
const patch = send('PATCH');

export const getTransactions = () => request<Tx[]>('/transactions', undefined, 'API returned');
export const getAccounts = () => request<Account[]>('/accounts', undefined, 'API returned');
export const getPeople = () => request<Person[]>('/persons', undefined, 'API returned');

export const createPerson = (name: string, common_share: string) =>
  request<Person>('/persons', post({ name, common_share }), 'Could not create person');

export const createAccount = (data: {
  name: string;
  type: Account['type'];
  owner_id: string | null;
}) => request<Account>('/accounts', post(data), 'Could not create account');

export const createTransaction = (data: {
  account_id: string;
  posted_at: string;
  description: string;
  amount: string;
}) => request<Tx>('/transactions', post(data), 'Could not create transaction');

export type CsvMapping = {
  mapping?: Partial<Preview['mapping']>;
  header?: boolean;
};

export function previewCsv(accountId: string, file: File, opts: CsvMapping = {}) {
  const params = new URLSearchParams({ account_id: accountId });
  const { date, description, amount } = opts.mapping ?? {};
  if (date != null) params.set('date_col', String(date));
  if (description != null) params.set('description_col', String(description));
  if (amount != null) params.set('amount_col', String(amount));
  if (opts.header != null) params.set('header', String(opts.header));
  const form = new FormData();
  form.append('file', file);
  return request<Preview>(
    `/imports/csv/preview?${params}`,
    { method: 'POST', body: form },
    'Import preview failed',
  );
}

export const importCsv = (accountId: string, rows: PreviewRow[]) =>
  request<ImportResult>('/imports/csv', post({ account_id: accountId, rows }), 'Import failed');

export const updatePerson = (id: string, name: string, common_share: string) =>
  request<Person>(`/persons/${id}`, patch({ name, common_share }), 'Could not rename person');

export const updateAccount = (
  id: string,
  data: { name: string; type: Account['type']; owner_id: string | null },
) => request<Account>(`/accounts/${id}`, patch(data), 'Could not update account');

export const updateTransaction = (
  id: string,
  data: {
    posted_at: string;
    description: string;
    amount: string;
    category: string | null;
    ownership: string | null;
    person_id: string | null;
    splits: { ownership: 'private'; person_id: string; percentage: string }[] | null;
    is_transfer: boolean;
  },
) => request<Tx>(`/transactions/${id}`, patch(data), 'Could not update transaction');

export const getSettlement = (month: string) =>
  request<Settlement>(`/settlement?month=${month}`, undefined, 'Could not load settlement');

export const getSettlementHistory = () =>
  request<Settlement[]>('/settlements', undefined, 'Could not load history');

export const markSettled = (month: string) =>
  request<Settlement>(`/settlement?month=${month}`, { method: 'POST' }, 'Could not settle');

export const undoSettled = async (month: string) => {
  const response = await fetch(`${API}/settlement?month=${month}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Could not undo (${response.status})`);
};
