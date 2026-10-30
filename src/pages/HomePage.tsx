import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loadAdSense, pushAdSlot } from '../lib/analytics';
import { ownerLoginUrl, type CompanyInfo } from '../lib/api';

interface HomePageProps {
  status: string;
  companies: CompanyInfo[];
  userType: string;
  onLogout: () => void;
}

export default function HomePage({ status, companies, userType, onLogout }: HomePageProps) {
  useEffect(() => {
    if (status === 'guest') {
      loadAdSense();
      pushAdSlot();
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-lg text-slate-600 dark:text-slate-300">Checking your sign-in…</p>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold">Your companies</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Signed in as {userType === 'owner' ? 'company owner' : 'team member'}. Select a company to continue.</p>
        {companies.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">No companies with an active Max subscription were found for this sign-in.</p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {companies.map((company) => (
              <li key={company.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
                <p className="text-lg font-bold">{company.name}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Role: {company.role}</p>
                <p className="mt-1 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-[#141272] dark:bg-violet-900 dark:text-violet-100">Max</p>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onLogout} className="mt-8 rounded-lg border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Logout</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-2xl bg-gradient-to-r from-[#000080] to-[#7c5cff] p-8 text-white shadow-lg">
        <h1 className="text-3xl font-bold sm:text-4xl">Kluzar Dashboard</h1>
        <p className="mt-3 max-w-2xl text-lg text-violet-100">Company management for Max subscribers. Owners invite their team with a role, and team members sign in with their own password and authenticator code.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/login" className="rounded-lg bg-white px-5 py-2.5 font-semibold text-[#141272] hover:opacity-90">Member Login</Link>
          <a href={ownerLoginUrl()} className="rounded-lg border border-white px-5 py-2.5 font-semibold text-white hover:bg-white hover:text-[#141272]">Owner Login</a>
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Team invitations</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">The company owner invites a member by email and role. The member sets up their own sign-in on first use.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Secure member sign-in</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Members sign in with their email, password and authenticator code. Access always follows the selected role.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
          <h2 className="font-bold">Multi-company access</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">One sign-in lists every company you belong to, with the role you hold in each company.</p>
        </div>
      </div>
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">Invited by your company owner? Open the invitation link they shared with you to set up your sign-in.</p>
      <div className="mt-8">
        <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client="ca-pub-3050978093233454" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
      </div>
    </div>
  );
}
