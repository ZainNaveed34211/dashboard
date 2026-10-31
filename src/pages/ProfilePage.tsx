import { useCallback, useEffect, useState } from 'react';
import { fetchProfile, friendlyError, updateProfile, type ProfileInfo } from '../lib/api';

function asProfile(data: Record<string, unknown>): ProfileInfo | null {
  const profile = data.profile as ProfileInfo | undefined;
  if (!profile || typeof profile.userId !== 'string') return null;
  return profile;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProfile();
      if (res.status === 200) {
        const found = asProfile(res.data);
        setProfile(found);
        if (found) {
          setFirstName(found.firstName);
          setLastName(found.lastName);
          setJobTitle(found.jobTitle);
          setPhone(found.phone);
        }
      } else {
        setError(friendlyError(res.data, 'Profile could not be loaded.'));
      }
    } catch {
      setError('Profile could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const res = await updateProfile({ firstName, lastName, jobTitle, phone });
      if (res.status === 200) {
        setMessage('Profile saved.');
        await load();
      } else {
        setError(friendlyError(res.data, 'Profile could not be saved.'));
      }
    } catch {
      setError('Profile could not be saved. Check your connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Loading profile…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-lg text-slate-600 dark:text-slate-300">Profile could not be loaded.</p>
      </div>
    );
  }

  const editable = profile.userType === 'member';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">My profile</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">{profile.email}</p>
      {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{error}</p>}
      {!editable && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-[#171a2e]">Company owners manage their profile in Kluzar accounts. The details below are read-only here.</p>
      )}
      <form onSubmit={handleSave} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#171a2e]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold" htmlFor="profile-first">First name</label>
            <input id="profile-first" type="text" value={firstName} disabled={!editable} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-60 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="profile-last">Last name</label>
            <input id="profile-last" type="text" value={lastName} disabled={!editable} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-60 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="profile-job">Job title</label>
            <input id="profile-job" type="text" value={jobTitle} disabled={!editable} onChange={(e) => setJobTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-60 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="profile-phone">Phone</label>
            <input id="profile-phone" type="tel" value={phone} disabled={!editable} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-60 dark:border-slate-600 dark:bg-[#0f1220]" />
          </div>
        </div>
        {editable && (
          <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gradient-to-r from-[#000080] to-[#5F3EC1] px-5 py-2.5 font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        )}
      </form>
    </div>
  );
}
