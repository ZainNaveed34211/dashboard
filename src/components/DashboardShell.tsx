import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LOGO_URL, LOGO_DARK_URL } from '../logoData';
import { SUPPORT_URL, type CompanyInfo } from '../lib/api';
import CompanyPicker from './CompanyPicker';
import Footer from './Footer';

interface DashboardShellProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => void;
  children: ReactNode;
}

interface SectionState {
  company: boolean;
  navigate: boolean;
}

function loadSections(): SectionState {
  try {
    const raw = window.localStorage.getItem('kluzar-dashboard-sidebar-sections');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SectionState>;
      return { company: parsed.company !== false, navigate: parsed.navigate !== false };
    }
  } catch {
  }
  return { company: true, navigate: true };
}

export default function DashboardShell({ companies, selectedCompanyId, onSelectCompany, theme, onToggleTheme, onLogout, children }: DashboardShellProps) {
  const [sections, setSections] = useState<SectionState>(loadSections);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('kluzar-dashboard-sidebar-sections', JSON.stringify(sections));
    } catch {
    }
  }, [sections]);

  const toggleSection = (key: keyof SectionState) => {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const linkClass = ({ isActive }: { isActive: boolean }) => 'block rounded-lg px-3 py-2 text-sm font-semibold ' + (isActive ? 'bg-white/20 text-white' : 'text-violet-100 hover:bg-white/10');

  const sidebar = (
    <div className="flex h-full flex-col bg-[#000080] text-white">
      <Link to="/" className="flex items-center px-4 py-4" onClick={() => setMenuOpen(false)}>
        <img src={LOGO_DARK_URL} alt="Kluzar" className="h-9 w-auto" />
      </Link>
      <div className="px-4 pb-2">
        <button type="button" onClick={() => toggleSection('company')} className="flex w-full items-center justify-between py-2 text-left text-xs font-bold uppercase tracking-wide text-violet-200">
          <span>Company</span>
          <span>{sections.company ? '−' : '+'}</span>
        </button>
        {sections.company && (
          <div className="pb-2">
            <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
            {companies.length === 1 && (
              <p className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">{companies[0].name} ({companies[0].role})</p>
            )}
            {companies.length === 0 && (
              <p className="rounded-lg bg-white/10 px-3 py-2 text-sm">No company selected.</p>
            )}
          </div>
        )}
      </div>
      <nav className="flex-1 px-4 pb-2">
        <button type="button" onClick={() => toggleSection('navigate')} className="flex w-full items-center justify-between py-2 text-left text-xs font-bold uppercase tracking-wide text-violet-200">
          <span>Navigate</span>
          <span>{sections.navigate ? '−' : '+'}</span>
        </button>
        {sections.navigate && (
          <div className="space-y-1">
            <NavLink to="/" end className={linkClass} onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
            <NavLink to="/employees" className={linkClass} onClick={() => setMenuOpen(false)}>Employees</NavLink>
            <NavLink to="/departments" className={linkClass} onClick={() => setMenuOpen(false)}>Departments</NavLink>
            <NavLink to="/permissions" className={linkClass} onClick={() => setMenuOpen(false)}>Permissions</NavLink>
            <NavLink to="/projects" className={linkClass} onClick={() => setMenuOpen(false)}>Projects</NavLink>
            <NavLink to="/tasks" className={linkClass} onClick={() => setMenuOpen(false)}>Tasks</NavLink>
            <NavLink to="/calendar" className={linkClass} onClick={() => setMenuOpen(false)}>Calendar</NavLink>
            <NavLink to="/documents" className={linkClass} onClick={() => setMenuOpen(false)}>Documents</NavLink>
            <NavLink to="/announcements" className={linkClass} onClick={() => setMenuOpen(false)}>Announcements</NavLink>
            <NavLink to="/attendance" className={linkClass} onClick={() => setMenuOpen(false)}>Attendance</NavLink>
            <NavLink to="/profile" className={linkClass} onClick={() => setMenuOpen(false)}>My profile</NavLink>
          </div>
        )}
      </nav>
      <div className="space-y-2 px-4 py-4">
        <button type="button" onClick={onToggleTheme} className="w-full rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white">
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
        <button type="button" onClick={onLogout} className="w-full rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold text-white">Logout</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-[#0f1220] dark:text-slate-100">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#171a2e] md:hidden">
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600">Menu</button>
        <img src={theme === 'dark' ? LOGO_DARK_URL : LOGO_URL} alt="Kluzar" className="h-8 w-auto" />
        <a href={SUPPORT_URL} className="rounded-lg bg-[#000080] px-3 py-2 text-sm font-semibold text-white">Support</a>
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</div>
        </div>
      )}
      <div className="flex flex-1">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 md:block">{sidebar}</aside>
        <div className="flex min-w-0 flex-1 flex-col md:pl-64">
          <div className="hidden items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#171a2e] md:flex">
            <a href={SUPPORT_URL} className="rounded-lg bg-[#000080] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Support</a>
          </div>
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  );
}
