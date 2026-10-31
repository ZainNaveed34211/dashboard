import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { createAnnouncement, deleteAnnouncement, fetchAnnouncements, friendlyError, updateAnnouncement, type AnnouncementInfo, type CompanyInfo } from '../lib/api';

interface AnnouncementsPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  callerUserId: string;
}

function asAnnouncements(data: Record<string, unknown>): AnnouncementInfo[] {
  const list = data.announcements;
  if (!Array.isArray(list)) return [];
  return list.filter((a): a is AnnouncementInfo => !!a && typeof (a as AnnouncementInfo).id === 'string');
}

export default function AnnouncementsPage({ companies, selectedCompanyId, onSelectCompany, callerUserId }: AnnouncementsPageProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editId, setEditId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const canPost = callerRole === 'owner' || callerRole === 'admin' || callerRole === 'manager';

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchAnnouncements(selectedCompanyId);
      if (res.status === 200) {
        setAnnouncements(asAnnouncements(res.data));
      } else {
        setError(friendlyError(res.data, 'Announcements could not be loaded.'));
      }
    } catch {
      setError('Announcements could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  function canEdit(ann: AnnouncementInfo): boolean {
    if (callerRole === 'owner' || callerRole === 'admin') return true;
    if (callerRole === 'manager') return ann.authorUserId === callerUserId;
    return false;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await createAnnouncement(selectedCompanyId, title.trim(), body.trim());
      if (res.status === 200) {
        setMessage('Announcement posted.');
        setTitle('');
        setBody('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Announcement could not be posted.'));
      }
    } catch {
      setError('Announcement could not be posted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(ann: AnnouncementInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await updateAnnouncement(selectedCompanyId, ann.id, editTitle.trim(), editBody.trim());
      if (res.status === 200) {
        setMessage('Announcement updated.');
        setEditId('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Announcement could not be updated.'));
      }
    } catch {
      setError('Announcement could not be updated. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(ann: AnnouncementInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await deleteAnnouncement(selectedCompanyId, ann.id);
      if (res.status === 200) {
        setMessage('Announcement deleted.');
        setConfirmDelete('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Announcement could not be deleted.'));
      }
    } catch {
      setError('Announcement could not be deleted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading announcements…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Team announcements</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">News for everyone in this company, newest first.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      {canPost && (
        <form onSubmit={handleCreate} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Post an announcement</h2>
          <label className="mt-4 block text-sm font-semibold" htmlFor="ann-title">Title</label>
          <input id="ann-title" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="ann-body">Message</label>
          <textarea id="ann-body" required value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#5F3EC1] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Posting…' : 'Post announcement'}
          </button>
        </form>
      )}

      <div className="mt-8 space-y-4">
        {announcements.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No announcements yet.</p>
        ) : (
          announcements.map((ann) => (
            <div key={ann.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
              {editId === ann.id ? (
                <div>
                  <label className="block text-sm font-semibold" htmlFor={'edit-title-' + ann.id}>Title</label>
                  <input id={'edit-title-' + ann.id} type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
                  <label className="mt-3 block text-sm font-semibold" htmlFor={'edit-body-' + ann.id}>Message</label>
                  <textarea id={'edit-body-' + ann.id} value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => handleUpdate(ann)} className="rounded-lg bg-[#000080] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditId('')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-bold">{ann.title}</h2>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{ann.body}</p>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{new Date(ann.createdAt).toLocaleString()}</p>
                  {canEdit(ann) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditId(ann.id); setEditTitle(ann.title); setEditBody(ann.body); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Edit</button>
                      {confirmDelete !== ann.id ? (
                        <button type="button" onClick={() => setConfirmDelete(ann.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
                      ) : (
                        <span className="flex gap-2">
                          <button type="button" disabled={busy} onClick={() => handleDelete(ann)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm delete</button>
                          <button type="button" onClick={() => setConfirmDelete('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
