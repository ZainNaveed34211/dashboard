import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CompanyPicker from '../components/CompanyPicker';
import { fetchNotifications, friendlyError, markAllNotificationsRead, markNotificationRead, type CompanyInfo, type NotificationInfo } from '../lib/api';

interface NotificationsPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

function asNotifications(data: Record<string, unknown>): NotificationInfo[] {
  const list = data.notifications;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is NotificationInfo => !!m && typeof (m as NotificationInfo).id === 'string');
}

export default function NotificationsPage({ companies, selectedCompanyId, onSelectCompany }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchNotifications(selectedCompanyId);
      if (res.status === 200) {
        setNotifications(asNotifications(res.data));
        setUnreadCount(typeof res.data.unreadCount === 'number' ? res.data.unreadCount : 0);
      } else {
        setError(friendlyError(res.data, 'Notifications could not be loaded.'));
      }
    } catch {
      setError('Notifications could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkRead(notification: NotificationInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await markNotificationRead(selectedCompanyId, notification.id);
      if (res.status === 200) {
        setMessage('Notification marked as read.');
        await load();
      } else {
        setError(friendlyError(res.data, 'Notification could not be marked as read.'));
      }
    } catch {
      setError('Notification could not be marked as read. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkAllRead() {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await markAllNotificationsRead(selectedCompanyId);
      if (res.status === 200) {
        setMessage('All notifications marked as read.');
        await load();
      } else {
        setError(friendlyError(res.data, 'Notifications could not be marked as read.'));
      }
    } catch {
      setError('Notifications could not be marked as read. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading notifications…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Notifications</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Task assignments, announcements and deadline reminders for you, newest unread first.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">{unreadCount === 0 ? 'No unread notifications.' : unreadCount + ' unread notification' + (unreadCount === 1 ? '' : 's') + '.'}</p>
        {unreadCount > 0 && (
          <button type="button" disabled={busy} onClick={handleMarkAllRead} className="rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white disabled:opacity-50">Mark all as read</button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-slate-500 shadow-sm dark:border-slate-700 dark:bg-[#171a2e] dark:text-slate-400">No notifications yet. You will see one here when a task is assigned to you, an announcement is posted, or a task deadline approaches.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {notifications.map((n) => (
            <li key={n.id} className={'rounded-xl border p-5 shadow-sm ' + (n.readAt ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-[#171a2e]' : 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className={'font-bold ' + (n.readAt ? '' : 'text-violet-900 dark:text-violet-100')}>{n.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{n.kind} · {n.createdAt.slice(0, 10)}{n.readAt ? ' · Read' : ' · Unread'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(n.kind === 'task_assigned' || n.kind === 'deadline') && n.targetId && (
                    <Link to={'/tasks?task=' + encodeURIComponent(n.targetId)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600">View task</Link>
                  )}
                  {n.kind === 'announcement' && (
                    <Link to="/announcements" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600">View announcements</Link>
                  )}
                  {!n.readAt && (
                    <button type="button" disabled={busy} onClick={() => handleMarkRead(n)} className="rounded-lg bg-[#000080] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Mark as read</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
