import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { createProject, deleteProject, fetchDepartments, fetchProjects, fetchTasks, friendlyError, updateProject, type CompanyInfo, type DepartmentInfo, type ProjectInfo, type TaskInfo } from '../lib/api';

interface ProjectsPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
}

function asProjects(data: Record<string, unknown>): ProjectInfo[] {
  const list = data.projects;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is ProjectInfo => !!m && typeof (m as ProjectInfo).id === 'string');
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

const PROJECT_STATUSES = ['planned', 'active', 'completed', 'archived'];

export default function ProjectsPage({ companies, selectedCompanyId, onSelectCompany }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [projectTasks, setProjectTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newStatus, setNewStatus] = useState('planned');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editStatus, setEditStatus] = useState('planned');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const canCreate = callerRole === 'owner' || callerRole === 'admin' || callerRole === 'manager';
  const canDelete = callerRole === 'owner' || callerRole === 'admin';
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const filters: Record<string, string> = {};
      if (statusFilter) filters.status = statusFilter;
      if (departmentFilter) filters.department_id = departmentFilter;
      const [projectsRes, departmentsRes] = await Promise.all([
        fetchProjects(selectedCompanyId, filters),
        fetchDepartments(selectedCompanyId),
      ]);
      if (projectsRes.status === 200) {
        setProjects(asProjects(projectsRes.data));
      } else {
        setError(friendlyError(projectsRes.data, 'Projects could not be loaded.'));
      }
      if (departmentsRes.status === 200) setDepartments(asDepartments(departmentsRes.data));
    } catch {
      setError('Projects could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, statusFilter, departmentFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectTasks([]);
      return;
    }
    fetchTasks(selectedCompanyId, { project: selectedProjectId }).then((res) => {
      if (res.status === 200) setProjectTasks(asTasks(res.data));
      else setProjectTasks([]);
    }).catch(() => setProjectTasks([]));
  }, [selectedProjectId, selectedCompanyId]);

  function departmentName(departmentId: string | null): string {
    if (!departmentId) return 'No department';
    return departments.find((d) => d.id === departmentId)?.name || departmentId;
  }

  function openEdit(project: ProjectInfo) {
    setSelectedProjectId(project.id);
    setEditName(project.name);
    setEditDescription(project.description);
    setEditDepartment(project.departmentId || '');
    setEditStatus(project.status);
    setEditStart(project.startDate || '');
    setEditEnd(project.endDate || '');
    setEditing(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await createProject(selectedCompanyId, { name: newName.trim(), description: newDescription.trim(), departmentId: newDepartment || null, status: newStatus, startDate: newStart || null, endDate: newEnd || null });
      if (res.status === 200) {
        setMessage('Project created.');
        setNewName('');
        setNewDescription('');
        setNewDepartment('');
        setNewStatus('planned');
        setNewStart('');
        setNewEnd('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Project could not be created.'));
      }
    } catch {
      setError('Project could not be created. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProject) return;
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await updateProject(selectedCompanyId, selectedProject.id, { name: editName.trim(), description: editDescription.trim(), departmentId: editDepartment || null, status: editStatus, startDate: editStart || null, endDate: editEnd || null });
      if (res.status === 200) {
        setMessage('Project updated.');
        setEditing(false);
        await load();
      } else {
        setError(friendlyError(res.data, 'Project could not be updated.'));
      }
    } catch {
      setError('Project could not be updated. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(project: ProjectInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await deleteProject(selectedCompanyId, project.id);
      if (res.status === 200) {
        setMessage('Project deleted.');
        setConfirmDelete('');
        if (selectedProjectId === project.id) setSelectedProjectId('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Project could not be deleted.'));
      }
    } catch {
      setError('Project could not be deleted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading projects…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Projects</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Projects group tasks by department. Progress is computed from task statuses, never typed in by hand.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      {canCreate && (
        <form onSubmit={handleCreate} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Create a project</h2>
          <label className="mt-4 block text-sm font-semibold" htmlFor="project-name">Name</label>
          <input id="project-name" type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="project-description">Description</label>
          <textarea id="project-description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold" htmlFor="project-department">Department</label>
              <select id="project-department" value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="project-status">Status</label>
              <select id="project-status" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="project-start">Start date</label>
              <input id="project-start" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="project-end">End date</label>
              <input id="project-end" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            </div>
          </div>
          <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <label className="text-sm font-semibold" htmlFor="project-status-filter">Status
          <select id="project-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor="project-department-filter">Department
          <select id="project-department-filter" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-bold">Project list</h2>
        {projects.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No projects yet. Create the first project with the form above.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">{project.name}</h3>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-900 dark:bg-violet-950 dark:text-violet-100">{project.status}</span>
                </div>
                {project.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{project.description}</p>}
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{departmentName(project.departmentId)}{project.startDate ? ' · From ' + project.startDate : ''}{project.endDate ? ' · Until ' + project.endDate : ''}</p>
                <div className="mt-3">
                  <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>Progress</span>
                    <span>{project.progress.done} of {project.progress.total} tasks done · {project.progress.percent}%</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-gradient-to-r from-[#000080] to-[#7c5cff]" style={{ width: project.progress.percent + '%' }} />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setSelectedProjectId(project.id); setEditing(false); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">View tasks</button>
                  {canCreate && <button type="button" onClick={() => openEdit(project)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Edit</button>}
                  {canDelete && (confirmDelete !== project.id ? (
                    <button type="button" onClick={() => setConfirmDelete(project.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
                  ) : (
                    <span className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => handleDelete(project)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm delete</button>
                      <button type="button" onClick={() => setConfirmDelete('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedProject && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{selectedProject.name}</h2>
            <button type="button" onClick={() => { setSelectedProjectId(''); setEditing(false); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Close</button>
          </div>
          {editing ? (
            <form onSubmit={handleUpdate} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold" htmlFor="edit-project-name">Name</label>
                <input id="edit-project-name" type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="edit-project-description">Description</label>
                <textarea id="edit-project-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-project-department">Department</label>
                  <select id="edit-project-department" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-project-status">Status</label>
                  <select id="edit-project-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-project-start">Start date</label>
                  <input id="edit-project-start" type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-project-end">End date</label>
                  <input id="edit-project-end" type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white disabled:opacity-50">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Cancel</button>
              </div>
            </form>
          ) : (
            <div className="mt-4">
              <h3 className="font-bold">Tasks in this project</h3>
              {projectTasks.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No tasks in this project yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {projectTasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <span>{task.title}</span>
                      <span className="font-semibold">{task.status} · {task.priority}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
