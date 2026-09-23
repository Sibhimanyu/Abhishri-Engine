import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { isNative } from '../utils/native';

// The iOS app loads this site live, so web changes reach phones on the next
// launch with no install. Only a new native build (plugins, Swift, icon) has to
// go through SideStore, and SideStore only shows it under its own My Apps tab,
// which nobody opens. This reads the same source SideStore reads
// (frontend/ios/release.sh) and points at SideStore when a newer build exists.
// It never downloads anything itself. Cost: one small GET per foreground, at
// most hourly.
const SOURCE_URL = 'https://abhishri-ios.web.app/source.json';
const CHECK_EVERY_MS = 60 * 60 * 1000;

export default function NativeUpdateBanner() {
  const [available, setAvailable] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isNative) return;
    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      try {
        const [{ App }, res] = await Promise.all([
          import('@capacitor/app'),
          fetch(SOURCE_URL, { cache: 'no-store' }),
        ]);
        const latest = (await res.json()).apps?.[0]?.versions?.[0];
        const { build } = await App.getInfo();
        // Build numbers are UTC timestamps and only go up; the version is a label.
        if (latest && Number(latest.buildVersion) > Number(build)) setAvailable(latest.version || 'A new version');
      } catch {
        // Offline, or nothing published yet: the next foreground tries again.
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  if (!available || dismissed) return null;

  return (
    <div
      className="fixed inset-x-3 z-[10000] flex items-center gap-3 rounded-xl border border-brand-card-border bg-brand-card px-4 py-3 shadow-lg text-sm text-brand-text"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      role="status"
    >
      <Download size={18} className="shrink-0 text-brand-primary" />
      <span className="flex-1">App update {available} is ready in SideStore.</span>
      <a href="sidestore://" className="font-bold text-brand-primary">Open</a>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-brand-text-dim p-1">
        <X size={16} />
      </button>
    </div>
  );
}
