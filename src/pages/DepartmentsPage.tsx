import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { createDepartment, deleteDepartment, fetchDepartments, fetchMembers, friendlyError, updateDepartment, type CompanyInfo, type DepartmentInfo, type MemberInfo } from '../lib/api';

interface DepartmentsPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
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

export default function DepartmentsPage({ companies, selectedCompanyId, onSelectCompany }: DepartmentsPageProps) {
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newManager, setNewManager] = useState('');
  const [editDeptId, setEditDeptId] = useState('');
  const [editName, setEditName] = useState('');
  const [editManager, setEditManager] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const canManage = callerRole === 'owner' || callerRole === 'admin';

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const [departmentsRes, membersRes] = await Promise.all([
        fetchDepartments(selectedCompanyId),
        fetchMembers(selectedCompanyId),
      ]);
      if (departmentsRes.status === 200) {
        setDepartments(asDepartments(departmentsRes.data));
      } else {
        setError(friendlyError(departmentsRes.data, 'Departments could not be loaded.'));
      }
      if (membersRes.status === 200) {
        setMembers(asMembers(membersRes.data));
      }
    } catch {
      setError('Departments could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  function managerLabel(managerUserId: string | null): string {
    if (!managerUserId) return 'No manager';
    const member = members.find((m) => m.userId === managerUserId);
    return member ? (member.email || member.userId) : managerUserId;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await createDepartment(selectedCompanyId, newName.trim(), newManager || null);
      if (res.status === 200) {
        setMessage('Department created.');
        setNewName('');
        setNewManager('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Department could not be created.'));
      }
    } catch {
      setError('Department could not be created. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(dept: DepartmentInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await updateDepartment(selectedCompanyId, dept.id, editName.trim(), editManager || null);
      if (res.status === 200) {
        setMessage('Department updated.');
        setEditDeptId('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Department could not be updated.'));
      }
    } catch {
      setError('Department could not be updated. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(dept: DepartmentInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await deleteDepartment(selectedCompanyId, dept.id);
      if (res.status === 200) {
        setMessage('Department deleted.');
        setConfirmDelete('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Department could not be deleted.'));
      }
    } catch {
      setError('Department could not be deleted. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading departments…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Departments</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Departments group members and projects. A department in use cannot be deleted until its members and projects move elsewhere.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      {canManage && (
        <form onSubmit={handleCreate} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Create a department</h2>
          <label className="mt-4 block text-sm font-semibold" htmlFor="dept-name">Name</label>
          <input id="dept-name" type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="dept-manager">Manager</label>
          <select id="dept-manager" value={newManager} onChange={(e) => setNewManager(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
            <option value="">No manager</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>{member.email || member.userId} ({member.role})</option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create department'}
          </button>
        </form>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-bold">Department list</h2>
        {departments.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No departments yet. Create the first department with the form above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">{dept.name}</td>
                    <td className="px-4 py-3">{managerLabel(dept.managerUserId)}</td>
                    <td className="px-4 py-3">
                      {canManage && editDeptId !== dept.id && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => { setEditDeptId(dept.id); setEditName(dept.name); setEditManager(dept.managerUserId || ''); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Rename</button>
                          {confirmDelete !== dept.id ? (
                            <button type="button" onClick={() => setConfirmDelete(dept.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Delete</button>
                          ) : (
                            <span className="flex gap-2">
                              <button type="button" disabled={busy} onClick={() => handleDelete(dept)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm delete</button>
                              <button type="button" onClick={() => setConfirmDelete('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                            </span>
                          )}
                        </div>
                      )}
                      {canManage && editDeptId === dept.id && (
                        <div className="flex flex-wrap items-end gap-2">
                          <input aria-label="Department name" type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]" />
                          <select aria-label="Department manager" value={editManager} onChange={(e) => setEditManager(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
                            <option value="">No manager</option>
                            {members.map((member) => (
                              <option key={member.userId} value={member.userId}>{member.email || member.userId} ({member.role})</option>
                            ))}
                          </select>
                          <button type="button" disabled={busy} onClick={() => handleRename(dept)} className="rounded-lg bg-[#000080] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Save</button>
                          <button type="button" onClick={() => setEditDeptId('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                        </div>
                      )}
                      {!canManage && <span className="text-slate-500 dark:text-slate-400">No changes available</span>}
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
