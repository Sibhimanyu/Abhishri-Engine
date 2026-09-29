import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, AlertTriangle, MessageCircle, Cake, ChefHat, CheckCircle, RotateCcw } from 'lucide-react';

// The top-bar bell. What it lists, and the words and links, come from bellEntries
// (utils/bellEntries.js), built on functions/src/shared/notifications.mjs, the same list
// the Cliq bot sends from, so the two never drift apart. This file only decides how
// each kind looks.
const LOOK = {
  accessRequest: { icon: AlertTriangle, iconClass: 'text-orange-500', titleClass: 'text-orange-600 dark:text-orange-400' },
  approvalPending: { icon: ChefHat, iconClass: 'text-brand-primary', titleClass: 'text-brand-primary' },
  approved: { icon: CheckCircle, iconClass: 'text-green-500', titleClass: 'text-green-600 dark:text-green-400' },
  returned: { icon: RotateCcw, iconClass: 'text-amber-500', titleClass: 'text-amber-600 dark:text-amber-400' },
  whatsappUnread: { icon: MessageCircle, iconClass: 'text-green-500', titleClass: 'text-green-600 dark:text-green-400' },
  tamilBirthday: { icon: Cake, iconClass: 'text-pink-500', titleClass: 'text-pink-600 dark:text-pink-400' },
};

export default function NotificationBell({ entries }) {
  const [open, setOpen] = useState(false);
  const active = entries.length > 0;
  // When something's waiting, the bell grows into a pill naming the first thing (plus how
  // many more) and softly blinks, so it's noticed without opening the list.
  const more = entries.length - 1;

  // Ring the bell when something new comes in while the app is already open. The first
  // few seconds are skipped: that's everything loading in, not something new arriving.
  const [arriving, setArriving] = useState(false);
  const seen = useRef(null);
  const settled = useRef(false);
  const timer = useRef(null);
  const keys = entries.map(e => e.key).join('|');
  useEffect(() => {
    const now = new Set(keys ? keys.split('|') : []);
    const before = seen.current;
    seen.current = now;
    if (!before || !settled.current) return;
    if (![...now].some(k => !before.has(k))) return;
    setArriving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArriving(false), 1200);
  }, [keys]);
  useEffect(() => {
    const t = setTimeout(() => { settled.current = true; }, 3000);
    return () => { clearTimeout(t); clearTimeout(timer.current); };
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={active ? `Notifications (${entries.length})` : 'Notifications'}
        className={`relative flex items-center gap-2 rounded-full transition-colors ${
          active
            ? `pl-2.5 pr-3 py-1.5 bg-brand-primary/10 text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/15 ${arriving ? 'motion-safe:animate-bell-pop' : 'motion-safe:animate-bell-blink'}`
            : 'p-2 text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5'
        }`}
      >
        <Bell size={active ? 18 : 20} className={`shrink-0 origin-top ${arriving ? 'motion-safe:animate-bell-ring' : ''}`} />
        {active && (
          <>
            <span key={entries[0].key} className="text-xs sm:text-sm font-semibold truncate max-w-[7.5rem] sm:max-w-[14rem] motion-safe:animate-bell-label-in">{entries[0].title}</span>
            {more > 0 && (
              <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-brand-primary text-white text-[11px] font-bold flex items-center justify-center">+{more}</span>
            )}
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 mt-3 w-72 bg-brand-card border border-brand-card-border rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-2 border-b border-brand-card-border mb-1">
              <p className="text-xs font-bold text-brand-text-dim uppercase">Notifications</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {entries.map(({ key, look, title, text, path }) => {
                const { icon: Icon, iconClass, titleClass } = LOOK[look];
                return (
                  <Link
                    key={key}
                    onClick={() => setOpen(false)}
                    to={path}
                    className="w-full text-left px-4 py-3 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 border-b border-brand-card-border last:border-b-0"
                  >
                    <div className={`mt-0.5 ${iconClass}`}><Icon size={16} /></div>
                    <div>
                      <p className={`font-semibold ${titleClass}`}>{title}</p>
                      <p className="text-xs text-brand-text-dim mt-0.5">{text}</p>
                    </div>
                  </Link>
                );
              })}
              {!active && (
                <div className="px-4 py-6 text-center text-brand-text-dim text-sm">No new notifications</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
