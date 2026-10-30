import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import InvitePage from './pages/InvitePage';
import UpgradePage from './pages/UpgradePage';
import { companiesFrom, fetchMe, getDashboardToken, logout, ownerSession, setDashboardToken, type CompanyInfo } from './lib/api';
import { loadGoogleAnalytics, trackPageView } from './lib/analytics';

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

export default function App() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('kluzar-dashboard-theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const [status, setStatus] = useState('loading');
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [userType, setUserType] = useState('');
  const [plan, setPlan] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('kluzar-dashboard-theme', theme);
    } catch {
    }
  }, [theme]);

  const ownerAttempt = useCallback(async () => {
    try {
      const res = await ownerSession();
      if (res.status === 200 && typeof res.data.sessionToken === 'string') {
        setDashboardToken(res.data.sessionToken);
        setCompanies(companiesFrom(res.data));
        setUserType(typeof res.data.userType === 'string' ? res.data.userType : 'owner');
        setStatus('ready');
        return;
      }
      if (res.status === 403) {
        setPlan(typeof res.data.plan === 'string' ? res.data.plan : '');
        setStatus('upgrade');
        return;
      }
      setStatus('guest');
    } catch {
      setStatus('guest');
    }
  }, []);

  const initialAuth = useCallback(async () => {
    try {
      const redirect = window.sessionStorage.getItem('kluzar-spa-redirect');
      if (redirect && redirect.startsWith('/')) {
        window.sessionStorage.removeItem('kluzar-spa-redirect');
        navigate(redirect, { replace: true });
      }
    } catch {
    }
    loadGoogleAnalytics();
    if (getDashboardToken()) {
      try {
        const me = await fetchMe();
        if (me.status === 200) {
          setCompanies(companiesFrom(me.data));
          setUserType(typeof me.data.userType === 'string' ? me.data.userType : '');
          setStatus('ready');
          return;
        }
        if (me.status === 403) {
          setStatus('upgrade');
          return;
        }
      } catch {
      }
      setDashboardToken(null);
    }
    await ownerAttempt();
  }, [navigate, ownerAttempt]);

  useEffect(() => {
    initialAuth();
  }, [initialAuth]);

  const handleSignedIn = useCallback(async () => {
    try {
      const me = await fetchMe();
      if (me.status === 200) {
        setCompanies(companiesFrom(me.data));
        setUserType(typeof me.data.userType === 'string' ? me.data.userType : '');
        setStatus('ready');
        return;
      }
      if (me.status === 403) {
        setStatus('upgrade');
        return;
      }
    } catch {
    }
    setDashboardToken(null);
    setStatus('guest');
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setCompanies([]);
    setUserType('');
    setPlan('');
    setStatus('guest');
    navigate('/');
  }, [navigate]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-[#0f1220] dark:text-slate-100">
      <PageTracker />
      <Header theme={theme} onToggleTheme={toggleTheme} signedIn={status === 'ready'} onLogout={handleLogout} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={status === 'upgrade' ? <Navigate to="/upgrade" replace /> : <HomePage status={status} companies={companies} userType={userType} onLogout={handleLogout} />} />
          <Route path="/login" element={<LoginPage onSignedIn={handleSignedIn} />} />
          <Route path="/invite" element={<InvitePage onSignedIn={handleSignedIn} />} />
          <Route path="/upgrade" element={<UpgradePage plan={plan} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
