import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { memberLoginSetup, memberLoginSetupVerify, memberLoginStep1, memberLoginVerify, ownerLoginUrl, ownerSession, setDashboardToken } from '../lib/api';
import { validateNext } from '../lib/next';
import { trackEvent } from '../lib/analytics';

interface LoginPageProps {
  onSignedIn: () => Promise<void>;
}

export default function LoginPage({ onSignedIn }: LoginPageProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = validateNext(params.get('next') || '/');
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(params.get('email') || '');
  const [password, setPassword] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState('');

  useEffect(() => {
    if (!otpauthUrl) return;
    QRCode.toDataURL(otpauthUrl).then((url) => setQrDataUrl(url)).catch(() => setQrDataUrl(''));
  }, [otpauthUrl]);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label + ' copied.');
    } catch {
      setCopied('Copy it manually from the field above.');
    }
  }

  function backToPassword() {
    setLoginToken('');
    setOtpauthUrl('');
    setSecret('');
    setBackupCodes([]);
    setQrDataUrl('');
    setCode('');
    setMessage('');
    setStep('password');
  }

  async function finishWithSession(sessionToken: string) {
    setDashboardToken(sessionToken);
    trackEvent({ event: 'member_login', outcome: 'success' });
    await onSignedIn();
    navigate(next, { replace: true });
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const res = await memberLoginStep1(email.trim(), password);
      if (res.status === 200 && typeof res.data.loginToken === 'string') {
        const token = res.data.loginToken;
        if (res.data.next === 'setup') {
          const setup = await memberLoginSetup(token);
          if (setup.status === 200 && typeof setup.data.otpauthUrl === 'string' && typeof setup.data.secret === 'string' && Array.isArray(setup.data.backupCodes)) {
            setLoginToken(token);
            setOtpauthUrl(setup.data.otpauthUrl);
            setSecret(setup.data.secret);
            setBackupCodes(setup.data.backupCodes as string[]);
            setCode('');
            setStep('setup');
            return;
          }
          setMessage('Authenticator setup could not start. Try signing in again.');
          return;
        }
        if (res.data.next === 'mfa') {
          setLoginToken(token);
          setCode('');
          setStep('mfa');
          return;
        }
        setMessage('Sign-in failed. Try again.');
        return;
      }
      if (res.status === 429) {
        setMessage('Too many login attempts. Try again later.');
        trackEvent({ event: 'member_login', outcome: 'rate_limited' });
        return;
      }
      setMessage('Invalid email or password.');
      trackEvent({ event: 'member_login', outcome: 'failed' });
    } catch {
      setMessage('Sign-in failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetupVerify(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const res = await memberLoginSetupVerify(loginToken, code.trim());
      if (res.status === 200 && typeof res.data.sessionToken === 'string') {
        await finishWithSession(res.data.sessionToken);
        return;
      }
      if (res.status === 429) {
        setMessage('Too many login attempts. Try again later.');
        return;
      }
      setMessage('That code was not accepted. Check your authenticator app, then try again.');
    } catch {
      setMessage('Verification failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const res = await memberLoginVerify(loginToken, code.trim());
      if (res.status === 200 && typeof res.data.sessionToken === 'string') {
        await finishWithSession(res.data.sessionToken);
        return;
      }
      if (res.status === 403 && res.data.setupRequired === true) {
        setMessage('Your invitation setup is not finished yet. Sign in again to finish setting up your authenticator.');
        backToPassword();
        return;
      }
      if (res.status === 429) {
        setMessage('Too many login attempts. Try again later.');
        return;
      }
      setMessage('That code was not accepted. Check your authenticator app or backup codes, then try again.');
      trackEvent({ event: 'member_login', outcome: 'failed' });
    } catch {
      setMessage('Verification failed. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOwnerLogin() {
    setOwnerBusy(true);
    setOwnerError('');
    try {
      const res = await ownerSession();
      if (res.status === 200 && typeof res.data.sessionToken === 'string') {
        setDashboardToken(res.data.sessionToken);
        await onSignedIn();
        navigate(next, { replace: true });
        return;
      }
      if (res.status === 403) {
        navigate('/upgrade', { replace: true });
        return;
      }
      if (res.stage === 'account') {
        window.location.href = ownerLoginUrl(next);
        return;
      }
      setOwnerError('Dashboard session could not be started. Please try again. If it keeps failing, let us know.');
    } catch {
      setOwnerError('Could not reach the dashboard service. Please check your connection and try again.');
    } finally {
      setOwnerBusy(false);
    }
  }

  const cardClass = 'mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]';
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-[#0f1220]';
  const buttonClass = 'mt-6 w-full rounded-lg bg-gradient-to-r from-[#000080] to-[#7c5cff] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50';

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-bold">Member Login</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Sign in step by step with the email and password from your invitation.</p>
      {step === 'email' && (
        <form onSubmit={(e) => { e.preventDefault(); setMessage(''); setStep('password'); }} className={cardClass}>
          <label className="block text-sm font-semibold" htmlFor="login-email">Email</label>
          <input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <button type="submit" className={buttonClass}>Continue</button>
        </form>
      )}
      {step === 'password' && (
        <form onSubmit={handlePasswordSubmit} className={cardClass}>
          <p className="text-sm text-slate-600 dark:text-slate-300">Signing in as {email}</p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="login-password">Password</label>
          <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Checking…' : 'Continue'}</button>
          <button type="button" onClick={() => { setMessage(''); setStep('email'); }} className="mt-3 w-full rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Back</button>
        </form>
      )}
      {step === 'setup' && (
        <div className={cardClass}>
          <h2 className="font-bold">Set up your authenticator</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Scan the code below with your authenticator app, or enter the secret manually.</p>
          {qrDataUrl && <img src={qrDataUrl} alt="Authenticator QR code" className="mt-4 h-48 w-48 rounded-lg border border-slate-200 bg-white p-2" />}
          <label className="mt-4 block text-sm font-semibold" htmlFor="setup-secret">Authenticator secret</label>
          <input id="setup-secret" type="text" readOnly value={secret} className={inputClass} />
          <button type="button" onClick={() => copyText(secret, 'Secret')} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Copy secret</button>
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <h3 className="font-bold">Backup codes (shown once)</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Save these somewhere safe. Each code works once if you lose access to your authenticator app.</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((backupCode) => (
                <li key={backupCode} className="rounded bg-white px-2 py-1 text-center dark:bg-[#0f1220]">{backupCode}</li>
              ))}
            </ul>
            <button type="button" onClick={() => copyText(backupCodes.join('\n'), 'Backup codes')} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Copy backup codes</button>
            {copied && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{copied}</p>}
          </div>
          <form onSubmit={handleSetupVerify} className="mt-5">
            <label className="block text-sm font-semibold" htmlFor="setup-code">6-digit code from your authenticator app</label>
            <input id="setup-code" type="text" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
            {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
            <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Verifying…' : 'Verify and activate'}</button>
            <button type="button" onClick={backToPassword} className="mt-3 w-full rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Back</button>
          </form>
        </div>
      )}
      {step === 'mfa' && (
        <form onSubmit={handleMfaVerify} className={cardClass}>
          <label className="block text-sm font-semibold" htmlFor="login-code">Authenticator code or backup code</label>
          <input id="login-code" type="text" inputMode="text" required value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
          {message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Verifying…' : 'Login'}</button>
          <button type="button" onClick={backToPassword} className="mt-3 w-full rounded-lg border border-slate-300 px-5 py-2.5 font-semibold dark:border-slate-600">Back</button>
        </form>
      )}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-[#171a2e]">
        <h2 className="font-bold">Company owner?</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Owners sign in through Kluzar accounts, then return here.</p>
        <button type="button" onClick={handleOwnerLogin} disabled={ownerBusy} className="mt-3 rounded-lg bg-[#000080] px-5 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">{ownerBusy ? 'Checking…' : 'Owner Login'}</button>
        {ownerError && (<p className="mt-2 text-sm text-red-600 dark:text-red-400">{ownerError}</p>)}
      </div>
    </div>
  );
}
