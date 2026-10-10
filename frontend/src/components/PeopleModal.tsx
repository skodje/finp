import { useState, type FormEvent } from 'react';
import * as api from '../api';
import type { Person } from '../types';
import { Modal } from './Modal';

type Props = {
  people: Person[];
  onClose: () => void;
  onSaved: (person: Person) => void;
};

export function PeopleModal({ people, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [share, setShare] = useState('1');
  const [editing, setEditing] = useState<string | null>(null); // person id being renamed
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await (editing
          ? api.updatePerson(editing, trimmed, share)
          : api.createPerson(trimmed, share)));
      setName('');
      setShare('1');
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save person');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Personer" subtitle="Felles utgifter fordeles etter andel, f.eks. 60 og 40 gir 60/40. Lik andel = 1 og 1." onClose={onClose}>
      <div className="accountList">
        {people.length === 0 && <p className="muted">Ingen personer opprettet ennå.</p>}
        {people.map((person) => (
          <div className="accountRow" key={person.id}>
            <div>
              <strong>{person.name}</strong>
              <span>Andel av felles: {Number(person.common_share)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(person.id);
                setName(person.name);
                setShare(String(Number(person.common_share)));
              }}
            >
              Rediger
            </button>
          </div>
        ))}
      </div>

      <form className="newPerson" onSubmit={save}>
        <label className="field">
          <span>{editing ? 'Nytt navn' : 'Ny person'}</span>
          <input
            name="personName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="F.eks. Lars"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Andel av felles</span>
          <input
            name="commonShare"
            inputMode="decimal"
            value={share}
            onChange={(event) => setShare(event.target.value.replace(',', '.'))}
          />
        </label>
        <button type="submit" className="primary" disabled={saving || !name.trim()}>
          {saving ? 'Lagrer…' : editing ? 'Lagre' : 'Legg til'}
        </button>
      </form>
      {editing && (
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setName('');
            setShare('1');
          }}
        >
          Avbryt redigering
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </Modal>
  );
}
