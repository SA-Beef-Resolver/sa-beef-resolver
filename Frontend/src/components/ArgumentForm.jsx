import { useState } from 'react';

const EVIDENCE_TYPES = ['LINK', 'IMAGE', 'DOCUMENT', 'OTHER'];
const MAX_EVIDENCE = 10;

const blankEvidence = () => ({ type: 'LINK', evidence_url: '', description: '' });

// Create or edit one argument. `initial` is an existing argument when editing.
export default function ArgumentForm({ initial, onSave, onCancel }) {
  const [statement, setStatement] = useState(initial?.statement || '');
  const [status, setStatus] = useState(initial?.status || 'ARGUMENT_STATUS_SUBMITTED');
  const [evidence, setEvidence] = useState(() => (initial?.evidence || []).map((item) => ({
    type: item.type.replace('EVIDENCE_TYPE_', ''), evidence_url: item.evidence_url, description: item.description
  })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const updateEvidence = (index, key, value) => setEvidence((items) => items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave({
        statement,
        status,
        evidence: evidence.map((item) => ({ type: `EVIDENCE_TYPE_${item.type}`, evidence_url: item.evidence_url, description: item.description }))
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label>Your side of the story
        <textarea value={statement} onChange={(event) => setStatement(event.target.value)} required rows={4} maxLength={10000}
          placeholder="I returned the headphones on Monday at the library." />
      </label>

      <fieldset>
        <legend>Evidence ({evidence.length}/{MAX_EVIDENCE}) <span className="muted">links to files, not uploads</span></legend>
        {evidence.map((item, index) => (
          <div className="evidence-row" key={index}>
            <select value={item.type} onChange={(event) => updateEvidence(index, 'type', event.target.value)} aria-label="Evidence type">
              {EVIDENCE_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input type="url" value={item.evidence_url} onChange={(event) => updateEvidence(index, 'evidence_url', event.target.value)}
              placeholder="https://..." required aria-label="Evidence URL" />
            <input value={item.description} onChange={(event) => updateEvidence(index, 'description', event.target.value)}
              placeholder="What does it show?" aria-label="Evidence description" maxLength={500} />
            <button type="button" className="ghost" onClick={() => setEvidence((items) => items.filter((_, i) => i !== index))}>Remove</button>
          </div>
        ))}
        <button type="button" className="ghost" disabled={evidence.length >= MAX_EVIDENCE}
          onClick={() => setEvidence((items) => [...items, blankEvidence()])}>+ Add evidence</button>
      </fieldset>

      <label>Status
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ARGUMENT_STATUS_DRAFT">Draft (only saved)</option>
          <option value="ARGUMENT_STATUS_SUBMITTED">Submitted (ready for AI)</option>
        </select>
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : initial ? 'Save changes' : 'Save argument'}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
