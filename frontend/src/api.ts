import type { Account, ImportResult, Person, Preview, PreviewRow, Tx } from './types';

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

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const getTransactions = () => request<Tx[]>('/transactions', undefined, 'API returned');
export const getAccounts = () => request<Account[]>('/accounts', undefined, 'API returned');
export const getPeople = () => request<Person[]>('/persons', undefined, 'API returned');

export const createPerson = (name: string) =>
  request<Person>('/persons', post({ name }), 'Could not create person');

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

export function previewCsv(accountId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<Preview>(
    `/imports/csv/preview?account_id=${encodeURIComponent(accountId)}`,
    { method: 'POST', body: form },
    'Import preview failed',
  );
}

export const importCsv = (accountId: string, rows: PreviewRow[]) =>
  request<ImportResult>('/imports/csv', post({ account_id: accountId, rows }), 'Import failed');
