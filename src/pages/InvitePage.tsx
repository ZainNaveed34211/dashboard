import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { claimInvite, mfaSetup, mfaVerify, setDashboardToken } from '../lib/api';

interface InvitePageProps {
  onSignedIn: () => Promise<void>;
}

export default function InvitePage({ onSignedIn }: InvitePageProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [step, setStep] = useState('loading');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setStep('error');
      setMessage('This invitation link is missing its token. Ask your company owner for a fresh invitation link.');
      return;
    }
    claimInvite(token).then((res) => {
      if (res.status === 200 && typeof res.data.setupToken === 'string' && typeof res.data.password === 'string') {
        setSetupToken(res.data.setupToken);
        setPassword(res.data.password);
        setEmail(typeof res.data.email === 'string' ? res.data.email : '');
        setCompanyName(typeof res.data.companyName === 'string' ? res.data.companyName : '');
        setRole(typeof res.data.role === 'string' ? res.data.role : '');
        setStep('password');
      } else {
        setStep('error');
        setMessage('This invitation link is expired or already used. Ask your company owner for a fresh invitation link.');
      }
    }).catch(() => {
      setStep('error');
      setMessage('This invitation could not be opened. Check your connection, then try again.');
    });
  }, [token]);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label + ' copied.');
    } catch {
      setCopied('Copy it manually from the field above.');
    }
  }

  async function startSetup() {
    setBusy(true);
    setMessage('');
    try {
      const res = await mfaSetup(setupToken);
      if (res.status === 200 && typeof res.data.secret === 'string') {
        setSecret(res.data.secret);
        setStep('setup');
      } else {
        setMessage('Authenticator setup could not start. Open your invitation link again.');
      }
    } catch {
      setMessage('Authenticator setup could not start. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const res = await mfaVerify(setupToken, code.trim());
      if (res.status === 200 && typeof res.data.sessionToken === 'string') {
        setDashboardToken(res.data.sessionToken);
        await onSignedIn();
        navigate('/');
        return;
      }
      setMessage('That code was not accepted. Check your authenticator app, then try again.');
    } catch {
      setMessage('Verification failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'loading') {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Opening your invitation…</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-bold">Invitation unavailable</h1>
        <p className="mt-3 rounded-lg bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-bold">Welcome to {companyName}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">You were invited as {role} for {email}. Save the password below, then set up your authenticator.</p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
          <label className="block text-sm font-semibold" htmlFor="invite-password">Your password (shown once)</label>
          <input id="invite-password" type="text" readOnly value={password} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          <button type="button" onClick={() => copyText(password, 'Password')} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Copy password</button>
          {copied && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{copied}</p>}
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Keep this password safe. You will sign in with it plus an authenticator code.</p>
          <button type="button" disabled={busy} onClick={startSetup} className="mt-5 w-full rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Starting…' : 'Continue to authenticator setup'}
          </button>
          {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold">Set up your authenticator</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Enter the secret below in your authenticator app, then enter the 6-digit code it shows.</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <label className="block text-sm font-semibold" htmlFor="mfa-secret">Authenticator secret</label>
        <input id="mfa-secret" type="text" readOnly value={secret} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <button type="button" onClick={() => copyText(secret, 'Secret')} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Copy secret</button>
        {copied && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{copied}</p>}
        <form onSubmit={handleVerify} className="mt-5">
          <label className="block text-sm font-semibold" htmlFor="mfa-code">6-digit code</label>
          <input id="mfa-code" type="text" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
          {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
          <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Verifying…' : 'Verify and activate'}
          </button>
        </form>
      </div>
    </div>
  );
}
