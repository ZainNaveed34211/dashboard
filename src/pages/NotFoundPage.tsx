import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">This page does not exist on the dashboard.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/" className="rounded-full bg-[#5F3EC1] px-5 py-2 font-semibold text-white">Back to dashboard</Link>
        <a href="https://kluzar.com/" className="rounded-full border border-slate-300 px-5 py-2 font-semibold dark:border-slate-600">Kluzar home</a>
      </div>
    </div>
  );
}
