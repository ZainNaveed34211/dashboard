import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { deleteDocument, downloadDocument, fetchDocuments, fetchProjects, fetchTasks, friendlyError, uploadDocument, type CompanyInfo, type DocumentInfo, type ProjectInfo, type TaskInfo } from '../lib/api';

interface DocumentsPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'txt', 'csv'];
const MAX_SIZE = 1024 * 1024;

function asDocuments(data: Record<string, unknown>): DocumentInfo[] {
  const list = data.documents;
  if (!Array.isArray(list)) return [];
  return list.filter((d): d is DocumentInfo => !!d && typeof (d as DocumentInfo).id === 'string');
}

function formatSize(size: number): string {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function DocumentsPage({ companies, selectedCompanyId, onSelectCompany }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [usage, setUsage] = useState({ totalSize: 0, count: 0 });
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchDocuments(selectedCompanyId);
      if (res.status === 200) {
        setDocuments(asDocuments(res.data));
        const usageData = res.data.usage as { totalSize?: number; count?: number } | undefined;
        setUsage({ totalSize: typeof usageData?.totalSize === 'number' ? usageData.totalSize : 0, count: typeof usageData?.count === 'number' ? usageData.count : 0 });
      } else {
        setError(friendlyError(res.data, 'Documents could not be loaded.'));
      }
      const projectsRes = await fetchProjects(selectedCompanyId);
      if (projectsRes.status === 200 && Array.isArray(projectsRes.data.projects)) setProjects(projectsRes.data.projects as ProjectInfo[]);
      const tasksRes = await fetchTasks(selectedCompanyId);
      if (tasksRes.status === 200 && Array.isArray(tasksRes.data.tasks)) setTasks(tasksRes.data.tasks as TaskInfo[]);
    } catch {
      setError('Documents could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!file && !linkUrl.trim()) {
      setError('Choose a file to upload, or paste an external link for a larger file.');
      return;
    }
    if (file) {
      if (file.size > MAX_SIZE) {
        setError('Files larger than 1 MB cannot be stored here. Host the file elsewhere and paste its link below instead.');
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setError('This file type is not allowed. Allowed types: pdf, docx, xlsx, png, jpg, txt, csv.');
        return;
      }
      if (file.name.includes('/') || file.name.includes('\\') || file.name.includes('..')) {
        setError('This file name is not allowed.');
        return;
      }
    }
    if (linkUrl.trim()) {
      try {
        const parsed = new URL(linkUrl.trim());
        if (parsed.protocol !== 'https:') {
          setError('External links must start with https://.');
          return;
        }
      } catch {
        setError('This external link is not valid.');
        return;
      }
      if (linkUrl.trim().length > 2000) {
        setError('This external link is too long.');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await uploadDocument(selectedCompanyId, file, { filename: linkName.trim() || undefined, projectId: projectId || null, taskId: taskId || null, externalLink: linkUrl.trim() || null });
      if (res.status === 200) {
        setMessage('Document saved.');
        setFile(null);
        setLinkName('');
        setLinkUrl('');
        setProjectId('');
        setTaskId('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Document could not be saved.'));
      }
    } catch {
      setError('Document could not be saved. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(doc: DocumentInfo) {
    setError('');
    try {
      const res = await downloadDocument(selectedCompanyId, doc.id, doc.filename);
      if (res.status !== 200) setError(friendlyError(res.data, 'Document could not be downloaded.'));
    } catch {
      setError('Document could not be downloaded. Check your connection, then try again.');
    }
  }

  async function handleDelete(doc: DocumentInfo) {
    setError('');
    setBusy(true);
    try {
      const res = await deleteDocument(selectedCompanyId, doc.id);
      if (res.status === 200) {
        setMessage('Document deleted.');
        setConfirmDelete('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Document could not be deleted.'));
      }
    } catch {
      setError('Document could not be deleted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading documents…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Documents and files</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Company files, stored privately. Only members of this company can open them.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-[#171a2e]">
        Storage used: {formatSize(usage.totalSize)} across {usage.count} {usage.count === 1 ? 'file' : 'files'}.
      </p>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      <form onSubmit={handleUpload} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <h2 className="font-bold">Add a document</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Files up to 1 MB are stored here. For larger files, host the file elsewhere and paste its link instead. Allowed types: pdf, docx, xlsx, png, jpg, txt, csv.</p>
        {callerRole === 'employee' && <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">As an employee, attach files only to your own tasks.</p>}
        <label className="mt-4 block text-sm font-semibold" htmlFor="doc-file">File (up to 1 MB)</label>
        <input id="doc-file" type="file" onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold" htmlFor="doc-project">Project (optional)</label>
            <select id="doc-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="doc-task">Task (optional)</label>
            <select id="doc-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
              <option value="">No task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold">Or link an externally hosted file</p>
        <label className="mt-2 block text-sm font-semibold" htmlFor="doc-link-name">File name for the link</label>
        <input id="doc-link-name" type="text" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="e.g. brand-guidelines.pdf" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <label className="mt-3 block text-sm font-semibold" htmlFor="doc-link-url">External link (https only)</label>
        <input id="doc-link-url" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save document'}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-xl font-bold">Files</h2>
        {documents.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No documents yet. Upload your first file with the form above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded by</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      {doc.externalLink && !doc.size ? (
                        <a href={doc.externalLink} target="_blank" rel="noreferrer" className="font-semibold text-[#000080] underline dark:text-violet-300">{doc.filename}</a>
                      ) : (
                        <span className="font-semibold">{doc.filename}</span>
                      )}
                      {doc.externalLink && doc.size > 0 && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          Also linked: <a href={doc.externalLink} target="_blank" rel="noreferrer" className="underline">Open external copy</a>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{doc.size > 0 ? formatSize(doc.size) : 'Linked only'}</td>
                    <td className="px-4 py-3">{doc.uploadedBy}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {doc.size > 0 && (
                          <button type="button" onClick={() => handleDownload(doc)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Download</button>
                        )}
                        {confirmDelete !== doc.id ? (
                          <button type="button" onClick={() => setConfirmDelete(doc.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
                        ) : (
                          <span className="flex gap-2">
                            <button type="button" disabled={busy} onClick={() => handleDelete(doc)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm delete</button>
                            <button type="button" onClick={() => setConfirmDelete('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                          </span>
                        )}
                      </div>
                    </td>
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
