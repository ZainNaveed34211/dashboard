import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import DashboardShell from './components/DashboardShell';
import { companiesFrom, fetchMe, logout, ownerSession, setDashboardToken, type CompanyInfo } from './lib/api';
import { validateNext } from './lib/next';
import { loadGoogleAnalytics, setFirstPartyCompany, trackPageView } from './lib/analytics';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const UpgradePage = lazy(() => import('./pages/UpgradePage'));
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'));
const PermissionsPage = lazy(() => import('./pages/PermissionsPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [userId, setUserId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

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
        setUserId(typeof res.data.userId === 'string' ? res.data.userId : '');
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
    try {
      const me = await fetchMe();
      if (me.status === 200) {
        setCompanies(companiesFrom(me.data));
        setUserType(typeof me.data.userType === 'string' ? me.data.userType : '');
        setUserId(typeof me.data.userId === 'string' ? me.data.userId : '');
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
        setUserId(typeof me.data.userId === 'string' ? me.data.userId : '');
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
    setUserId('');
    setSelectedCompanyId('');
    setPlan('');
    setStatus('guest');
    navigate('/');
  }, [navigate]);

  const handleCompanyCreated = useCallback(async (companyId: string) => {
    try {
      const me = await fetchMe();
      if (me.status === 200) {
        setCompanies(companiesFrom(me.data));
        setSelectedCompanyId(companyId);
      }
    } catch {
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    if (status === 'ready' && location.pathname === '/login') {
      const target = validateNext(new URLSearchParams(location.search).get('next') || '/');
      if (target !== location.pathname) navigate(target, { replace: true });
    }
  }, [status, location, navigate]);

  useEffect(() => {
    if (companies.length === 0) {
      if (selectedCompanyId) setSelectedCompanyId('');
      return;
    }
    if (!selectedCompanyId || !companies.some((c) => c.id === selectedCompanyId)) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  useEffect(() => {
    setFirstPartyCompany(selectedCompanyId);
  }, [selectedCompanyId]);

  const shellPaths = ['/', '/employees', '/departments', '/permissions', '/projects', '/tasks', '/calendar', '/documents', '/announcements', '/attendance', '/reports', '/notifications', '/profile'];
  const inShell = status === 'ready' && shellPaths.includes(location.pathname);

  return (
    <div className="flex min-h-screen flex-col bg-[#E9E8E8] text-[#171717] dark:bg-[#0f1220] dark:text-slate-100">
      <PageTracker />
      {!inShell && <Header theme={theme} onToggleTheme={toggleTheme} signedIn={status === 'ready'} onLogout={handleLogout} />}
      <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-10"><p className="text-lg text-slate-600 dark:text-slate-300">Loading…</p></div>}>
      {inShell ? (
        <DashboardShell companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} theme={theme} onToggleTheme={toggleTheme} onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<DashboardPage companies={companies} selectedCompanyId={selectedCompanyId} userType={userType} onCompanyCreated={handleCompanyCreated} />} />
            <Route path="/employees" element={<EmployeesPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} callerUserId={userId} />} />
            <Route path="/departments" element={<DepartmentsPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />} />
            <Route path="/permissions" element={<PermissionsPage />} />
            <Route path="/projects" element={<ProjectsPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />} />
            <Route path="/tasks" element={<TasksPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} callerUserId={userId} />} />
            <Route path="/calendar" element={<CalendarPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />} />
            <Route path="/documents" element={<DocumentsPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />} />
            <Route path="/announcements" element={<AnnouncementsPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} callerUserId={userId} />} />
            <Route path="/attendance" element={<AttendancePage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} callerUserId={userId} />} />
            <Route path="/reports" element={<ReportsPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />} />
            <Route path="/notifications" element={<NotificationsPage companies={companies} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </DashboardShell>
      ) : (
        <>
          <main className="flex-1">
            <Routes>
              <Route path="/" element={status === 'upgrade' ? <Navigate to="/upgrade" replace /> : <HomePage status={status} companies={companies} userType={userType} onLogout={handleLogout} />} />
              <Route path="/login" element={<LoginPage onSignedIn={handleSignedIn} />} />
              <Route path="/invite" element={<InvitePage />} />
              <Route path="/upgrade" element={status === 'ready' ? <Navigate to="/" replace /> : <UpgradePage plan={plan} />} />
              <Route path="/employees" element={<Navigate to="/" replace />} />
              <Route path="/departments" element={<Navigate to="/" replace />} />
              <Route path="/permissions" element={<Navigate to="/" replace />} />
              <Route path="/projects" element={<Navigate to="/" replace />} />
              <Route path="/tasks" element={<Navigate to="/" replace />} />
              <Route path="/calendar" element={<Navigate to="/" replace />} />
              <Route path="/documents" element={<Navigate to="/" replace />} />
              <Route path="/announcements" element={<Navigate to="/" replace />} />
              <Route path="/attendance" element={<Navigate to="/" replace />} />
              <Route path="/reports" element={<Navigate to="/" replace />} />
              <Route path="/notifications" element={<Navigate to="/" replace />} />
              <Route path="/profile" element={<Navigate to="/" replace />} />
              <Route path="*" element={status === 'ready' ? <NotFoundPage /> : <Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </>
      )}
      </Suspense>
    </div>
  );
}
