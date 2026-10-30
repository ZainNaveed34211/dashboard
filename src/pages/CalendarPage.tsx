import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CompanyPicker from '../components/CompanyPicker';
import { createEvent, deleteEvent, fetchDepartments, fetchEvents, fetchTasks, friendlyError, updateEvent, type CalendarEventInfo, type CompanyInfo, type DepartmentInfo, type TaskInfo } from '../lib/api';

interface CalendarPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

function asEvents(data: Record<string, unknown>): CalendarEventInfo[] {
  const list = data.events;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is CalendarEventInfo => !!m && typeof (m as CalendarEventInfo).id === 'string');
}

function asDepartments(data: Record<string, unknown>): DepartmentInfo[] {
  const list = data.departments;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is DepartmentInfo => !!m && typeof (m as DepartmentInfo).id === 'string');
}

function asTasks(data: Record<string, unknown>): TaskInfo[] {
  const list = data.tasks;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is TaskInfo => !!m && typeof (m as TaskInfo).id === 'string');
}

function toDay(date: Date): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function parseDay(day: string): Date {
  const parts = day.split('-').map((p) => parseInt(p, 10));
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function addDays(day: string, count: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + count);
  return toDay(date);
}

function monthLabel(day: string): string {
  const date = parseDay(day);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(day: string): string {
  const date = parseDay(day);
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function timeLabel(value: string): string {
  return value.slice(11, 16) || value;
}

const EVENT_KINDS = ['event', 'meeting', 'deadline'];
const EVENT_VISIBILITIES = ['company', 'department', 'personal'];

export default function CalendarPage({ companies, selectedCompanyId, onSelectCompany }: CalendarPageProps) {
  const [events, setEvents] = useState<CalendarEventInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(() => toDay(new Date()));
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newKind, setNewKind] = useState('event');
  const [newVisibility, setNewVisibility] = useState('company');
  const [newDepartment, setNewDepartment] = useState('');
  const [newTask, setNewTask] = useState('');
  const [editEvent, setEditEvent] = useState<CalendarEventInfo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editKind, setEditKind] = useState('event');
  const [editVisibility, setEditVisibility] = useState('company');
  const [editDepartment, setEditDepartment] = useState('');
  const [editTask, setEditTask] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const visibilityOptions = callerRole === 'employee' ? ['personal'] : EVENT_VISIBILITIES;

  const range = useCallback(() => {
    if (view === 'month') {
      const date = parseDay(anchor);
      const first = toDay(new Date(date.getFullYear(), date.getMonth(), 1));
      const last = toDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
      return { start: first + 'T00:00:00', end: last + 'T23:59:59', label: monthLabel(anchor) };
    }
    if (view === 'week') {
      const date = parseDay(anchor);
      const start = addDays(anchor, -date.getDay());
      const end = addDays(start, 6);
      return { start: start + 'T00:00:00', end: end + 'T23:59:59', label: dayLabel(start) + ' to ' + dayLabel(end) };
    }
    return { start: anchor + 'T00:00:00', end: anchor + 'T23:59:59', label: dayLabel(anchor) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const { start, end } = range();
      const [eventsRes, departmentsRes, tasksRes] = await Promise.all([
        fetchEvents(selectedCompanyId, { start, end, limit: '100' }),
        fetchDepartments(selectedCompanyId),
        fetchTasks(selectedCompanyId, { limit: '100' }),
      ]);
      if (eventsRes.status === 200) {
        setEvents(asEvents(eventsRes.data));
      } else {
        setError(friendlyError(eventsRes.data, 'Events could not be loaded.'));
      }
      if (departmentsRes.status === 200) setDepartments(asDepartments(departmentsRes.data));
      if (tasksRes.status === 200) setTasks(asTasks(tasksRes.data));
    } catch {
      setError('Events could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, range]);

  useEffect(() => {
    load();
  }, [load]);

  function daysInView(): string[] {
    if (view === 'day') return [anchor];
    if (view === 'week') {
      const date = parseDay(anchor);
      const start = addDays(anchor, -date.getDay());
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const date = parseDay(anchor);
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = addDays(toDay(first), -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }

  function eventsOn(day: string): CalendarEventInfo[] {
    return events.filter((e) => e.startAt.slice(0, 10) === day);
  }

  function deadlinesOn(day: string): TaskInfo[] {
    return tasks.filter((t) => t.dueAt && t.dueAt.slice(0, 10) === day);
  }

  function departmentName(departmentId: string | null): string {
    if (!departmentId) return '';
    return departments.find((d) => d.id === departmentId)?.name || '';
  }

  function shift(count: number) {
    if (view === 'month') {
      const date = parseDay(anchor);
      setAnchor(toDay(new Date(date.getFullYear(), date.getMonth() + count, 1)));
    } else if (view === 'week') {
      setAnchor(addDays(anchor, count * 7));
    } else {
      setAnchor(addDays(anchor, count));
    }
  }

  function openEdit(event: CalendarEventInfo) {
    setEditEvent(event);
    setEditTitle(event.title);
    setEditDescription(event.description);
    setEditStart(event.startAt.slice(0, 16));
    setEditEnd(event.endAt.slice(0, 16));
    setEditKind(event.kind);
    setEditVisibility(event.visibility);
    setEditDepartment(event.departmentId || '');
    setEditTask(event.taskId || '');
  }

  function linkedTaskName(taskId: string | null): string {
    if (!taskId) return '';
    return tasks.find((t) => t.id === taskId)?.title || '';
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await createEvent(selectedCompanyId, { title: newTitle.trim(), description: newDescription.trim(), startAt: newStart, endAt: newEnd, kind: newKind, visibility: newVisibility, departmentId: newVisibility === 'department' ? (newDepartment || null) : null, taskId: newTask || null });
      if (res.status === 200) {
        setMessage('Event created.');
        setNewTitle('');
        setNewDescription('');
        setNewStart('');
        setNewEnd('');
        setNewKind('event');
        setNewVisibility(callerRole === 'employee' ? 'personal' : 'company');
        setNewDepartment('');
        setNewTask('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Event could not be created.'));
      }
    } catch {
      setError('Event could not be created. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editEvent) return;
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await updateEvent(selectedCompanyId, editEvent.id, { title: editTitle.trim(), description: editDescription.trim(), startAt: editStart, endAt: editEnd, kind: editKind, visibility: editVisibility, departmentId: editVisibility === 'department' ? (editDepartment || null) : null, taskId: editTask || null });
      if (res.status === 200) {
        setMessage('Event updated.');
        setEditEvent(null);
        await load();
      } else {
        setError(friendlyError(res.data, 'Event could not be updated.'));
      }
    } catch {
      setError('Event could not be updated. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(event: CalendarEventInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await deleteEvent(selectedCompanyId, event.id);
      if (res.status === 200) {
        setMessage('Event deleted.');
        setConfirmDelete('');
        if (editEvent && editEvent.id === event.id) setEditEvent(null);
        await load();
      } else {
        setError(friendlyError(res.data, 'Event could not be deleted.'));
      }
    } catch {
      setError('Event could not be deleted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading calendar…</p>
      </div>
    );
  }

  const days = daysInView();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Calendar</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Events and task deadlines in one view. Company events are visible to all members, department events to that department plus owners and admins, personal events only to their creator.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      <form onSubmit={handleCreate} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <h2 className="font-bold">Create an event</h2>
        <label className="mt-4 block text-sm font-semibold" htmlFor="event-title">Title</label>
        <input id="event-title" type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <label className="mt-4 block text-sm font-semibold" htmlFor="event-description">Description</label>
        <textarea id="event-description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold" htmlFor="event-start">Starts</label>
            <input id="event-start" type="datetime-local" required value={newStart} onChange={(e) => setNewStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="event-end">Ends</label>
            <input id="event-end" type="datetime-local" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="event-kind">Kind</label>
            <select id="event-kind" value={newKind} onChange={(e) => setNewKind(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="event-visibility">Visibility</label>
            <select id="event-visibility" value={newVisibility} onChange={(e) => setNewVisibility(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              {visibilityOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          {newVisibility === 'department' && (
            <div>
              <label className="block text-sm font-semibold" htmlFor="event-department">Department</label>
              <select id="event-department" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                <option value="">Choose a department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold" htmlFor="event-task">Linked task (optional)</label>
            <select id="event-task" value={newTask} onChange={(e) => setNewTask(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              <option value="">No linked task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
          {busy ? 'Creating…' : 'Create event'}
        </button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Previous</button>
          <button type="button" onClick={() => setAnchor(toDay(new Date()))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Today</button>
          <button type="button" onClick={() => shift(1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Next</button>
        </div>
        <h2 className="text-xl font-bold">{range().label}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setView('month')} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (view === 'month' ? 'bg-[#000080] text-white' : 'border border-slate-300 dark:border-slate-600')}>Month</button>
          <button type="button" onClick={() => setView('week')} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (view === 'week' ? 'bg-[#000080] text-white' : 'border border-slate-300 dark:border-slate-600')}>Week</button>
          <button type="button" onClick={() => setView('day')} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (view === 'day' ? 'bg-[#000080] text-white' : 'border border-slate-300 dark:border-slate-600')}>Day</button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="mt-4 grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1 text-center text-xs font-bold text-slate-500 dark:text-slate-400">{d}</div>
          ))}
          {days.map((day) => (
            <div key={day} className="min-h-[96px] rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-[#171a2e]">
              <p className="text-xs font-bold">{parseDay(day).getDate()}</p>
              {eventsOn(day).map((event) => (
                <button key={event.id} type="button" onClick={() => openEdit(event)} className="mt-1 block w-full rounded bg-violet-100 px-1.5 py-1 text-left text-xs font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-100">
                  {timeLabel(event.startAt)} {event.title}
                </button>
              ))}
              {deadlinesOn(day).map((task) => (
                <p key={task.id} className="mt-1 rounded bg-amber-100 px-1.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">Due: {task.title}</p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {days.map((day) => (
            <div key={day} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
              <h3 className="font-bold">{dayLabel(day)}</h3>
              {eventsOn(day).length === 0 && deadlinesOn(day).length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing scheduled.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {eventsOn(day).map((event) => (
                    <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <span>{timeLabel(event.startAt)} – {timeLabel(event.endAt)} · {event.title} ({event.kind}, {event.visibility}{event.departmentId ? ', ' + departmentName(event.departmentId) : ''})</span>
                      <button type="button" onClick={() => openEdit(event)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-600">Edit</button>
                    </div>
                  ))}
                  {deadlinesOn(day).map((task) => (
                    <p key={task.id} className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">Task deadline: {task.title}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editEvent && (
        <form onSubmit={handleUpdate} className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Edit event</h2>
          <label className="mt-4 block text-sm font-semibold" htmlFor="edit-event-title">Title</label>
          <input id="edit-event-title" type="text" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="edit-event-description">Description</label>
          <textarea id="edit-event-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold" htmlFor="edit-event-start">Starts</label>
              <input id="edit-event-start" type="datetime-local" required value={editStart} onChange={(e) => setEditStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="edit-event-end">Ends</label>
              <input id="edit-event-end" type="datetime-local" required value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="edit-event-kind">Kind</label>
              <select id="edit-event-kind" value={editKind} onChange={(e) => setEditKind(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="edit-event-visibility">Visibility</label>
              <select id="edit-event-visibility" value={editVisibility} onChange={(e) => setEditVisibility(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                {visibilityOptions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            {editVisibility === 'department' && (
              <div>
                <label className="block text-sm font-semibold" htmlFor="edit-event-department">Department</label>
                <select id="edit-event-department" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                  <option value="">Choose a department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold" htmlFor="edit-event-task">Linked task (optional)</label>
              <select id="edit-event-task" value={editTask} onChange={(e) => setEditTask(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                <option value="">No linked task</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          </div>
          {editEvent.taskId && (
            <p className="mt-4 text-sm">
              Linked task: <Link to={'/tasks?task=' + encodeURIComponent(editEvent.taskId)} className="font-semibold text-violet-700 dark:text-violet-300">{linkedTaskName(editEvent.taskId) || 'View task'}</Link>
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setEditEvent(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Cancel</button>
            {confirmDelete !== editEvent.id ? (
              <button type="button" onClick={() => setConfirmDelete(editEvent.id)} className="rounded-lg border border-red-300 px-5 py-2.5 font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
            ) : (
              <span className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => handleDelete(editEvent)} className="rounded-lg bg-red-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">Confirm delete</button>
                <button type="button" onClick={() => setConfirmDelete('')} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Cancel</button>
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
