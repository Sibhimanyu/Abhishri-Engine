import React, { useState, useEffect, useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { getDocs } from '../utils/firestoreRead';
import { functions, firestore } from '../firebase';
import SchoolCalendar from './SchoolCalendar';
import { pickMenuFor, todayIST, weekRangeLabel } from '../utils/menuImport';
import { CheckCircle, XCircle, Clock, MinusCircle, ChevronLeft, ChevronRight, CalendarDays, Utensils, CalendarCheck, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * The parent portal: what a parent sees after opening the Arattai mini app.
 *
 * Everything about the child comes from the getParentPortal / getParentAttendance
 * callables (functions/src/students/portal.js), which check the signed-in number
 * against the record on every request and return only what the school chose to
 * show parents: name, programme and joining date, attendance. Fees are never sent to parents.
 * The school calendar and the weekly menu are school-wide and are read directly, as every
 * signed-in user may. There is no sign-out: parents come in through Arattai and stay in.
 */

const fetchPortal = httpsCallable(functions, 'getParentPortal');
const fetchAttendance = httpsCallable(functions, 'getParentAttendance');

const STATUS = {
  present: { label: 'Present', color: 'text-green-700 dark:text-green-400', pill: 'bg-green-500/15 text-green-700 dark:text-green-400', cell: 'bg-green-500/15 text-green-800 dark:text-green-300', dot: 'bg-green-500', icon: CheckCircle },
  absent: { label: 'Absent', color: 'text-red-700 dark:text-red-400', pill: 'bg-red-500/15 text-red-700 dark:text-red-400', cell: 'bg-red-500/15 text-red-800 dark:text-red-300', dot: 'bg-red-500', icon: XCircle },
  late: { label: 'Late', color: 'text-amber-700 dark:text-amber-400', pill: 'bg-amber-500/20 text-amber-800 dark:text-amber-300', cell: 'bg-amber-500/20 text-amber-900 dark:text-amber-300', dot: 'bg-amber-500', icon: Clock },
  none: { label: 'Not marked yet', color: 'text-brand-text-dim', pill: 'bg-black/5 dark:bg-white/10 text-brand-text-dim', cell: '', dot: 'bg-transparent', icon: MinusCircle },
};

const TABS = [
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'menu', label: 'Menu', icon: Utensils },
];

const MENU_SLOTS = [['morningDrink', 'Morning Drink'], ['lunch', 'Lunch'], ['eveningSnack', 'Evening Snack']];
const MAX_MONTHS_BACK = 24;

// 'YYYY-MM' arithmetic without timezones getting involved.
const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const formatDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const joinedLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

function Bar({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-black/[0.07] dark:bg-white/10 ${className}`} />;
}

function Card({ title, right, children, className = '' }) {
  return (
    <section className={`bg-brand-card border border-brand-card-border p-4 rounded-3xl shadow-sm ${className}`}>
      {(title || right) && (
        <div className="flex justify-between items-center mb-4 gap-3 min-h-8">
          <h2 className="font-bold text-brand-text text-base tracking-tight">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function RetryBox({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center text-center py-8 gap-3">
      <p className="text-sm text-brand-text-dim max-w-xs">{message}</p>
      <button onClick={onRetry} className="min-h-11 px-5 rounded-full border border-brand-card-border text-brand-text font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform">
        <RefreshCw size={16} /> Try again
      </button>
    </div>
  );
}

function AttendanceMonth({ child, today, cache, loadMonth, retryMonth }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const touch = useRef(null);
  const earliest = (() => {
    const joined = /^\d{4}-\d{2}/.exec(child.enrollmentDate || '')?.[0];
    const floor = shiftMonth(thisMonth, -MAX_MONTHS_BACK);
    return joined && joined > floor ? joined : floor;
  })();
  const canPrev = month > earliest;
  const canNext = month < thisMonth;

  useEffect(() => { loadMonth(child.id, month); }, [child.id, month, loadMonth]);

  const entry = cache[`${child.id}:${month}`];
  const statuses = entry?.statuses || {};
  const counts = { present: 0, absent: 0, late: 0 };
  Object.values(statuses).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  const marked = counts.present + counts.absent + counts.late;
  const pct = marked ? Math.round(((counts.present + counts.late) / marked) * 100) : null;

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadingBlanks = (first.getDay() + 6) % 7; // Monday-first

  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x; const dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && canNext) setMonth(shiftMonth(month, 1));
    if (dx > 0 && canPrev) setMonth(shiftMonth(month, -1));
  };

  const navBtn = 'size-11 flex items-center justify-center rounded-full text-brand-text active:bg-black/10 dark:active:bg-white/10 disabled:opacity-25 transition-colors';

  return (
    <Card
      title="Attendance"
      right={pct !== null && <span className="text-sm font-bold text-brand-text-dim"><span className="text-2xl font-black text-brand-text tabular-nums">{pct}%</span> attended</span>}
    >
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canPrev} aria-label="Previous month" className={navBtn}><ChevronLeft size={20} /></button>
        <span className="font-bold text-brand-text" aria-live="polite">{monthLabel(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label="Next month" className={navBtn}><ChevronRight size={20} /></button>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>
        {entry?.error ? (
          <RetryBox message="Couldn't load this month. Check your connection and try again." onRetry={() => retryMonth(child.id, month)} />
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="text-center text-[11px] font-bold text-brand-text-dim pb-1">{d}</div>)}
            {!entry
              ? Array.from({ length: 35 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-black/[0.06] dark:bg-white/10" />)
              : <>
                {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const key = `${month}-${String(i + 1).padStart(2, '0')}`;
                  const status = statuses[key];
                  const isSunday = new Date(y, m - 1, i + 1).getDay() === 0;
                  const muted = key > today || isSunday;
                  const style = status ? STATUS[status].cell : `text-brand-text ${muted ? 'opacity-35' : 'bg-black/[0.04] dark:bg-white/[0.06]'}`;
                  return (
                    <div
                      key={key}
                      aria-label={`${i + 1} ${monthLabel(month)}${status ? `, ${STATUS[status].label}` : ''}`}
                      className={`relative aspect-square flex items-center justify-center rounded-xl text-sm font-bold tabular-nums ${style} ${key === today ? 'ring-2 ring-brand-primary' : ''}`}
                    >
                      {i + 1}
                      {status && <span aria-hidden className={`absolute bottom-1 size-1 rounded-full ${STATUS[status].dot}`} />}
                    </div>
                  );
                })}
              </>}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-sm font-semibold text-brand-text-dim">
        {['present', 'absent', 'late'].map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <span aria-hidden> · </span>}
            <span className={STATUS[k].color}>{STATUS[k].label} {entry && !entry.error ? counts[k] : '–'}</span>
          </React.Fragment>
        ))}
        <span className="block text-xs font-medium mt-1">this month</span>
      </p>
      {entry && !entry.error && marked === 0 && (
        <p className="text-xs text-brand-text-dim text-center mt-2">No attendance marked for {monthLabel(month)}.</p>
      )}
    </Card>
  );
}

// The school-wide menu for today: the one whose dates cover today, else the next one
// posted (e.g. at the weekend). Menus that haven't ended yet are few, so pick among them here.
function MenuView() {
  const [menu, setMenu] = useState(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const today = todayIST();
    getDocs(query(collection(firestore, 'weekly_menus'), where('endDate', '>=', today), orderBy('endDate'), limit(10)))
      // Only what an admin approved; menus saved before approval existed have no status and count as published.
      .then(snap => setMenu(pickMenuFor(snap.docs.map(d => d.data()).filter(m => !m.approval || m.approval.status === 'approved'), today)))
      .catch(err => { console.error('Failed to load the weekly menu:', err); setMenu(null); });
  }, [attempt]);

  if (menu === undefined) {
    return (
      <Card title="Weekly menu">
        <div className="space-y-3">{[0, 1, 2].map(i => <Bar key={i} className="h-24 rounded-2xl" />)}</div>
      </Card>
    );
  }
  if (!menu) return <Card title="Weekly menu"><RetryBox message="The school hasn't posted this week's menu yet." onRetry={() => { setMenu(undefined); setAttempt(a => a + 1); }} /></Card>;

  // Same reading as the menu poster: a meal's English names joined by commas, then any
  // descriptions, then the Tamil names in the same order.
  const lineOf = (day, slot, field) => (day[slot] || []).map(it => String(it?.[field] || '').trim()).filter(Boolean).join(', ');

  const dates = weekRangeLabel(menu.startDate, menu.endDate);
  return (
    <Card title="Weekly menu" right={<span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-full">{dates}</span>}>
      <div className="space-y-3">
        {(menu.days || []).map((day, i) => (
          <div key={i} className="bg-black/[0.03] dark:bg-white/[0.04] rounded-2xl p-4">
            <p className="font-black text-brand-text text-base tracking-tight mb-2">{String(day.day || '').charAt(0) + String(day.day || '').slice(1).toLowerCase()}</p>
            {day.holiday ? (
              <p className="text-sm text-brand-text"><span className="font-semibold">Holiday</span>{day.holidayNote && <span className="text-brand-text-dim"> · {day.holidayNote}</span>}</p>
            ) : (
              <dl className="space-y-3">
                {MENU_SLOTS.map(([slot, label]) => {
                  const [names, descriptions, tamil] = ['name', 'description', 'translation'].map(f => lineOf(day, slot, f));
                  return (
                    <div key={slot} className="text-sm">
                      <dt className="text-[11px] uppercase tracking-wider text-brand-text-dim font-bold mb-0.5">{label}</dt>
                      <dd className="text-brand-text leading-snug">
                        {!names && !descriptions && !tamil ? '—' : (
                          <>
                            {names && <span className="block font-semibold text-[15px]">{names}</span>}
                            {descriptions && <span className="block text-brand-text-dim">{descriptions}</span>}
                            {tamil && <span className="block text-brand-text-dim" lang="ta">{tamil}</span>}
                          </>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Logo({ className = 'h-8' }) {
  return (
    <>
      <img src="/logo-coral.png" alt="Abhishri Academy" className={`${className} w-auto object-contain block dark:hidden`} />
      <img src="/logo-white.png" alt="Abhishri Academy" className={`${className} w-auto object-contain hidden dark:block`} />
    </>
  );
}

function Shell({ children }) {
  return <div className="min-h-dvh flex flex-col items-center justify-center bg-brand-bg text-brand-text px-6 text-center pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">{children}</div>;
}

function PortalSkeleton() {
  return (
    <div className="h-dvh flex flex-col bg-brand-bg" aria-busy="true" aria-label="Loading">
      <div className="h-14 px-5 flex items-center justify-between pt-[env(safe-area-inset-top)] box-content"><Bar className="h-7 w-28" /><Bar className="h-4 w-24" /></div>
      <div className="flex-1 px-4 pt-2 space-y-4">
        <Bar className="h-40 rounded-3xl" />
        <Bar className="h-80 rounded-3xl" />
      </div>
      <div className="h-16 border-t border-brand-card-border bg-brand-sidebar pb-[env(safe-area-inset-bottom)] box-content" />
    </div>
  );
}

export default function ParentPortal() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('attendance');
  const [attendance, setAttendance] = useState({});
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: result } = await fetchPortal();
      setData(result);
      setSelectedId(prev => result.children.some(c => c.id === prev) ? prev : result.children[0]?.id || null);
    } catch (err) {
      console.error('Parent portal: loading failed', err);
      setLoadError(err?.code === 'functions/permission-denied' ? 'denied' : 'failed');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Months already fetched or in flight, so paging back and forth doesn't refetch.
  const requested = useRef(new Set());
  const loadMonth = useCallback(async (studentId, month) => {
    const key = `${studentId}:${month}`;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    try {
      const { data: result } = await fetchAttendance({ studentId, month });
      setAttendance(prev => ({ ...prev, [key]: { statuses: result.statuses } }));
    } catch (err) {
      console.error('Parent portal: attendance failed', err);
      requested.current.delete(key);
      setAttendance(prev => ({ ...prev, [key]: { error: true } }));
    }
  }, []);
  const retryMonth = useCallback((studentId, month) => {
    setAttendance(prev => { const next = { ...prev }; delete next[`${studentId}:${month}`]; return next; });
    loadMonth(studentId, month);
  }, [loadMonth]);

  // "Today" in the hero needs this month whichever tab is open.
  const currentChildId = data?.children.find(c => c.id === selectedId)?.id;
  useEffect(() => {
    if (currentChildId && data?.today) loadMonth(currentChildId, data.today.slice(0, 7));
  }, [currentChildId, data?.today, loadMonth]);

  if (loadError) {
    return (
      <Shell>
        <Logo className="h-10 mb-8" />
        <AlertCircle className="text-red-500 mb-4" size={48} />
        <h1 className="text-xl font-bold mb-2">{loadError === 'denied' ? 'Please open the app again' : "Couldn't load your child's details"}</h1>
        <p className="text-brand-text-dim max-w-sm mb-8">
          {loadError === 'denied'
            ? "Close this and open the Abhishri Academy mini app in Arattai to see your child's details."
            : 'Check your internet connection and try again.'}
        </p>
        <button onClick={() => { setLoadError(null); load(); }} className="min-h-12 px-6 rounded-full bg-brand-primary text-white font-bold flex items-center gap-2 active:scale-95 transition-transform">
          <RefreshCw size={18} /> Try again
        </button>
      </Shell>
    );
  }

  if (!data) return <PortalSkeleton />;

  if (data.children.length === 0) {
    return (
      <Shell>
        <Logo className="h-10 mb-8" />
        <XCircle className="text-red-500 mb-4" size={48} />
        <h1 className="text-xl font-bold mb-2">This number isn't linked to a student</h1>
        <p className="text-brand-text-dim max-w-sm mb-8">
          {data.phone.replace(/^\+91/, '+91 ')} doesn't match a parent's number on any student's record, or its access has been removed.
          If you think it should work, ask the school office to check the number they have for you.
        </p>
        <button onClick={() => { setData(null); load(); }} className="min-h-12 px-6 rounded-full border border-brand-card-border font-bold flex items-center gap-2 active:scale-95 transition-transform">
          <RefreshCw size={18} /> Try again
        </button>
      </Shell>
    );
  }

  const child = data.children.find(c => c.id === selectedId) || data.children[0];
  const todayEntry = attendance[`${child.id}:${data.today.slice(0, 7)}`];
  const todayStatus = STATUS[todayEntry?.statuses?.[data.today]] || STATUS.none;
  const TodayIcon = todayStatus.icon;
  const joined = joinedLabel(child.enrollmentDate);

  return (
    <div className="h-dvh flex flex-col bg-brand-bg font-sans text-brand-text overflow-hidden">
      <header className={`shrink-0 relative flex items-center justify-between gap-3 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] bg-brand-bg border-b transition-colors duration-150 ${collapsed ? 'border-brand-card-border' : 'border-transparent'}`}>
        <Logo className="h-8" />
        <p aria-hidden={!collapsed} className={`absolute inset-x-24 bottom-3 text-center text-[15px] font-bold truncate transition-opacity duration-150 ${collapsed ? 'opacity-100' : 'opacity-0'}`}>{child.name}</p>
        <p className="text-sm font-semibold text-brand-text-dim">{greeting()}</p>
      </header>

      <main onScroll={(e) => { const c = e.currentTarget.scrollTop > 56; setCollapsed(prev => prev === c ? prev : c); }} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-2 pb-6 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
        <div className="max-w-2xl mx-auto space-y-4">
          {data.children.length > 1 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 [scrollbar-width:none]" role="tablist" aria-label="Your children">
              {data.children.map(c => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={c.id === child.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`shrink-0 min-h-11 px-5 rounded-full text-sm font-bold border transition-colors active:scale-95 ${c.id === child.id ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-card text-brand-text border-brand-card-border'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <section aria-label={child.name} className="bg-gradient-to-br from-brand-primary/15 via-brand-card to-brand-secondary/10 border border-brand-card-border p-5 rounded-3xl shadow-sm">
            <div className="flex items-center gap-4">
              <div aria-hidden className="size-16 shrink-0 rounded-full bg-brand-primary text-white flex items-center justify-center text-2xl font-black tracking-tight shadow-sm">{initialsOf(child.name)}</div>
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight leading-tight text-brand-text break-words">{child.name}</h1>
                <p className="text-sm text-brand-text-dim font-semibold mt-0.5">
                  {child.programme}{joined && <> · Joined {joined}</>}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-text-dim">Today</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${todayStatus.pill}`} aria-live="polite">
                {!todayEntry ? <span className="h-4 w-20 rounded-full animate-pulse bg-black/10 dark:bg-white/15" /> : <><TodayIcon size={16} className="shrink-0" /> {todayStatus.label}</>}
              </span>
            </div>
            {child.enrollment.status !== 'active' && (
              <p className="mt-3 text-sm font-semibold text-amber-800 dark:text-amber-400">
                {child.enrollment.status === 'leaving'
                  ? `Enrollment ends${child.enrollment.exitDate ? ` on ${formatDay(child.enrollment.exitDate)}` : ''}.`
                  : `Enrollment ended${child.enrollment.exitDate ? ` on ${formatDay(child.enrollment.exitDate)}` : ''}.`}
              </p>
            )}
          </section>

          <div key={tab} role="tabpanel" aria-label={TABS.find(t => t.key === tab).label} className="animate-portal-in selectable">
            {tab === 'attendance' && <AttendanceMonth key={child.id} child={child} today={data.today} cache={attendance} loadMonth={loadMonth} retryMonth={retryMonth} />}
            {tab === 'calendar' && <Card title="School calendar"><SchoolCalendar /></Card>}
            {tab === 'menu' && <MenuView />}
          </div>
        </div>
      </main>

      <nav className="shrink-0 border-t border-brand-card-border bg-brand-sidebar/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Sections">
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          {TABS.map(({ key, label, icon: Icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(key)}
                className={`min-h-[49px] flex flex-col items-center justify-center gap-1 text-[11px] font-bold tracking-wide transition-[color,transform] active:scale-95 focus-visible:outline-2 focus-visible:outline-brand-primary ${on ? 'text-brand-primary' : 'text-brand-text-dim'}`}
              >
                <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
