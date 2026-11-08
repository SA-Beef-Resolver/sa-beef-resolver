import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import Icon from './components/Icon';
import AuthPage from './pages/AuthPage';
import Disputes from './pages/Disputes';
import DisputeDetail from './pages/DisputeDetail';
import Guide from './pages/Guide';

const modes = ['light', 'dark', 'system'];
const accents = ['red', 'clay', 'berry'];
function saved(key, fallback, allowed) {
  try { const value = localStorage.getItem(key); return allowed.includes(value) ? value : fallback; } catch { return fallback; }
}

function Appearance() {
  const [mode, setMode] = useState(() => saved('mdw-theme', 'light', modes));
  const [accent, setAccent] = useState(() => saved('mdw-accent', 'red', accents));
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.accent = accent;
    try { localStorage.setItem('mdw-theme', mode); localStorage.setItem('mdw-accent', accent); } catch { /* storage may be unavailable */ }
  }, [mode, accent]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !menuRef.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return <div className="appearance" ref={menuRef}>
    <button className="appearance-trigger" type="button" aria-label="Appearance" aria-expanded={open} aria-controls="appearance-panel" onClick={() => setOpen(!open)}><Icon name={mode === 'dark' ? 'moon' : 'sun'} size={17}/> <span>Appearance</span><Icon name="chevron" size={14}/></button>
    {open && <div className="appearance-panel" id="appearance-panel">
      <p className="panel-title">Appearance</p>
      <div className="segmented" role="group" aria-label="Color mode">{modes.map((option) => <button key={option} type="button" className={mode === option ? 'selected' : ''} aria-pressed={mode === option} onClick={() => setMode(option)}>{option}</button>)}</div>
      <p className="panel-title">Accent</p>
      <div className="swatches" role="group" aria-label="Accent color">{accents.map((option) => <button key={option} type="button" className={`swatch ${option} ${accent === option ? 'selected' : ''}`} aria-label={`${option} accent`} aria-pressed={accent === option} onClick={() => setAccent(option)}>{accent === option && <Icon name="check" size={15}/>}</button>)}</div>
    </div>}
  </div>;
}

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function Nav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <header className="nav">
      <div className="nav-inner"><Link to="/" className="brand"><span className="brand-mark" aria-hidden="true">M</span><span>Me Don&apos;t Wrong</span></Link>
      <nav className="primary-nav" aria-label="Main navigation">{user && <NavLink to="/" end>Disputes</NavLink>}<NavLink to="/guide">How it works</NavLink>{user && <Link className="nav-create" to="/#new-dispute"><Icon name="plus" size={15}/> New dispute</Link>}</nav>
      <div className="nav-actions"><Appearance/>{user ? <div className="nav-user"><span className="avatar" aria-hidden="true">{user.display_name?.slice(0,1).toUpperCase()}</span><span data-testid="current-user">{user.display_name}</span><button className="sign-out" onClick={() => { signOut(); navigate('/login'); }}>Sign out</button></div> : <Link className="nav-join" to={location.pathname === '/register' ? '/login' : '/register'}>{location.pathname === '/register' ? 'Sign in' : 'Get started'}</Link>}</div></div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <main className="page">
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/" element={<Protected><Disputes /></Protected>} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/disputes/:id" element={<Protected><DisputeDetail /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
