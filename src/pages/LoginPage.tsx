import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { memberLogin, ownerLoginUrl, setDashboardToken } from '../lib/api';
import { trackEvent } from '../lib/analytics';

interface LoginPageProps {
  onSignedIn: () => Promise<void>;
}

export default function LoginPage({ onSignedIn }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const res = await memberLogin(email.trim(), password, totp.trim());
      if (res.status === 200 && typeof res.data.sessionToken === 'string') {
        setDashboardToken(res.data.sessionToken);
        trackEvent({ event: 'member_login', outcome: 'success' });
        await onSignedIn();
        navigate('/');
        return;
      }
      if (res.status === 403 && res.data.setupRequired === true) {
        setMessage('Your invitation setup is not finished yet. Open your invitation link to finish setting up your sign-in.');
        trackEvent({ event: 'member_login', outcome: 'setup_required' });
        return;
      }
      setMessage('Sign-in failed. Check your email, password and authenticator code, then try again.');
      trackEvent({ event: 'member_login', outcome: 'failed' });
    } catch {
      setMessage('Sign-in failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold">Member Login</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Sign in with the email and password from your invitation, plus your authenticator code.</p>
      <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <label className="block text-sm font-semibold" htmlFor="login-email">Email</label>
        <input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <label className="mt-4 block text-sm font-semibold" htmlFor="login-password">Password</label>
        <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <label className="mt-4 block text-sm font-semibold" htmlFor="login-totp">Authenticator code</label>
        <input id="login-totp" type="text" inputMode="numeric" required value={totp} onChange={(e) => setTotp(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
        <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Login'}
        </button>
      </form>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
        <h2 className="font-bold">Company owner?</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Owners sign in through Kluzar accounts, then return here.</p>
        <a href={ownerLoginUrl()} className="mt-3 inline-block rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white hover:opacity-90">Owner Login</a>
      </div>
    </div>
  );
}
