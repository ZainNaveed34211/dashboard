import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchMembers, type MemberInfo } from '../../lib/api';

interface MembersChartWidgetProps {
  companyId: string;
}

export default function MembersChartWidget({ companyId }: MembersChartWidgetProps) {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<{ name: string; members: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState('loading');
      setError('');
      try {
        const res = await fetchMembers(companyId);
        if (cancelled) return;
        if (res.status !== 200 || !Array.isArray(res.data.members)) {
          setError('Department chart could not be loaded. Please try again.');
          setState('error');
          return;
        }
        const counts = new Map<string, number>();
        for (const m of res.data.members as MemberInfo[]) {
          const name = m.departmentName || 'No department';
          counts.set(name, (counts.get(name) || 0) + 1);
        }
        setRows(Array.from(counts.entries()).map(([name, members]) => ({ name, members })).sort((a, b) => b.members - a.members));
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Department chart could not be loaded. Please try again.');
          setState('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (state === 'loading') return <p className="text-sm text-slate-600 dark:text-slate-300">Loading chart…</p>;
  if (state === 'error') return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-300">No team members yet. Invite the first member from the Employees page.</p>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="members" fill="#5F3EC1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
