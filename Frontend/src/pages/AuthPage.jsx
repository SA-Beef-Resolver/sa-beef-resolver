import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function AuthPage({ mode }) {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  if (user) return <Navigate to="/" replace />;

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await signUp(form.email, form.password, form.displayName);
      else await signIn(form.email, form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h1>{isRegister ? 'Create account' : 'Sign in'}</h1>
      <p className="muted">Resolve a beef with a friend: state your side, add evidence, get a neutral AI suggestion.</p>
      <form onSubmit={submit}>
        {isRegister && (
          <label>Display name
            <input value={form.displayName} onChange={set('displayName')} required maxLength={100} placeholder="Maya" />
          </label>
        )}
        <label>Email
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label>Password {isRegister && <span className="muted">(at least 12 characters)</span>}
          <input type="password" value={form.password} onChange={set('password')} required minLength={isRegister ? 12 : 1}
            autoComplete={isRegister ? 'new-password' : 'current-password'} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait...' : isRegister ? 'Register' : 'Sign in'}</button>
      </form>
      <p className="muted">
        {isRegister ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
      </p>
    </section>
  );
}
