export const GTAG_ID = 'G-T30S2TK79K';
export const ADSENSE_CLIENT = 'ca-pub-3050978093233454';

export function adsEligible(status: string): boolean {
  return status === 'guest' || status === 'free';
}

export interface AnalyticsEvent {
  event: string;
  tool?: string;
  outcome?: string;
}

export function sanitizeEvent(evt: AnalyticsEvent): Record<string, string> {
  const out: Record<string, string> = {};
  out.event = String(evt.event).slice(0, 64);
  if (evt.tool) out.tool = String(evt.tool).slice(0, 64);
  if (evt.outcome) out.outcome = String(evt.outcome).slice(0, 32);
  return out;
}

let gtagLoaded = false;

export function loadGoogleAnalytics(): void {
  if (gtagLoaded) return;
  gtagLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GTAG_ID;
  document.head.appendChild(s);
  const inline = document.createElement('script');
  inline.text = "window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '" + GTAG_ID + "');";
  document.head.appendChild(inline);
}

export function trackPageView(path: string): void {
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag === 'function') w.gtag('event', 'page_view', { page_path: path });
  } catch {
  }
}

export function trackEvent(evt: AnalyticsEvent): void {
  try {
    const clean = sanitizeEvent(evt);
    const params: Record<string, string> = {};
    if (clean.tool) params.tool = clean.tool;
    if (clean.outcome) params.outcome = clean.outcome;
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag === 'function') w.gtag('event', clean.event, params);
  } catch {
  }
}

let adsLoaded = false;

export function loadAdSense(): void {
  if (adsLoaded) return;
  adsLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_CLIENT;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}

export function pushAdSlot(): void {
  try {
    const w = window as unknown as { adsbygoogle?: unknown[] };
    w.adsbygoogle = w.adsbygoogle || [];
    w.adsbygoogle.push({});
  } catch {
  }
}
