import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CompanyPicker from '../components/CompanyPicker';
import { fetchReport, friendlyError, type CompanyInfo, type ReportData } from '../lib/api';

interface ReportsPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

function asReport(data: Record<string, unknown>): ReportData | null {
  const report = data.report;
  if (!report || typeof report !== 'object') return null;
  return report as ReportData;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

function buildCsv(report: ReportData): string {
  const lines: string[] = [];
  lines.push('Section,Key,Count');
  for (const row of report.membersByDepartment) lines.push(['Members by department', row.departmentName || 'No department', String(row.count)].map(csvEscape).join(','));
  for (const row of report.membersByRole) lines.push(['Members by role', row.role, String(row.count)].map(csvEscape).join(','));
  for (const row of report.projectsByStatus) lines.push(['Projects by status', row.status, String(row.count)].map(csvEscape).join(','));
  for (const row of report.tasksByStatus) lines.push(['Tasks by status', row.status, String(row.count)].map(csvEscape).join(','));
  for (const row of report.tasksByPriority) lines.push(['Tasks by priority', row.priority, String(row.count)].map(csvEscape).join(','));
  for (const row of report.tasksByAssignee) lines.push(['Tasks by assignee', row.assigneeUserId || 'Unassigned', String(row.count)].map(csvEscape).join(','));
  for (const row of report.attendanceByStatus) lines.push(['Attendance by status', row.status, String(row.count)].map(csvEscape).join(','));
  lines.push(['Documents', 'Count', String(report.documentsCount)].map(csvEscape).join(','));
  lines.push(['Documents', 'Total bytes', String(report.documentsTotalBytes)].map(csvEscape).join(','));
  return lines.join('\n');
}

function CountList({ title, rows, emptyText }: { title: string; rows: { label: string; count: number }[]; emptyText: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
      <h2 className="font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-2">
              <span>{row.label}</span>
              <span className="font-bold">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReportsPage({ companies, selectedCompanyId, onSelectCompany }: ReportsPageProps) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');

  const role = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const canExport = role !== 'employee';

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchReport(selectedCompanyId, appliedStart, appliedEnd);
      if (res.status === 200) {
        setReport(asReport(res.data));
      } else {
        setError(friendlyError(res.data, 'Report could not be loaded.'));
      }
    } catch {
      setError('Report could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, appliedStart, appliedEnd]);

  useEffect(() => {
    load();
  }, [load]);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setAppliedStart(start);
    setAppliedEnd(end);
  }

  function handleCsv() {
    if (!report) return;
    const blob = new Blob([buildCsv(report)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'kluzar-report.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading report…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Reports and analytics</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Real totals from your company data. Member counts are current; tasks, projects, documents, attendance and activity follow the date range below.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      <form onSubmit={handleFilter} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <div>
          <label className="block text-sm font-semibold" htmlFor="report-start">From</label>
          <input id="report-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="report-end">To</label>
          <input id="report-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        </div>
        <button type="submit" className="rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white">Apply range</button>
        {canExport && report && (
          <button type="button" onClick={handleCsv} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Download CSV</button>
        )}
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Print</button>
      </form>

      {!report ? (
        <p className="mt-6 text-slate-500 dark:text-slate-400">No report data yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <CountList title="Members by department" rows={report.membersByDepartment.map((r) => ({ label: r.departmentName || 'No department', count: r.count }))} emptyText="No members yet. Invite your first member from the Employees page." />
          <CountList title="Members by role" rows={report.membersByRole.map((r) => ({ label: r.role, count: r.count }))} emptyText="No members yet." />
          <CountList title="Projects by status" rows={report.projectsByStatus.map((r) => ({ label: r.status, count: r.count }))} emptyText="No projects yet. Create your first project on the Projects page." />
          <CountList title="Tasks by status" rows={report.tasksByStatus.map((r) => ({ label: r.status, count: r.count }))} emptyText="No tasks yet. Create your first task on the Tasks page." />
          <CountList title="Tasks by priority" rows={report.tasksByPriority.map((r) => ({ label: r.priority, count: r.count }))} emptyText="No tasks yet." />
          <CountList title="Tasks by assignee" rows={report.tasksByAssignee.map((r) => ({ label: r.assigneeUserId || 'Unassigned', count: r.count }))} emptyText="No tasks yet." />
          <CountList title="Attendance by status" rows={report.attendanceByStatus.map((r) => ({ label: r.status, count: r.count }))} emptyText="No attendance records yet. Check in from the Attendance page." />
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
            <h2 className="font-bold">Documents</h2>
            {report.documentsCount === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No documents yet. Upload your first document on the Documents page.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                <li className="flex justify-between gap-2"><span>Files</span><span className="font-bold">{report.documentsCount}</span></li>
                <li className="flex justify-between gap-2"><span>Total stored</span><span className="font-bold">{report.documentsTotalBytes} bytes</span></li>
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e] sm:col-span-2">
            <h2 className="font-bold">Recent activity</h2>
            {report.recentActivity.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No activity yet. Activity appears here once members create projects, tasks and events.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {report.recentActivity.map((a, i) => (
                  <li key={a.targetId + '-' + a.createdAt + '-' + i}>{a.action} · {a.targetType} · {a.createdAt.slice(0, 10)}</li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">
            Totals: {report.membersTotal} members · {report.projectsTotal} projects · {report.tasksTotal} tasks · {report.attendanceTotal} attendance records. <Link to="/tasks" className="font-semibold text-violet-700 dark:text-violet-300">View tasks</Link>
          </p>
        </div>
      )}
    </div>
  );
}
