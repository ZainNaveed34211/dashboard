import { Link } from 'react-router-dom';
import { LOGO_URL, LOGO_DARK_URL } from '../logoData';
import { SUPPORT_URL } from '../lib/api';

interface HeaderProps {
  theme: string;
  onToggleTheme: () => void;
  signedIn: boolean;
  onLogout: () => void;
}

export default function Header({ theme, onToggleTheme, signedIn, onLogout }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[#171a2e]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center">
          <img src={theme === 'dark' ? LOGO_DARK_URL : LOGO_URL} alt="Kluzar" className="h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Home</Link>
          {!signedIn && (
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Login</Link>
          )}
          <a href={SUPPORT_URL} className="rounded-lg bg-[#000080] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Support</a>
          <button type="button" onClick={onToggleTheme} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          {signedIn && (
            <button type="button" onClick={onLogout} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Logout</button>
          )}
        </nav>
      </div>
    </header>
  );
}
