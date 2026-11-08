import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import UserPicker from '../components/UserPicker';

const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export default function Disputes() {
  const { user } = useAuth();
  const location = useLocation();
  const [disputes, setDisputes] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
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
  useEffect(() => {
    if (location.hash === '#new-dispute') document.getElementById('new-dispute')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  async function create(event) {
    event.preventDefault();
    if (!opponent) { setError('Search for your opponent and pick them from the list.'); return; }
    setError('');
    setBusy(true);
    try {
      await api.createDispute({ person_b_id: opponent.person_id, reason });
      setOpponent(null);
      setPickerKey((key) => key + 1);
      setReason('');
      await load();
      setNotice('Dispute created. Open it to share your side.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
  const shown = disputes.filter((dispute) => (statusFilter === 'all' || dispute.status === statusFilter) && (!needle || `${dispute.person_a} ${dispute.person_b} ${dispute.reason}`.toLowerCase().includes(needle)));
  const activeCount = disputes.filter((dispute) => dispute.status === 'active').length;
  const resolvedCount = disputes.length - activeCount;
  const label = (name, personId) => (sameId(personId, user.person_id) ? `${name} (you)` : name);

  return (
    <>
      <section className="dashboard-hero">
        <div><p className="eyebrow">Your space</p><h1>Find a way forward.</h1><p>Make room for both sides of the story, then work toward a better next step.</p><a className="button hero-button" href="#new-dispute">Start a dispute <Icon name="arrow" size={17}/></a></div>
        <div className="hero-aside"><span className="hero-aside-number">01 <span>/ 03</span></span><p>A calmer way to talk things through.</p><span>Start with what happened. The rest can follow.</span></div>
      </section>
      <div className="dashboard-stats" aria-label="Dispute overview"><div><Icon name="users"/><span>All disputes</span><strong>{disputes.length}</strong></div><div><Icon name="circle"/><span>In progress</span><strong>{activeCount}</strong></div><div><Icon name="check"/><span>Resolved</span><strong>{resolvedCount}</strong></div></div>
      <div className="dashboard-grid"><section className="card new-dispute-card" id="new-dispute">
        <div className="card-head"><p className="eyebrow">Begin here</p><h2>Start a dispute</h2><p className="muted">Choose a registered person and describe what happened.</p></div>
        <form onSubmit={create} className="stack">
          <p className="muted">You are <strong>{user.display_name}</strong>. Pick who the dispute is with:</p>
          <label>Opponent
            <UserPicker key={pickerKey} value={opponent} onChange={setOpponent} />
          </label>
          <label>What happened?
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} required rows={3} maxLength={2000}
              placeholder="They disagree about who should choose the team name." />
          </label>
          <div className="actions"><button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create dispute'} {!busy && <Icon name="arrow" size={16}/>}</button></div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>

      <section className="card disputes-card" id="my-disputes">
        <div className="disputes-heading"><div><p className="eyebrow">Keep moving</p><h2>My disputes</h2></div><button type="button" className="text-button" onClick={load}>Refresh</button></div>
        <div className="dispute-tools"><div className="tab-filter" role="group" aria-label="Filter by status">{[['all','All'],['active','In progress'],['resolved','Resolved']].map(([value,label]) => <button key={value} type="button" aria-pressed={statusFilter === value} className={statusFilter === value ? 'selected' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
          <label className="search-field"><Icon name="search" size={17}/><input className="filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search disputes" aria-label="Search disputes" /></label>
        </div>
        {loading ? <p className="empty-state">Loading your disputes…</p> : shown.length === 0 ? <div className="empty-state"><Icon name="users" size={30}/><strong>{disputes.length ? 'No matching disputes' : 'No disputes yet'}</strong><p>{disputes.length ? 'Try another search or status.' : 'The disputes you create or join will appear here.'}</p></div> : (
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
                      <Link className="button" to={`/disputes/${dispute.id}`}>Open <Icon name="arrow" size={15}/></Link>
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
      </div>
    </>
  );
}
