import { useEffect, useState } from 'react';
import { createCompany, fetchLayout, friendlyError, saveLayout, setCompanyDefaultLayout, type CompanyInfo, type WidgetItem } from '../lib/api';
import { BUILTIN_WIDGETS, WIDGET_CATALOG, layoutSource, widgetTitle, widgetsFrom } from '../lib/widgets';
import WidgetGrid from '../components/widgets/WidgetGrid';

interface DashboardPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  userType: string;
  onCompanyCreated: (companyId: string) => void;
}

export default function DashboardPage({ companies, selectedCompanyId, userType, onCompanyCreated }: DashboardPageProps) {
  const [widgets, setWidgets] = useState<WidgetItem[]>([]);
  const [source, setSource] = useState('');
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [addId, setAddId] = useState('overview');
  const [companyName, setCompanyName] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const canSetDefault = selectedCompany?.role === 'owner' || selectedCompany?.role === 'admin';

  useEffect(() => {
    if (!selectedCompanyId) {
      setState('ready');
      setWidgets([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setState('loading');
      setError('');
      try {
        const res = await fetchLayout(selectedCompanyId);
        if (cancelled) return;
        if (res.status !== 200) {
          setError(friendlyError(res.data, 'Dashboard layout could not be loaded. Please try again.'));
          setState('error');
          return;
        }
        setWidgets(widgetsFrom(res.data));
        setSource(layoutSource(res.data));
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Dashboard layout could not be loaded. Please try again.');
          setState('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  async function persist(next: WidgetItem[], message: string) {
    if (!selectedCompanyId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await saveLayout(selectedCompanyId, next);
      if (res.status !== 200) {
        setError(friendlyError(res.data, 'Layout could not be saved. Please try again.'));
        return;
      }
      setWidgets(next);
      setSource('personal');
      setNotice(message);
    } catch {
      setError('Layout could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (widgets.some((w) => w.id === addId)) return;
    await persist([...widgets, { id: addId, x: 0, y: 0, w: 12, h: 4 }], 'Widget added.');
  }

  async function handleReset() {
    await persist(BUILTIN_WIDGETS, 'Layout reset to the default widgets.');
  }

  async function handleSetDefault() {
    if (!selectedCompanyId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await setCompanyDefaultLayout(selectedCompanyId, widgets);
      if (res.status !== 200) {
        setError(friendlyError(res.data, 'Company default could not be saved. Please try again.'));
        return;
      }
      setNotice('Company default layout saved.');
    } catch {
      setError('Company default could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) return;
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const res = await createCompany(name);
      if (res.status !== 200 || typeof res.data.company !== 'object' || res.data.company === null) {
        setError(friendlyError(res.data, 'Company could not be created. Please try again.'));
        return;
      }
      const created = res.data.company as { id?: unknown };
      setCompanyName('');
      setNotice('Company created.');
      if (typeof created.id === 'string') onCompanyCreated(created.id);
    } catch {
      setError('Company could not be created. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  if (!selectedCompanyId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">No companies with an active Max subscription were found for this sign-in.</p>
        {userType === 'owner' && (
          <form onSubmit={handleCreateCompany} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
            <h2 className="font-bold">Create your first company</h2>
            <label className="mt-3 block text-sm font-semibold" htmlFor="new-company-name">Company name</label>
            <input id="new-company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            <button type="submit" disabled={creating} className="mt-3 rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">{creating ? 'Creating…' : 'Create company'}</button>
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            {notice && <p className="mt-3 text-sm text-green-700 dark:text-green-400">{notice}</p>}
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{selectedCompany ? selectedCompany.name : 'Dashboard'}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Layout: {source === 'personal' ? 'your personal layout' : source === 'company-default' ? 'company default layout' : 'default layout'}. Drag widgets by their titles to rearrange them.</p>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      {notice && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">{notice}</p>}
      {state === 'loading' ? (
        <p className="mt-6 text-slate-600 dark:text-slate-300">Loading dashboard…</p>
      ) : state === 'error' ? (
        <p className="mt-6 text-slate-600 dark:text-slate-300">Dashboard widgets could not be loaded.</p>
      ) : (
        <>
          <div className="mt-6">
            <WidgetGrid companyId={selectedCompanyId} widgets={widgets} onReorder={(next) => persist(next, 'Layout saved.')} onRemove={(index) => persist(widgets.filter((_, i) => i !== index), 'Widget removed.')} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#171a2e]">
            <label className="text-sm font-semibold" htmlFor="add-widget">Add widget</label>
            <select id="add-widget" value={addId} onChange={(e) => setAddId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              {WIDGET_CATALOG.map((w) => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
            <button type="button" onClick={handleAdd} disabled={saving || widgets.some((w) => w.id === addId)} className="rounded-lg bg-[#000080] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Add</button>
            <button type="button" onClick={handleReset} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Reset to default</button>
            {canSetDefault && (
              <button type="button" onClick={handleSetDefault} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Set as company default</button>
            )}
          </div>
        </>
      )}
      <div className="mt-10">
        <h2 className="text-xl font-bold">Your companies</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {companies.map((company) => (
            <li key={company.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
              <p className="text-lg font-bold">{company.name}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Role: {company.role}</p>
              <p className="mt-1 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-[#141272] dark:bg-violet-900 dark:text-violet-100">Max</p>
            </li>
          ))}
        </ul>
      </div>
      {userType === 'owner' && (
        <form onSubmit={handleCreateCompany} className="mt-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Create a company</h2>
          <label className="mt-3 block text-sm font-semibold" htmlFor="create-company-name">Company name</label>
          <input id="create-company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <button type="submit" disabled={creating} className="mt-3 rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">{creating ? 'Creating…' : 'Create company'}</button>
        </form>
      )}
    </div>
  );
}
