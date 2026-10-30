import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDepartments, type DepartmentInfo } from '../../lib/api';

interface DepartmentsWidgetProps {
  companyId: string;
  limit?: number;
}

export default function DepartmentsWidget({ companyId, limit = 10 }: DepartmentsWidgetProps) {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState('loading');
      setError('');
      try {
        const res = await fetchDepartments(companyId);
        if (cancelled) return;
        if (res.status !== 200 || !Array.isArray(res.data.departments)) {
          setError('Department list could not be loaded. Please try again.');
          setState('error');
          return;
        }
        setDepartments(res.data.departments as DepartmentInfo[]);
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Department list could not be loaded. Please try again.');
          setState('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (state === 'loading') return <p className="text-sm text-slate-600 dark:text-slate-300">Loading departments…</p>;
  if (state === 'error') return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (departments.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-300">No departments yet. Create the first department from the Departments page.</p>;
  return (
    <div>
      <ul className="space-y-2">
        {departments.slice(0, limit).map((d) => (
          <li key={d.id} className="text-sm font-semibold">{d.name}</li>
        ))}
      </ul>
      <Link to="/departments" className="mt-3 inline-block text-sm font-semibold text-[#141272] dark:text-[#9d8cff]">Manage departments</Link>
    </div>
  );
}
