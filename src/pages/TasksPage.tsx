import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { createComment, createTask, deleteComment, deleteTask, fetchComments, fetchDepartments, fetchMembers, fetchProjects, fetchTasks, friendlyError, updateComment, updateTask, type CompanyInfo, type DepartmentInfo, type MemberInfo, type ProjectInfo, type TaskCommentInfo, type TaskInfo } from '../lib/api';

interface TasksPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  callerUserId: string;
}

function asTasks(data: Record<string, unknown>): TaskInfo[] {
  const list = data.tasks;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is TaskInfo => !!m && typeof (m as TaskInfo).id === 'string');
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

function asMembers(data: Record<string, unknown>): MemberInfo[] {
  const list = data.members;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is MemberInfo => !!m && typeof (m as MemberInfo).userId === 'string');
}

function asComments(data: Record<string, unknown>): TaskCommentInfo[] {
  const list = data.comments;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is TaskCommentInfo => !!m && typeof (m as TaskCommentInfo).id === 'string');
}

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function TasksPage({ companies, selectedCompanyId, onSelectCompany, callerUserId }: TasksPageProps) {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState('list');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [comments, setComments] = useState<TaskCommentInfo[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editCommentId, setEditCommentId] = useState('');
  const [editCommentBody, setEditCommentBody] = useState('');
  const [confirmDeleteComment, setConfirmDeleteComment] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newStatus, setNewStatus] = useState('todo');
  const [newPriority, setNewPriority] = useState('medium');
  const [newCategory, setNewCategory] = useState('');
  const [newDue, setNewDue] = useState('');
  const [editTask, setEditTask] = useState<TaskInfo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editStatus, setEditStatus] = useState('todo');
  const [editPriority, setEditPriority] = useState('medium');
  const [editCategory, setEditCategory] = useState('');
  const [editDue, setEditDue] = useState('');
  const [confirmDeleteTask, setConfirmDeleteTask] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const canCreate = callerRole === 'owner' || callerRole === 'admin' || callerRole === 'manager';
  const canDelete = callerRole === 'owner' || callerRole === 'admin';
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const filters: Record<string, string> = {};
      if (statusFilter) filters.status = statusFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (assigneeFilter) filters.assignee = assigneeFilter;
      if (projectFilter) filters.project = projectFilter;
      if (departmentFilter) filters.department = departmentFilter;
      const [tasksRes, projectsRes, departmentsRes, membersRes] = await Promise.all([
        fetchTasks(selectedCompanyId, filters),
        fetchProjects(selectedCompanyId),
        fetchDepartments(selectedCompanyId),
        fetchMembers(selectedCompanyId),
      ]);
      if (tasksRes.status === 200) {
        setTasks(asTasks(tasksRes.data));
      } else {
        setError(friendlyError(tasksRes.data, 'Tasks could not be loaded.'));
      }
      if (projectsRes.status === 200) setProjects(asProjects(projectsRes.data));
      if (departmentsRes.status === 200) setDepartments(asDepartments(departmentsRes.data));
      if (membersRes.status === 200) setMembers(asMembers(membersRes.data));
    } catch {
      setError('Tasks could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, statusFilter, priorityFilter, assigneeFilter, projectFilter, departmentFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedTaskId) {
      setComments([]);
      return;
    }
    fetchComments(selectedCompanyId, selectedTaskId).then((res) => {
      if (res.status === 200) setComments(asComments(res.data));
      else setComments([]);
    }).catch(() => setComments([]));
  }, [selectedTaskId, selectedCompanyId]);

  function memberLabel(userId: string | null): string {
    if (!userId) return 'Unassigned';
    const member = members.find((m) => m.userId === userId);
    return member ? (member.email || member.userId) : userId;
  }

  function projectName(projectId: string | null): string {
    if (!projectId) return 'No project';
    return projects.find((p) => p.id === projectId)?.name || projectId;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await createTask(selectedCompanyId, { title: newTitle.trim(), description: newDescription.trim(), projectId: newProject || null, assigneeUserId: newAssignee || null, status: newStatus, priority: newPriority, category: newCategory.trim(), dueAt: newDue || null });
      if (res.status === 200) {
        setMessage('Task created.');
        setNewTitle('');
        setNewDescription('');
        setNewProject('');
        setNewAssignee('');
        setNewStatus('todo');
        setNewPriority('medium');
        setNewCategory('');
        setNewDue('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Task could not be created.'));
      }
    } catch {
      setError('Task could not be created. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(task: TaskInfo) {
    setEditTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditProject(task.projectId || '');
    setEditAssignee(task.assigneeUserId || '');
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditCategory(task.category);
    setEditDue(task.dueAt ? task.dueAt.slice(0, 10) : '');
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editTask) return;
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const input: Record<string, unknown> = {};
      if (callerRole !== 'employee') {
        input.title = editTitle.trim();
        input.description = editDescription.trim();
        input.projectId = editProject || null;
        input.assigneeUserId = editAssignee || null;
        input.priority = editPriority;
        input.category = editCategory.trim();
        input.dueAt = editDue || null;
      }
      input.status = editStatus;
      const res = await updateTask(selectedCompanyId, editTask.id, input);
      if (res.status === 200) {
        setMessage('Task updated.');
        setEditTask(null);
        await load();
      } else {
        setError(friendlyError(res.data, 'Task could not be updated.'));
      }
    } catch {
      setError('Task could not be updated. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(task: TaskInfo, status: string) {
    setMessage('');
    setError('');
    try {
      const res = await updateTask(selectedCompanyId, task.id, { status });
      if (res.status === 200) {
        setMessage('Task status updated.');
        await load();
      } else {
        setError(friendlyError(res.data, 'Task status could not be updated.'));
      }
    } catch {
      setError('Task status could not be updated. Check your connection, then try again.');
    }
  }

  async function handleDeleteTask(task: TaskInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await deleteTask(selectedCompanyId, task.id);
      if (res.status === 200) {
        setMessage('Task deleted.');
        setConfirmDeleteTask('');
        if (selectedTaskId === task.id) setSelectedTaskId('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Task could not be deleted.'));
      }
    } catch {
      setError('Task could not be deleted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTask) return;
    setMessage('');
    setError('');
    try {
      const res = await createComment(selectedCompanyId, selectedTask.id, newComment.trim());
      if (res.status === 200) {
        setNewComment('');
        const refreshed = await fetchComments(selectedCompanyId, selectedTask.id);
        if (refreshed.status === 200) setComments(asComments(refreshed.data));
      } else {
        setError(friendlyError(res.data, 'Comment could not be added.'));
      }
    } catch {
      setError('Comment could not be added. Check your connection, then try again.');
    }
  }

  async function handleUpdateComment(comment: TaskCommentInfo) {
    if (!selectedTask) return;
    setMessage('');
    setError('');
    try {
      const res = await updateComment(selectedCompanyId, selectedTask.id, comment.id, editCommentBody.trim());
      if (res.status === 200) {
        setEditCommentId('');
        const refreshed = await fetchComments(selectedCompanyId, selectedTask.id);
        if (refreshed.status === 200) setComments(asComments(refreshed.data));
      } else {
        setError(friendlyError(res.data, 'Comment could not be updated.'));
      }
    } catch {
      setError('Comment could not be updated. Check your connection, then try again.');
    }
  }

  async function handleDeleteComment(comment: TaskCommentInfo) {
    if (!selectedTask) return;
    setMessage('');
    setError('');
    try {
      const res = await deleteComment(selectedCompanyId, selectedTask.id, comment.id);
      if (res.status === 200) {
        setConfirmDeleteComment('');
        const refreshed = await fetchComments(selectedCompanyId, selectedTask.id);
        if (refreshed.status === 200) setComments(asComments(refreshed.data));
      } else {
        setError(friendlyError(res.data, 'Comment could not be deleted.'));
      }
    } catch {
      setError('Comment could not be deleted. Check your connection, then try again.');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading tasks…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Tasks</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Tasks carry status, priority, category, deadline and assignee. Comments and history live on each task.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      {canCreate && (
        <form onSubmit={handleCreate} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Create a task</h2>
          <label className="mt-4 block text-sm font-semibold" htmlFor="task-title">Title</label>
          <input id="task-title" type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="task-description">Description</label>
          <textarea id="task-description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold" htmlFor="task-project">Project</label>
              <select id="task-project" value={newProject} onChange={(e) => setNewProject(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="task-assignee">Assignee</label>
              <select id="task-assignee" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.email || m.userId} ({m.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="task-status">Status</label>
              <select id="task-status" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="task-priority">Priority</label>
              <select id="task-priority" value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                {TASK_PRIORITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="task-category">Category</label>
              <input id="task-category" type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="task-due">Deadline</label>
              <input id="task-due" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            </div>
          </div>
          <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setView('list')} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (view === 'list' ? 'bg-[#000080] text-white' : 'border border-slate-300 dark:border-slate-600')}>List</button>
          <button type="button" onClick={() => setView('board')} className={'rounded-lg px-4 py-2 text-sm font-semibold ' + (view === 'board' ? 'bg-[#000080] text-white' : 'border border-slate-300 dark:border-slate-600')}>Board</button>
        </div>
        <label className="text-sm font-semibold" htmlFor="task-status-filter">Status
          <select id="task-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor="task-priority-filter">Priority
          <select id="task-priority-filter" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {TASK_PRIORITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor="task-assignee-filter">Assignee
          <select id="task-assignee-filter" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.email || m.userId}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor="task-project-filter">Project
          <select id="task-project-filter" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor="task-department-filter">Department
          <select id="task-department-filter" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No tasks match these filters. Create the first task with the form above.</p>
      ) : view === 'board' ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((status) => (
            <div key={status} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
              <h3 className="font-bold">{status}</h3>
              <div className="mt-3 space-y-3">
                {tasks.filter((t) => t.status === status).map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <button type="button" onClick={() => setSelectedTaskId(task.id)} className="text-left font-semibold hover:underline">{task.title}</button>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{projectName(task.projectId)} · {memberLabel(task.assigneeUserId)} · {task.priority}{task.dueAt ? ' · Due ' + task.dueAt.slice(0, 10) : ''}</p>
                    <label className="mt-2 block text-xs font-semibold" htmlFor={'board-status-' + task.id}>Move to
                      <select id={'board-status-' + task.id} value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)} className="ml-2 rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-[#0f1220]">
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
                {tasks.filter((t) => t.status === status).length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No tasks here.</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{task.title}</h3>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-900 dark:bg-violet-950 dark:text-violet-100">{task.status} · {task.priority}</span>
              </div>
              {task.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{task.description}</p>}
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{projectName(task.projectId)} · {memberLabel(task.assigneeUserId)}{task.category ? ' · ' + task.category : ''}{task.dueAt ? ' · Due ' + task.dueAt.slice(0, 10) : ''}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedTaskId(task.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Comments</button>
                <button type="button" onClick={() => openEdit(task)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Edit</button>
                {canDelete && (confirmDeleteTask !== task.id ? (
                  <button type="button" onClick={() => setConfirmDeleteTask(task.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
                ) : (
                  <span className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => handleDeleteTask(task)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm delete</button>
                    <button type="button" onClick={() => setConfirmDeleteTask('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editTask && (
        <form onSubmit={handleUpdate} className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Edit task</h2>
          {callerRole !== 'employee' && (
            <>
              <label className="mt-4 block text-sm font-semibold" htmlFor="edit-task-title">Title</label>
              <input id="edit-task-title" type="text" required value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
              <label className="mt-4 block text-sm font-semibold" htmlFor="edit-task-description">Description</label>
              <textarea id="edit-task-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-task-project">Project</label>
                  <select id="edit-task-project" value={editProject} onChange={(e) => setEditProject(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-task-assignee">Assignee</label>
                  <select id="edit-task-assignee" value={editAssignee} onChange={(e) => setEditAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.email || m.userId} ({m.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-task-priority">Priority</label>
                  <select id="edit-task-priority" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                    {TASK_PRIORITIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-task-category">Category</label>
                  <input id="edit-task-category" type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
                </div>
                <div>
                  <label className="block text-sm font-semibold" htmlFor="edit-task-due">Deadline</label>
                  <input id="edit-task-due" type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
                </div>
              </div>
            </>
          )}
          <label className="mt-4 block text-sm font-semibold" htmlFor="edit-task-status">Status</label>
          <select id="edit-task-status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="mt-5 flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setEditTask(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Cancel</button>
          </div>
        </form>
      )}

      {selectedTask && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Comments on {selectedTask.title}</h2>
            <button type="button" onClick={() => setSelectedTaskId('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Close</button>
          </div>
          <div className="mt-4 space-y-3">
            {comments.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No comments yet. Add the first one below.</p>
            ) : comments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                {editCommentId === comment.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input aria-label="Comment text" type="text" required value={editCommentBody} onChange={(e) => setEditCommentBody(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]" />
                    <button type="button" onClick={() => handleUpdateComment(comment)} className="rounded-lg bg-[#000080] px-3 py-1.5 text-sm font-semibold text-white">Save</button>
                    <button type="button" onClick={() => setEditCommentId('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm">{comment.body}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{memberLabel(comment.authorUserId)} · {comment.createdAt.slice(0, 10)}</p>
                    {(comment.authorUserId === callerUserId || callerRole === 'owner' || callerRole === 'admin') && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => { setEditCommentId(comment.id); setEditCommentBody(comment.body); }} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-600">Edit</button>
                        {confirmDeleteComment !== comment.id ? (
                          <button type="button" onClick={() => setConfirmDeleteComment(comment.id)} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
                        ) : (
                          <span className="flex gap-2">
                            <button type="button" onClick={() => handleDeleteComment(comment)} className="rounded-lg bg-red-700 px-3 py-1 text-xs font-semibold text-white">Confirm delete</button>
                            <button type="button" onClick={() => setConfirmDeleteComment('')} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-600">Cancel</button>
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleCreateComment} className="mt-4 flex flex-wrap gap-2">
            <input aria-label="New comment" type="text" required value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
            <button type="submit" className="rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2 font-semibold text-white shadow hover:opacity-90">Add comment</button>
          </form>
        </div>
      )}
    </div>
  );
}
