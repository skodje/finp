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

  function resetForm() {
    setEditing(null);
    setName('');
    setShare('1');
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await (editing
          ? api.updatePerson(editing, trimmed, share)
          : api.createPerson(trimmed, share)),
      );
      resetForm();
    } catch (err) {
      setError(api.errorMessage(err, 'Could not save person'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Personer" subtitle="Opprett person som er med på husøkonomien." onClose={onClose}>
      <div className="accountList">
        {people.length === 0 && <p className="muted">Ingen personer opprettet ennå.</p>}
        {people.map((person) => (
          <div className="accountRow" key={person.id}>
            <div>
              <strong>{person.name}</strong>
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
        <button type="submit" className="primary" disabled={saving || !name.trim()}>
          {saving ? 'Lagrer…' : editing ? 'Lagre' : 'Legg til'}
        </button>
      </form>
      {editing && (
        <button type="button" onClick={resetForm}>
          Avbryt redigering
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </Modal>
  );
}
