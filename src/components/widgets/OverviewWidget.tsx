import { useEffect, useState } from 'react';
import { fetchDepartments, fetchInvitations, fetchMembers } from '../../lib/api';

interface OverviewWidgetProps {
  companyId: string;
}

export default function OverviewWidget({ companyId }: OverviewWidgetProps) {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [members, setMembers] = useState(0);
  const [departments, setDepartments] = useState(0);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState('loading');
      setError('');
      try {
        const [m, d, inv] = await Promise.all([fetchMembers(companyId), fetchDepartments(companyId), fetchInvitations(companyId)]);
        if (cancelled) return;
        if (m.status !== 200 || d.status !== 200 || inv.status !== 200) {
          setError('Company overview could not be loaded. Please try again.');
          setState('error');
          return;
        }
        setMembers(Array.isArray(m.data.members) ? m.data.members.length : 0);
        setDepartments(Array.isArray(d.data.departments) ? d.data.departments.length : 0);
        const list = Array.isArray(inv.data.invitations) ? inv.data.invitations : [];
        setPending(list.filter((i) => (i as { state?: string }).state === 'pending').length);
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Company overview could not be loaded. Please try again.');
          setState('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (state === 'loading') return <p className="text-sm text-slate-600 dark:text-slate-300">Loading overview…</p>;
  if (state === 'error') return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <p className="text-2xl font-bold">{members}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">Team members</p>
      </div>
      <div>
        <p className="text-2xl font-bold">{departments}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">Departments</p>
      </div>
      <div>
        <p className="text-2xl font-bold">{pending}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">Pending invites</p>
      </div>
    </div>
  );
}
