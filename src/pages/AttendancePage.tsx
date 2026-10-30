import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { checkIn, checkOut, fetchAttendance, friendlyError, type AttendanceInfo, type CompanyInfo } from '../lib/api';

interface AttendancePageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  callerUserId: string;
}

function asAttendance(data: Record<string, unknown>): AttendanceInfo[] {
  const list = data.attendance;
  if (!Array.isArray(list)) return [];
  return list.filter((a): a is AttendanceInfo => !!a && typeof (a as AttendanceInfo).id === 'string');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage({ companies, selectedCompanyId, onSelectCompany, callerUserId }: AttendancePageProps) {
  const [records, setRecords] = useState<AttendanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState('present');
  const [note, setNote] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const seesTeam = callerRole === 'owner' || callerRole === 'admin' || callerRole === 'manager';

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchAttendance(selectedCompanyId, filterDate ? { date: filterDate } : {});
      if (res.status === 200) {
        setRecords(asAttendance(res.data));
      } else {
        setError(friendlyError(res.data, 'Attendance could not be loaded.'));
      }
    } catch {
      setError('Attendance could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, filterDate]);

  useEffect(() => {
    load();
  }, [load]);

  const todayRecord = records.find((r) => r.userId === callerUserId && r.date === todayIso());

  async function handleCheckIn() {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await checkIn(selectedCompanyId, date, status, note);
      if (res.status === 200) {
        setMessage('Checked in.');
        setNote('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Check-in failed.'));
      }
    } catch {
      setError('Check-in failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await checkOut(selectedCompanyId, date, note);
      if (res.status === 200) {
        setMessage('Checked out.');
        setNote('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Check-out failed.'));
      }
    } catch {
      setError('Check-out failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading attendance…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Attendance</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">{seesTeam ? 'Your records and your team’s records.' : 'Your own check-in and check-out records.'}</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <h2 className="font-bold">Check in / out</h2>
        {todayRecord && !todayRecord.checkOutAt && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">You are checked in today since {new Date(todayRecord.checkInAt || '').toLocaleTimeString()}.</p>}
        {todayRecord && todayRecord.checkOutAt && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">You have checked out today.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-semibold" htmlFor="att-date">Date</label>
            <input id="att-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="att-status">Status</label>
            <select id="att-status" value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              <option value="present">Present</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="att-note">Note (optional)</label>
            <input id="att-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={handleCheckIn} className="rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Saving…' : 'Check in'}
          </button>
          <button type="button" disabled={busy} onClick={handleCheckOut} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600 disabled:opacity-50">
            {busy ? 'Saving…' : 'Check out'}
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-xl font-bold">Records</h2>
          <div>
            <label className="block text-sm font-semibold" htmlFor="att-filter-date">Filter by date</label>
            <input id="att-filter-date" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
        </div>
        {records.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No attendance records yet. Check in above to create your first record.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Check-in</th>
                  <th className="px-4 py-3">Check-out</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">{record.userId}</td>
                    <td className="px-4 py-3">{record.date}</td>
                    <td className="px-4 py-3">{record.status}</td>
                    <td className="px-4 py-3">{record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString() : '—'}</td>
                    <td className="px-4 py-3">{record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString() : '—'}</td>
                    <td className="px-4 py-3">{record.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
