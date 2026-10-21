import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import UserPicker from '../components/UserPicker';

const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export default function Disputes() {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState([]);
  const [filter, setFilter] = useState('');
  const [opponent, setOpponent] = useState(null);
  const [pickerKey, setPickerKey] = useState(0); // bumping it clears the picker's search box
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(null); // dispute being edited
  const [editForm, setEditForm] = useState({ reason: '', status: 'active' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setDisputes((await api.listDisputes()).beefs);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(event) {
    event.preventDefault();
    if (!opponent) { setError('Search for your opponent and pick them from the list.'); return; }
    setError('');
    try {
      await api.createDispute({ person_b_id: opponent.person_id, reason });
      setOpponent(null);
      setPickerKey((key) => key + 1);
      setReason('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(dispute) {
    setEditing(dispute);
    setEditForm({ reason: dispute.reason, status: dispute.status });
  }

  async function saveEdit(event) {
    event.preventDefault();
    try {
      await api.updateDispute(editing.id, editForm);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStatus(dispute) {
    try {
      await api.updateDispute(dispute.id, { status: dispute.status === 'active' ? 'resolved' : 'active' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(dispute) {
    if (!window.confirm(`Delete dispute #${dispute.id} (${dispute.person_a} vs ${dispute.person_b})?`)) return;
    try {
      await api.deleteDispute(dispute.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const needle = filter.trim().toLowerCase();
  const shown = disputes.filter((dispute) => !needle || `${dispute.person_a} ${dispute.person_b} ${dispute.reason}`.toLowerCase().includes(needle));
  const label = (name, personId) => (sameId(personId, user.person_id) ? `${name} (you)` : name);

  return (
    <>
      <section className="card">
        <h2>Start a dispute</h2>
        <form onSubmit={create} className="stack">
          <p className="muted">You are <strong>{user.display_name}</strong>. Pick who the dispute is with:</p>
          <label>Opponent
            <UserPicker key={pickerKey} value={opponent} onChange={setOpponent} />
          </label>
          <label>What happened?
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} required rows={3} maxLength={2000}
              placeholder="They disagree about who should choose the team name." />
          </label>
          <div className="actions"><button type="submit">Create dispute</button></div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="card">
        <div className="row">
          <h2>My disputes</h2>
          <input className="filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by name or reason" aria-label="Filter disputes" />
        </div>
        {loading ? <p className="muted">Loading...</p> : shown.length === 0 ? <p className="muted">No disputes yet. Disputes you create, or that others open with you, appear here.</p> : (
          <ul className="list">
            {shown.map((dispute) => (
              <li key={dispute.id} className="item" data-testid={`dispute-${dispute.id}`}>
                {editing?.id === dispute.id ? (
                  <form onSubmit={saveEdit} className="stack grow">
                    <label>What happened?
                      <textarea value={editForm.reason} onChange={(event) => setEditForm((form) => ({ ...form, reason: event.target.value }))} required rows={3} maxLength={2000} />
                    </label>
                    <label>Status
                      <select value={editForm.status} onChange={(event) => setEditForm((form) => ({ ...form, status: event.target.value }))}>
                        <option value="active">active</option>
                        <option value="resolved">resolved</option>
                      </select>
                    </label>
                    <div className="actions">
                      <button type="submit">Save changes</button>
                      <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>#{dispute.id} {label(dispute.person_a, dispute.person_a_id)} vs {label(dispute.person_b, dispute.person_b_id)}</strong>
                      <span className={`badge ${dispute.status}`}>{dispute.status}</span>
                      <p className="muted">{dispute.reason}</p>
                    </div>
                    <div className="actions">
                      <Link className="button" to={`/disputes/${dispute.id}`}>Open</Link>
                      <button className="ghost" onClick={() => toggleStatus(dispute)}>{dispute.status === 'active' ? 'Mark resolved' : 'Reopen'}</button>
                      <button className="ghost" onClick={() => startEdit(dispute)}>Edit</button>
                      {sameId(dispute.person_a_id, user.person_id) && <button className="danger" onClick={() => remove(dispute)}>Delete</button>}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
