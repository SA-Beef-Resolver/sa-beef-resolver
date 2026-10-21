import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import AuthPage from './pages/AuthPage';
import Disputes from './pages/Disputes';
import DisputeDetail from './pages/DisputeDetail';

function Protected({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function Nav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="nav">
      <Link to="/" className="brand">Me Don&apos;t Wrong</Link>
      {user && (
        <div className="nav-user">
          <span data-testid="current-user">{user.display_name}</span>
          <button className="ghost" onClick={() => { signOut(); navigate('/login'); }}>Sign out</button>
        </div>
      )}
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
          <Route path="/disputes/:id" element={<Protected><DisputeDetail /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
