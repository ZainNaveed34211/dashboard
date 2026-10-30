import { useCallback, useEffect, useState } from 'react';
import CompanyPicker from '../components/CompanyPicker';
import { createInvite, fetchDepartments, fetchInvitations, fetchMembers, friendlyError, removeMember, revokeInvite, updateMemberRole, type CompanyInfo, type DepartmentInfo, type InvitationInfo, type MemberInfo } from '../lib/api';

interface EmployeesPageProps {
  companies: CompanyInfo[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  callerUserId: string;
}

function asMembers(data: Record<string, unknown>): MemberInfo[] {
  const list = data.members;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is MemberInfo => !!m && typeof (m as MemberInfo).userId === 'string');
}

function asInvitations(data: Record<string, unknown>): InvitationInfo[] {
  const list = data.invitations;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is InvitationInfo => !!m && typeof (m as InvitationInfo).id === 'string');
}

function asDepartments(data: Record<string, unknown>): DepartmentInfo[] {
  const list = data.departments;
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is DepartmentInfo => !!m && typeof (m as DepartmentInfo).id === 'string');
}

export default function EmployeesPage({ companies, selectedCompanyId, onSelectCompany, callerUserId }: EmployeesPageProps) {
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [invitations, setInvitations] = useState<InvitationInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [inviteDept, setInviteDept] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteCopied, setInviteCopied] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDept, setEditDept] = useState('');
  const [confirmRemove, setConfirmRemove] = useState('');
  const [busy, setBusy] = useState(false);

  const callerRole = companies.find((c) => c.id === selectedCompanyId)?.role || '';
  const canInvite = callerRole === 'owner' || callerRole === 'admin';
  const inviteRoles = callerRole === 'owner' ? ['owner', 'admin', 'manager', 'employee'] : ['manager', 'employee'];

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const [membersRes, invitationsRes, departmentsRes] = await Promise.all([
        fetchMembers(selectedCompanyId),
        fetchInvitations(selectedCompanyId),
        fetchDepartments(selectedCompanyId),
      ]);
      if (membersRes.status === 200) {
        setMembers(asMembers(membersRes.data));
      } else {
        setError(friendlyError(membersRes.data, 'Team members could not be loaded.'));
      }
      if (invitationsRes.status === 200) {
        setInvitations(asInvitations(invitationsRes.data));
      } else if (callerRole === 'owner' || callerRole === 'admin') {
        setError(friendlyError(invitationsRes.data, 'Invitations could not be loaded.'));
      }
      if (departmentsRes.status === 200) {
        setDepartments(asDepartments(departmentsRes.data));
      }
    } catch {
      setError('Team data could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, callerRole]);

  useEffect(() => {
    load();
  }, [load]);

  function canManageRow(member: MemberInfo): boolean {
    if (member.userId === callerUserId) return false;
    if (callerRole === 'owner') return true;
    if (callerRole === 'admin') return member.role === 'manager' || member.role === 'employee';
    return false;
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setInviteLink('');
    setBusy(true);
    try {
      const res = await createInvite(selectedCompanyId, inviteEmail.trim(), inviteRole, inviteDept || null);
      if (res.status === 200 && typeof res.data.inviteLink === 'string') {
        setInviteLink(res.data.inviteLink);
        setInviteEmail('');
        setMessage('Invitation created. Share the link below with the new member.');
        const invitationsRes = await fetchInvitations(selectedCompanyId);
        if (invitationsRes.status === 200) setInvitations(asInvitations(invitationsRes.data));
      } else {
        setError(friendlyError(res.data, 'Invitation could not be created.'));
      }
    } catch {
      setError('Invitation could not be created. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleSave(member: MemberInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await updateMemberRole(selectedCompanyId, member.userId, editRole, editDept || null);
      if (res.status === 200) {
        setMessage('Member updated.');
        setEditUserId('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Member could not be updated.'));
      }
    } catch {
      setError('Member could not be updated. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(member: MemberInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await removeMember(selectedCompanyId, member.userId);
      if (res.status === 200) {
        setMessage('Member removed. Their access stopped immediately.');
        setConfirmRemove('');
        await load();
      } else {
        setError(friendlyError(res.data, 'Member could not be removed.'));
      }
    } catch {
      setError('Member could not be removed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(invitation: InvitationInfo) {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await revokeInvite(selectedCompanyId, invitation.id);
      if (res.status === 200) {
        setMessage('Invitation revoked. It can no longer be used.');
        await load();
      } else {
        setError(friendlyError(res.data, 'Invitation could not be revoked.'));
      }
    } catch {
      setError('Invitation could not be revoked. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied('Link copied.');
    } catch {
      setInviteCopied('Copy the link manually from the field above.');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading team…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Employees and teams</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Members, invitations and roles for this company. Changes take effect immediately.</p>
      <div className="mt-6">
        <CompanyPicker companies={companies} selectedCompanyId={selectedCompanyId} onSelect={onSelectCompany} />
      </div>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}

      {canInvite && (
        <form onSubmit={handleInvite} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Invite a team member</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The member opens the link, sees a one-time password, and sets up their own authenticator.</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="invite-email">Email</label>
          <input id="invite-email" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold" htmlFor="invite-role">Role</label>
              <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                {inviteRoles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="invite-dept">Department</label>
              <select id="invite-dept" value={inviteDept} onChange={(e) => setInviteDept(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]">
                <option value="">No department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create invitation'}
          </button>
          {inviteLink && (
            <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-600">
              <label className="block text-sm font-semibold" htmlFor="invite-link">Invitation link (share this with the member)</label>
              <input id="invite-link" type="text" readOnly value={inviteLink} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
              <button type="button" onClick={copyInviteLink} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Copy link</button>
              {inviteCopied && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{inviteCopied}</p>}
            </div>
          )}
        </form>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-bold">Members</h2>
        {members.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No members are visible for this company.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">{member.email || member.userId}</td>
                    <td className="px-4 py-3">{member.role}</td>
                    <td className="px-4 py-3">{member.departmentName || 'No department'}</td>
                    <td className="px-4 py-3">
                      {canManageRow(member) && editUserId !== member.userId && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => { setEditUserId(member.userId); setEditRole(member.role); setEditDept(member.departmentId || ''); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Change role</button>
                          {confirmRemove !== member.userId ? (
                            <button type="button" onClick={() => setConfirmRemove(member.userId)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Remove</button>
                          ) : (
                            <span className="flex gap-2">
                              <button type="button" disabled={busy} onClick={() => handleRemove(member)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm remove</button>
                              <button type="button" onClick={() => setConfirmRemove('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                            </span>
                          )}
                        </div>
                      )}
                      {canManageRow(member) && editUserId === member.userId && (
                        <div className="flex flex-wrap items-end gap-2">
                          <select aria-label="New role" value={editRole} onChange={(e) => setEditRole(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
                            {(callerRole === 'owner' ? ['owner', 'admin', 'manager', 'employee'] : ['manager', 'employee']).map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                          <select aria-label="New department" value={editDept} onChange={(e) => setEditDept(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-[#0f1220]">
                            <option value="">No department</option>
                            {departments.map((dept) => (
                              <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                          </select>
                          <button type="button" disabled={busy} onClick={() => handleRoleSave(member)} className="rounded-lg bg-[#000080] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Save</button>
                          <button type="button" onClick={() => setEditUserId('')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600">Cancel</button>
                        </div>
                      )}
                      {!canManageRow(member) && <span className="text-slate-500 dark:text-slate-400">No changes available</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(callerRole === 'owner' || callerRole === 'admin') && (
        <div className="mt-8">
          <h2 className="text-xl font-bold">Invitations</h2>
          {invitations.length === 0 ? (
            <p className="mt-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No invitations yet. Invite your first team member with the form above.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3">{invitation.email}</td>
                      <td className="px-4 py-3">{invitation.role}</td>
                      <td className="px-4 py-3">{invitation.state}</td>
                      <td className="px-4 py-3">
                        {invitation.state === 'pending' ? (
                          <button type="button" disabled={busy} onClick={() => handleRevoke(invitation)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-600 disabled:opacity-50">Revoke</button>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">No action available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
