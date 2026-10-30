import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMembers, type MemberInfo } from '../../lib/api';

interface TeamWidgetProps {
  companyId: string;
  limit?: number;
}

export default function TeamWidget({ companyId, limit = 10 }: TeamWidgetProps) {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [members, setMembers] = useState<MemberInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState('loading');
      setError('');
      try {
        const res = await fetchMembers(companyId);
        if (cancelled) return;
        if (res.status !== 200 || !Array.isArray(res.data.members)) {
          setError('Team list could not be loaded. Please try again.');
          setState('error');
          return;
        }
        setMembers(res.data.members as MemberInfo[]);
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Team list could not be loaded. Please try again.');
          setState('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (state === 'loading') return <p className="text-sm text-slate-600 dark:text-slate-300">Loading team…</p>;
  if (state === 'error') return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (members.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-300">No team members yet. Invite the first member from the Employees page.</p>;
  return (
    <div>
      <ul className="space-y-2">
        {members.slice(0, limit).map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{m.email || m.userId}</span>
            <span className="shrink-0 font-semibold">{m.role}</span>
          </li>
        ))}
      </ul>
      <Link to="/employees" className="mt-3 inline-block text-sm font-semibold text-[#141272] dark:text-[#9d8cff]">Manage team</Link>
    </div>
  );
}
