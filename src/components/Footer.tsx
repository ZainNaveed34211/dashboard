import { SUPPORT_URL } from '../lib/api';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-[#171a2e]">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 px-4 py-5 sm:flex-row sm:items-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Kluzar Dashboard — Company Management</p>
        <div className="flex items-center gap-3">
          <a href={SUPPORT_URL} className="rounded-lg bg-[#000080] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Support</a>
          <a href="mailto:info@kluzar.com" className="text-sm font-semibold text-[#141272] dark:text-[#9d8cff]">info@kluzar.com</a>
        </div>
      </div>
    </footer>
  );
}
