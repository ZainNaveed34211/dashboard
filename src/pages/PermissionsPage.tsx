import { Link } from 'react-router-dom';

const ROWS: Array<{ action: string; owner: string; admin: string; manager: string; employee: string }> = [
  { action: 'View company overview', owner: 'Yes', admin: 'Yes', manager: 'Own departments', employee: 'Own tasks' },
  { action: 'Edit company settings', owner: 'Yes', admin: 'No', manager: 'No', employee: 'No' },
  { action: 'Transfer ownership', owner: 'Yes', admin: 'No', manager: 'No', employee: 'No' },
  { action: 'Delete company', owner: 'Yes', admin: 'No', manager: 'No', employee: 'No' },
  { action: 'Invite members', owner: 'Any role', admin: 'Manager, Employee', manager: 'No', employee: 'No' },
  { action: 'Change member roles', owner: 'Yes', admin: 'Manager, Employee', manager: 'No', employee: 'No' },
  { action: 'Remove members', owner: 'Yes', admin: 'Manager, Employee', manager: 'No', employee: 'No' },
  { action: 'Manage departments', owner: 'Yes', admin: 'Yes', manager: 'View own', employee: 'View own' },
  { action: 'Create and edit projects', owner: 'Yes', admin: 'Yes', manager: 'Own departments', employee: 'View assigned' },
  { action: 'Delete projects', owner: 'Yes', admin: 'Yes', manager: 'No', employee: 'No' },
  { action: 'Create tasks', owner: 'Yes', admin: 'Yes', manager: 'Own departments', employee: 'No' },
  { action: 'Assign tasks', owner: 'Yes', admin: 'Yes', manager: 'Own departments', employee: 'No' },
  { action: 'Edit tasks', owner: 'Yes', admin: 'Yes', manager: 'Own departments', employee: 'Own tasks' },
  { action: 'Comment on tasks', owner: 'Yes', admin: 'Yes', manager: 'With access', employee: 'Own tasks' },
  { action: 'Calendars', owner: 'Yes', admin: 'Yes', manager: 'Scoped', employee: 'Scoped' },
  { action: 'Customers', owner: 'Edit', admin: 'Edit', manager: 'Edit', employee: 'View only' },
  { action: 'Documents', owner: 'Yes', admin: 'Yes', manager: 'Yes', employee: 'Own-task upload' },
  { action: 'Export and full reports', owner: 'Yes', admin: 'Yes', manager: 'Own departments', employee: 'Own tasks only' },
  { action: 'Dashboard layouts', owner: 'Default and personal', admin: 'Default and personal', manager: 'Personal', employee: 'Personal' },
];

export default function PermissionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">Permissions and access</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">This table states what each role may do. The rules are enforced on the server on every request, never only in this page. A sole owner cannot be demoted or removed without an ownership transfer first, and nobody can change their own role.</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3">Permission</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Employee</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.action} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 font-semibold">{row.action}</td>
                <td className="px-4 py-3">{row.owner}</td>
                <td className="px-4 py-3">{row.admin}</td>
                <td className="px-4 py-3">{row.manager}</td>
                <td className="px-4 py-3">{row.employee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">To change who can do what, update a member on the employees page.</p>
      <Link to="/employees" className="mt-3 inline-block rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white hover:opacity-90">Go to employees</Link>
    </div>
  );
}
