import { useRef, useState } from 'react';
import * as api from '../api';
import { money } from '../format';
import type { Account, Preview, PreviewRow } from '../types';
import { Modal } from './Modal';

const CATEGORIES = [
  'Mat',
  'Barn',
  'Bil',
  'Hus',
  'Transport',
  'Fritid',
  'Helse',
  'Restaurant',
  'Annet',
];

const PREVIEW_LIMIT = 100;

type Props = {
  accounts: Account[];
  selectedAccount: string;
  onSelectAccount: (id: string) => void;
  onClose: () => void;
  onImported: () => void;
};

export function ImportModal({
  accounts,
  selectedAccount,
  onSelectAccount,
  onClose,
  onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [expenseSign, setExpenseSign] = useState<Account['expense_sign']>(
    () => accounts.find((account) => account.id === selectedAccount)?.expense_sign ?? 'negative',
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => {
    if (!importing) onClose();
  };

  async function loadPreview(file: File, opts: api.CsvMapping = {}) {
    if (!selectedAccount) {
      setError('Velg konto eller kort før du velger CSV-fil.');
      return;
    }
    setError(null);
    try {
      const effectiveOpts = { ...opts, expenseSign: opts.expenseSign ?? expenseSign };
      setPreview(await api.previewCsv(selectedAccount, file, effectiveOpts));
      setFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import preview failed');
    }
  }

  function updateRow(rowNumber: number, patch: Partial<PreviewRow>) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.row_number === rowNumber ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  }

  async function confirm() {
    if (!preview || !selectedAccount) return;

    setImporting(true);
    setError(null);
    try {
      await api.importCsv(selectedAccount, preview.rows);
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  }

  return (
    <Modal
      title="Importer fil"
      subtitle="Velg konto, last opp CSV eller Excel (.xlsx), og kontroller forslagene før import."
      className="importModal"
      onClose={close}
      closeDisabled={importing}
    >
      {!preview ? (
        <>
          <label className="field">
            <span>Konto eller kredittkort</span>
            <select
              id="import-account"
              name="accountId"
              value={selectedAccount}
              onChange={(event) => {
                const accountId = event.target.value;
                onSelectAccount(accountId);
                setExpenseSign(
                  accounts.find((account) => account.id === accountId)?.expense_sign ?? 'negative',
                );
              }}
            >
              <option value="">Velg konto…</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.owner ? ` · ${account.owner}` : ' · Felles'}
                </option>
              ))}
            </select>
          </label>

          <div
            className={`dropzone ${!selectedAccount ? 'disabled' : ''}`}
            onClick={() => selectedAccount && fileInput.current?.click()}
          >
            <strong>{selectedAccount ? 'Velg CSV- eller Excel-fil' : 'Velg konto først'}</strong>
            <span>
              {selectedAccount
                ? 'Dato, beskrivelse og beløp er nødvendig.'
                : 'Velg kontoen eller kortet filen kommer fra.'}
            </span>
            <input
              id="csv-file"
              name="importFile"
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadPreview(file);
                event.currentTarget.value = '';
              }}
            />
          </div>

          {accounts.length === 0 && (
            <div className="importHint">
              Du har ingen kontoer ennå. Opprett en konto under <strong>Kontoer</strong> først.
            </div>
          )}
        </>
      ) : (
        <>
          <label className="field">
            <span>Hvordan vises utgifter i denne CSV-filen?</span>
            <select
              value={expenseSign}
              onChange={(event) => {
                const next = event.target.value as Account['expense_sign'];
                setExpenseSign(next);
                if (file) {
                  void loadPreview(file, {
                    header: preview.has_header,
                    mapping: preview.mapping,
                    expenseSign: next,
                  });
                }
              }}
            >
              <option value="negative">Negative beløp (f.eks. −226,05 kr)</option>
              <option value="positive">Positive beløp (f.eks. 226,05 kr)</option>
            </select>
            <small>Beløpene i forhåndsvisningen normaliseres slik at utgifter er negative.</small>
          </label>

          <div className="importSummary">
            <strong>{preview.valid_rows} nye transaksjoner</strong>
            <span>
              {preview.duplicate_rows} finnes fra før · {preview.error_rows} med feil ·{' '}
              {preview.filename}
            </span>
          </div>

          {file && (
            <details className="columnMap" open={preview.error_rows > 0}>
              <summary>Kolonner</summary>
              {(['date', 'description', 'amount'] as const).map((field) => (
                <label className="field" key={field}>
                  <span>{{ date: 'Dato', description: 'Beskrivelse', amount: 'Beløp' }[field]}</span>
                  <select
                    value={preview.mapping[field] ?? ''}
                    onChange={(event) =>
                      void loadPreview(file, {
                        header: preview.has_header,
                        mapping: { ...preview.mapping, [field]: Number(event.target.value) },
                      })
                    }
                  >
                    {preview.mapping[field] == null && <option value="">Velg kolonne…</option>}
                    {preview.columns.map((label, index) => (
                      <option key={index} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="field">
                <span>
                  <input
                    type="checkbox"
                    checked={preview.has_header}
                    onChange={(event) =>
                      void loadPreview(file, {
                        header: event.target.checked,
                        mapping: preview.mapping,
                      })
                    }
                  />{' '}
                  Første rad er overskrift
                </span>
              </label>
            </details>
          )}

          <div className="previewTable">
            {preview.rows.slice(0, PREVIEW_LIMIT).map((row) => (
              <div
                className={`previewRow ${row.error ? 'bad' : ''} ${row.duplicate ? 'dup' : ''}`}
                key={row.row_number}
              >
                <span>{row.posted_at}</span>
                <strong>{row.merchant || row.description}</strong>
                <span>{money(row.amount)}</span>

                <select
                  id={`ownership-${row.row_number}`}
                  name={`ownership-${row.row_number}`}
                  value={row.ownership ?? ''}
                  onChange={(event) =>
                    updateRow(row.row_number, {
                      ownership: event.target.value || null,
                      confidence: event.target.value ? '1.0000' : null,
                    })
                  }
                >
                  <option value="">Uavklart</option>
                  <option value="common">Felles</option>
                  <option value="private">Privat</option>
                </select>

                <select
                  id={`category-${row.row_number}`}
                  name={`category-${row.row_number}`}
                  value={row.category ?? ''}
                  onChange={(event) =>
                    updateRow(row.row_number, { category: event.target.value || null })
                  }
                >
                  <option value="">Kategori</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                {row.error && <span className="rowError">{row.error}</span>}
                {row.duplicate && <span className="rowNote">Finnes fra før – hoppes over</span>}
              </div>
            ))}
          </div>

          {preview.rows.length > PREVIEW_LIMIT && (
            <p className="muted">
              Viser de første {PREVIEW_LIMIT} av {preview.rows.length} rader.
            </p>
          )}

          <div className="modalActions">
            <button type="button" onClick={() => setPreview(null)} disabled={importing}>
              Velg annen fil
            </button>
            <button
              type="button"
              className="primary"
              onClick={confirm}
              disabled={importing || preview.valid_rows === 0}
            >
              {importing ? 'Importerer…' : `Importer ${preview.valid_rows} transaksjoner`}
            </button>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </Modal>
  );
}
