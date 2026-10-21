import { useEffect, useState } from 'react';
import { api } from '../api';

// Short id suffix so two users with the same display name can be told apart.
export const shortId = (personId) => personId.slice(0, 4);

// Search for a user by display name and pick one. `value` is { person_id, display_name } or null.
export default function UserPicker({ value, onChange }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState('');

  useEffect(() => {
    const query = term.trim();
    if (value || query.length < 2) {
      setResults([]);
      setState('idle');
      return undefined;
    }
    let cancelled = false;
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchUsers(query);
        if (cancelled) return;
        setResults(data.users);
        setState('done');
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setState('error');
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [term, value]);

  if (value) {
    return (
      <div className="chip" data-testid="selected-opponent">
        <strong>{value.display_name}</strong>
        <span className="muted"> #{shortId(value.person_id)}</span>
        <button type="button" className="ghost" onClick={() => { onChange(null); setTerm(''); }}>Change</button>
      </div>
    );
  }

  return (
    <div className="picker">
      <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Type a name, e.g. B" aria-label="Search for the opponent" autoComplete="off" />
      {state === 'loading' && <p className="muted">Searching...</p>}
      {state === 'error' && <p className="error" role="alert">{error}</p>}
      {state === 'done' && results.length === 0 && <p className="muted">No users found. Ask them to register first.</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((person) => (
            <li key={person.person_id}>
              <button type="button" className="result" onClick={() => onChange(person)}>
                {person.display_name} <span className="muted">#{shortId(person.person_id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
