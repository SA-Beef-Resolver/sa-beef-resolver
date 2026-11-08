import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import Icon from '../components/Icon';

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
    <div className="auth-layout">
      <aside className="auth-story">
        <p className="eyebrow">A better way through disagreement</p>
        <h1>Make room for<br /><em>both sides.</em></h1>
        <p>Start with what happened. Invite the other person to respond. Keep the evidence and the conversation in one place.</p>
        <div className="auth-story-footer"><span className="story-rule" />A clearer path from conflict to resolution.</div>
      </aside>
      <section className="auth-form-wrap">
        <div className="auth-form-head">
          <span className="auth-form-icon"><Icon name="users" size={22}/></span>
          <p className="eyebrow">{isRegister ? 'Get started' : 'Welcome back'}</p>
          <h2>{isRegister ? 'Create your account' : 'Sign in to your account'}</h2>
          <p className="lead">{isRegister ? 'Create an account to start and manage your disputes.' : 'Pick up where your conversation left off.'}</p>
        </div>
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
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'} <Icon name="arrow" size={17}/></button>
      </form>
      <p className="muted auth-switch">
        {isRegister ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
      </p>
      </section>
    </div>
  );
}
