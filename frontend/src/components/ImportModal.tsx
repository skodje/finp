import { useRef, useState } from 'react';
import * as api from '../api';
import type { Account, Preview, PreviewRow } from '../types';
import { AccountField } from './AccountField';
import { ImportColumnMapper } from './ImportColumnMapper';
import { ImportPreviewRow } from './ImportPreviewRow';
import { Modal } from './Modal';

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
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [refreshingPreview, setRefreshingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const previewRef = useRef<Preview | null>(null);
  const rowEditsRef = useRef(new Map<number, Partial<PreviewRow>>());
  const previewRequestRef = useRef(0);
  // Keep a synchronous copy so in-flight preview requests can preserve the latest edits.
  previewRef.current = preview;
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => {
    if (!importing) onClose();
  };

  async function loadPreview(file: File, opts: api.CsvMapping = {}) {
    if (!selectedAccount) {
      setError('Velg konto eller kort før du velger fil.');
      return;
    }

    const requestId = ++previewRequestRef.current;
    setError(null);
    setRefreshingPreview(true);
    try {
      const effectiveOpts = { ...opts, expenseSign: opts.expenseSign ?? expenseSign };
      const nextPreview = await api.previewCsv(selectedAccount, file, effectiveOpts);

      // Mapping/sign/header changes re-run parsing. Preserve the user's per-row edits
      // rather than silently replacing them with the server's fresh suggestions.
      if (requestId !== previewRequestRef.current) return;
      nextPreview.rows = nextPreview.rows.map((row) => ({
        ...row,
        ...(rowEditsRef.current.get(row.row_number) ?? {}),
      }));
      previewRef.current = nextPreview;
      setPreview(nextPreview);
      setFile(file);
      // Open automatically when something needs attention, but never close it for the user.
      if (nextPreview.error_rows > 0) setColumnsOpen(true);
    } catch (err) {
      if (requestId === previewRequestRef.current) {
        setError(api.errorMessage(err, 'Forhåndsvisning av import mislyktes'));
      }
    } finally {
      if (requestId === previewRequestRef.current) setRefreshingPreview(false);
    }
  }

  function updateRow(rowNumber: number, patch: Partial<PreviewRow>) {
    const current = previewRef.current;
    if (!current) return;
    rowEditsRef.current.set(rowNumber, {
      ...(rowEditsRef.current.get(rowNumber) ?? {}),
      ...patch,
    });
    const next = {
      ...current,
      rows: current.rows.map((row) => (row.row_number === rowNumber ? { ...row, ...patch } : row)),
    };
    previewRef.current = next;
    setPreview(next);
  }

  async function confirm() {
    if (!preview || !selectedAccount || importingRef.current || refreshingPreview) return;

    importingRef.current = true;
    setImporting(true);
    setError(null);
    try {
      await api.importCsv(selectedAccount, preview.rows);
      onImported();
      onClose();
    } catch (err) {
      setError(api.errorMessage(err, 'Import failed'));
      importingRef.current = false;
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
          <AccountField
            id="import-account"
            name="accountId"
            accounts={accounts}
            value={selectedAccount}
            onChange={(accountId) => {
              onSelectAccount(accountId);
              setExpenseSign(
                accounts.find((account) => account.id === accountId)?.expense_sign ?? 'negative',
              );
            }}
          />

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
            <ImportColumnMapper
              columns={preview.columns}
              mapping={preview.mapping}
              hasHeader={preview.has_header}
              open={columnsOpen}
              onToggle={setColumnsOpen}
              onChange={(opts) => void loadPreview(file, opts)}
            />
          )}

          {refreshingPreview && (
            <p className="muted" role="status">
              Oppdaterer forhåndsvisning – endringene dine beholdes.
            </p>
          )}

          <div className="previewTable">
            {preview.rows.slice(0, PREVIEW_LIMIT).map((row) => (
              <ImportPreviewRow key={row.row_number} row={row} onChange={updateRow} />
            ))}
          </div>

          {preview.rows.length > PREVIEW_LIMIT && (
            <p className="muted">
              Viser de første {PREVIEW_LIMIT} av {preview.rows.length} rader.
            </p>
          )}

          <div className="modalActions">
            <button
              type="button"
              onClick={() => {
                ++previewRequestRef.current;
                previewRef.current = null;
                rowEditsRef.current.clear();
                setPreview(null);
                setColumnsOpen(false);
                setFile(null);
                setError(null);
              }}
              disabled={importing}
            >
              Velg annen fil
            </button>
            <button
              type="button"
              className="primary"
              onClick={confirm}
              disabled={importing || refreshingPreview || preview.valid_rows === 0}
            >
              {importing ? 'Importerer…' : `Bekreft import av ${preview.valid_rows} transaksjoner`}
            </button>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </Modal>
  );
}
