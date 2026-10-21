import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import ArgumentForm from '../components/ArgumentForm';
import AiPanel from '../components/AiPanel';
import useDisplayNames from '../useDisplayNames';

const isSubmitted = (argument) => argument.status === 'ARGUMENT_STATUS_SUBMITTED';

export default function DisputeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [dispute, setDispute] = useState(null);
  const [argumentsList, setArgumentsList] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // argument being edited, or 'new'
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [beef, list] = await Promise.all([api.getDispute(id), api.listArguments(id)]);
      setDispute(beef);
      setArgumentsList(list.arguments);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const mine = argumentsList.filter((argument) => argument.person_id === user.person_id);
  const others = argumentsList.filter((argument) => argument.person_id !== user.person_id);
  const nameOf = useDisplayNames(others.map((argument) => argument.person_id));

  async function save(payload) {
    setNotice('');
    if (editing && editing !== 'new') {
      await api.updateArgument(editing.argument_id, { ...payload, expected_version: editing.version });
    } else {
      await api.createArgument({ ...payload, dispute_id: String(id) });
    }
    setEditing(null);
    await load();
  }

  async function remove(argument) {
    if (!window.confirm('Delete this argument?')) return;
    try {
      await api.deleteArgument(argument.argument_id, argument.version);
      await load();
    } catch (err) {
      setError(err.status === 409 ? 'This argument changed since you loaded it. Reloaded the latest version; try again.' : err.message);
      await load();
    }
  }

  async function submitForAi(argument, side) {
    setError('');
    try {
      await api.submitForAi(argument.argument_id, side, argument.version);
      setNotice(`Sent to the AI as side ${side}. The other person must send their side too.`);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !dispute) {
    return (
      <section className="card">
        <p className="error" role="alert">{error}</p>
        <p className="muted">Only the two people in a dispute can open it.</p>
        <Link to="/">Back to my disputes</Link>
      </section>
    );
  }
  if (!dispute) return <p className="muted">Loading...</p>;

  // The creator (person A) is side 1 and the opponent (person B) is side 2; the server enforces this too.
  const iAmCreator = dispute.person_a_id && dispute.person_a_id.toLowerCase() === user.person_id.toLowerCase();
  const mySide = iAmCreator ? 1 : 2;
  const opponentName = iAmCreator ? dispute.person_b : dispute.person_a;

  return (
    <>
      <p><Link to="/">&larr; All disputes</Link></p>
      <section className="card">
        <div className="row">
          <h1>#{dispute.id} {dispute.person_a} vs {dispute.person_b}</h1>
          <span className={`badge ${dispute.status}`}>{dispute.status}</span>
        </div>
        <p>{dispute.reason}</p>
        <p data-testid="my-role">You are <strong>side {mySide}</strong> ({iAmCreator ? 'you opened this dispute' : 'you were named as the opponent'}) against <strong>{opponentName}</strong>.</p>
        <p className="muted">Arguments are saved in PostgreSQL by the evidence service; the AI result is stored in MongoDB.</p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="card">
        <div className="row">
          <h2>Your arguments</h2>
          {editing === null && <button onClick={() => setEditing('new')}>+ New argument</button>}
        </div>

        {editing !== null && (
          <ArgumentForm key={editing === 'new' ? 'new' : editing.argument_id} initial={editing === 'new' ? null : editing}
            onSave={save} onCancel={() => setEditing(null)} />
        )}

        {mine.length === 0 && editing === null && <p className="muted">You have not written your side yet.</p>}
        <ul className="list">
          {mine.map((argument) => (
            <li key={argument.argument_id} className="item column" data-testid="my-argument">
              <div>
                <span className={`badge ${isSubmitted(argument) ? 'resolved' : 'active'}`}>{isSubmitted(argument) ? 'submitted' : 'draft'}</span>
                <span className="muted"> version {argument.version}</span>
                <p>{argument.statement}</p>
                {argument.evidence.length > 0 && (
                  <ul className="evidence">
                    {argument.evidence.map((item) => (
                      <li key={item.evidence_id}>
                        <span className="tag">{item.type.replace('EVIDENCE_TYPE_', '').toLowerCase()}</span>{' '}
                        <a href={item.evidence_url} target="_blank" rel="noreferrer">{item.description || item.evidence_url}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => setEditing(argument)}>Edit</button>
                <button className="danger" onClick={() => remove(argument)}>Delete</button>
                {isSubmitted(argument) ? (
                  <button onClick={() => submitForAi(argument, mySide)}>Send to AI as side {mySide}</button>
                ) : <span className="muted">Set status to Submitted to send it to the AI.</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {others.length > 0 && (
        <section className="card">
          <h2>Other people&apos;s arguments</h2>
          <ul className="list">
            {others.map((argument) => (
              <li key={argument.argument_id} className="item column">
                <div>
                  <strong data-testid="author-name">{nameOf(argument.person_id)}</strong>
                  <p>{argument.statement}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AiPanel disputeId={String(id)} refreshKey={refreshKey} />
    </>
  );
}
