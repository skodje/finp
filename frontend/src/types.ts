export type Tx = {
  id: string;
  posted_at: string;
  description: string;
  amount: string;
  currency: string;
  merchant: string | null;
  category: string | null;
  ownership: string | null;
  confidence: string | null;
  account: string;
  owner: string | null;
};

export type Person = { id: string; name: string };

export type Account = {
  id: string;
  name: string;
  type: 'bank' | 'credit_card';
  owner_id: string | null;
  owner: string | null;
};

export type PreviewRow = {
  row_number: number;
  posted_at: string;
  description: string;
  amount: string;
  currency: string;
  merchant: string;
  category: string | null;
  ownership: string | null;
  confidence: string | null;
  account_id: string;
  error: string | null;
  duplicate: boolean;
};

export type Preview = {
  filename: string;
  total_rows: number;
  valid_rows: number; // rows that will be added
  duplicate_rows: number; // already stored, skipped

  error_rows: number;
  rows: PreviewRow[];
};

export type ImportResult = { imported: number; skipped_duplicates: number };
