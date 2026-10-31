import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { claimInvite } from '../lib/api';

export default function InvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [step, setStep] = useState('loading');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!token) {
      setStep('error');
      setMessage('This invitation link is missing its token. Ask your company owner for a fresh invitation link.');
      return;
    }
    claimInvite(token).then((res) => {
      if (res.status === 200 && typeof res.data.password === 'string') {
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

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold">Welcome to {companyName}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">You were invited as {role} for {email}. Save the password below, then sign in step by step. On first sign-in you will set up your authenticator.</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <label className="block text-sm font-semibold" htmlFor="invite-password">Your password (shown once)</label>
        <input id="invite-password" type="text" readOnly value={password} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]" />
        <button type="button" onClick={() => copyText(password, 'Password')} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Copy password</button>
        {copied && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{copied}</p>}
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Keep this password safe. You will sign in with it, then set up your authenticator on first sign-in.</p>
        <button type="button" onClick={() => navigate('/login?email=' + encodeURIComponent(email))} className="mt-5 w-full rounded-lg bg-gradient-to-r from-[#000080] to-[#5F3EC1] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90">
          Continue to login
        </button>
      </div>
    </div>
  );
}
