import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loadAdSense, pushAdSlot } from '../lib/analytics';
import { premiumUrl } from '../lib/api';

interface UpgradePageProps {
  plan: string;
}

export default function UpgradePage({ plan }: UpgradePageProps) {
  useEffect(() => {
    if (plan === 'free') {
      loadAdSense();
      pushAdSlot();
    }
  }, [plan]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-2xl bg-gradient-to-r from-[#000080] to-[#5F3EC1] p-8 text-white shadow-lg">
        <h1 className="text-3xl font-bold">Kluzar Dashboard needs Max</h1>
        <p className="mt-3 max-w-2xl text-lg text-violet-100">The Company Management Dashboard is a Max product. Upgrade to Max to manage your company, invite your team and use every dashboard section.</p>
        {plan && plan !== 'free' && (
          <p className="mt-3 text-violet-100">Your current plan: {plan}.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={premiumUrl()} className="rounded-lg bg-white px-5 py-2.5 font-semibold text-[#141272] hover:opacity-90">Get Premium</a>
          <Link to="/" className="rounded-lg border border-white px-5 py-2.5 font-semibold text-white hover:bg-white hover:text-[#141272]">Back to Home</Link>
        </div>
      </div>
      {plan === 'free' && (
        <div className="mt-8">
          <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client="ca-pub-3050978093233454" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>
        </div>
      )}
    </div>
  );
}
