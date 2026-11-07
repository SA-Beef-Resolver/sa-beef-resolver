import { useEffect, useState } from 'react';
import { api } from '../api';

const FIELDS = [
  ['summary', 'Summary'],
  ['perspective1', 'Side 1 perspective'],
  ['perspective2', 'Side 2 perspective'],
  ['missingInformation', 'Missing information'],
  ['proposedResolution', 'Proposed resolution']
];

// Polls the AI result for a dispute until it is resolved.
export default function AiPanel({ disputeId, refreshKey }) {
  const [result, setResult] = useState(null);
  const [state, setState] = useState('loading'); // loading | none | ready | error
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    async function poll() {
      try {
        const data = await api.resolution(disputeId);
        if (cancelled) return;
        if (data.status === 'none') {
          setResult(null);
          setState('none');
          timer = setTimeout(poll, 6000); // the first submission may still be queued
          return;
        }
        setResult(data);
        setState('ready');
        setError('');
        if (data.status !== 'resolved') timer = setTimeout(poll, 4000);
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(err.message);
        timer = setTimeout(poll, 8000);
      }
    }
    setState('loading');
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [disputeId, refreshKey]);

  async function showHistory() {
    try { setHistory((await api.resolutionHistory(disputeId)).resolutions); } catch (err) { setError(err.message); }
  }

  return (
    <section className="card" data-testid="ai-panel">
      <div className="row">
        <h2>AI resolution</h2>
        {result && <span className={`badge ${result.status}`} data-testid="ai-status">{result.status}</span>}
      </div>

      {state === 'loading' && <p className="muted">Checking for a result...</p>}
      {state === 'none' && <p className="muted">No AI result yet. Both people must submit their side first, then the AI works (a small local model can take a minute).</p>}
      {state === 'error' && <p className="error" role="alert">{error}</p>}

      {result && result.status === 'waiting_for_other_person' && (
        <p className="muted">One side has been received ({result.messageCount} message). Waiting for the other person to submit.</p>
      )}

      {result?.resolution && (
        <dl>
          {FIELDS.map(([key, label]) => (
            <div key={key}><dt>{label}</dt><dd>{result.resolution[key]}</dd></div>
          ))}
        </dl>
      )}
      {result && <p className="muted">Round {result.version}</p>}

      {result && <button className="ghost" onClick={showHistory}>Show all AI rounds</button>}
      {history && (
        <ol className="history">
          {history.map((row) => (
            <li key={row.version}>
              <strong>Round {row.version}</strong> <span className="muted">{row.createdAt} · {row.model}</span>
              <p>{row.resolution.proposedResolution}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
