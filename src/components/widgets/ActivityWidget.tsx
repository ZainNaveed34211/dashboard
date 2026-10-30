import { useEffect, useState } from 'react';
import { fetchActivity, type ActivityEntry } from '../../lib/api';

interface ActivityWidgetProps {
  companyId: string;
  limit?: number;
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ');
}

export default function ActivityWidget({ companyId, limit = 10 }: ActivityWidgetProps) {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState('loading');
      setError('');
      try {
        const res = await fetchActivity(companyId, limit);
        if (cancelled) return;
        if (res.status !== 200 || !Array.isArray(res.data.activity)) {
          setError('Activity could not be loaded. Please try again.');
          setState('error');
          return;
        }
        setEntries(res.data.activity as ActivityEntry[]);
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Activity could not be loaded. Please try again.');
          setState('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, limit]);

  if (state === 'loading') return <p className="text-sm text-slate-600 dark:text-slate-300">Loading activity…</p>;
  if (state === 'error') return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (entries.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-300">No activity yet. Activity appears here when team changes happen.</p>;
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => (
        <li key={index} className="text-sm">
          <span className="font-semibold capitalize">{formatAction(entry.action)}</span>
          <span className="text-slate-600 dark:text-slate-300"> · {entry.targetType} · {new Date(entry.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
