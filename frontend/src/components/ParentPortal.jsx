import React, { useState, useEffect, useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { functions, auth, firestore } from '../firebase';
import { Spinner } from './Spinner';
import SchoolCalendar from './SchoolCalendar';
import PaymentReceipt from './PaymentReceipt';
import { INR } from '../utils/reportUtils';
import { LogOut, Moon, Sun, CheckCircle, XCircle, Clock, MinusCircle, Wallet, ChevronLeft, ChevronRight, Receipt, CalendarDays, Utensils, CalendarCheck, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * The parent portal: what a parent sees after signing in with their phone number.
 *
 * Everything about the child comes from the getParentPortal / getParentAttendance
 * callables (functions/src/students/portal.js), which check the signed-in number
 * against the record on every request and return only what the school chose to
 * show parents: name, programme and joining date, attendance, fees, payments and
 * receipts. The school calendar and the weekly menu are school-wide and are read
 * directly, as every signed-in user may.
 */

const fetchPortal = httpsCallable(functions, 'getParentPortal');
const fetchAttendance = httpsCallable(functions, 'getParentAttendance');

const STATUS = {
  present: { label: 'Present', color: 'text-green-600 dark:text-green-400', tile: 'bg-green-500/10 border-green-500/20', cell: 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-400', icon: CheckCircle },
  absent: { label: 'Absent', color: 'text-red-600 dark:text-red-400', tile: 'bg-red-500/10 border-red-500/20', cell: 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-400', icon: XCircle },
  late: { label: 'Late', color: 'text-yellow-600 dark:text-yellow-400', tile: 'bg-yellow-500/10 border-yellow-500/20', cell: 'bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-400', icon: Clock },
  none: { label: 'Not marked yet', color: 'text-brand-text-dim', tile: 'bg-black/5 dark:bg-white/5 border-transparent', cell: '', icon: MinusCircle },
};

const TABS = [
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'fees', label: 'Fees', icon: Wallet },
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

function Card({ title, right, children }) {
  return (
    <section className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm">
      {(title || right) && (
        <div className="flex justify-between items-center mb-5 gap-3">
          <h3 className="font-bold text-brand-text uppercase tracking-widest text-xs">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function AttendanceMonth({ child, today, cache, loadMonth }) {
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const earliest = (() => {
    const joined = /^\d{4}-\d{2}/.exec(child.enrollmentDate || '')?.[0];
    const floor = shiftMonth(thisMonth, -MAX_MONTHS_BACK);
    return joined && joined > floor ? joined : floor;
  })();

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

  return (
    <Card
      title="Attendance"
      right={pct !== null && <span className="text-2xl font-black text-brand-text">{pct}%</span>}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= earliest}
          aria-label="Previous month"
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-brand-text disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-bold text-brand-text">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth}
          aria-label="Next month"
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-brand-text disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex justify-around mb-2">
        {['present', 'absent', 'late'].map(k => (
          <div key={k} className="text-center">
            <span className={`font-bold text-lg ${STATUS[k].color}`}>{counts[k]}</span>
            <p className="text-[10px] text-brand-text-dim uppercase font-bold">{STATUS[k].label}</p>
          </div>
        ))}
      </div>

      {entry?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-8">Couldn't load this month. Check your connection and try again.</p>
      ) : !entry ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-7 gap-2 mt-4">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="text-center text-xs font-bold text-brand-text-dim uppercase">{d}</div>)}
          {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const key = `${month}-${String(i + 1).padStart(2, '0')}`;
            const status = statuses[key];
            const isSunday = new Date(y, m - 1, i + 1).getDay() === 0;
            const muted = key > today || isSunday;
            const style = status ? STATUS[status].cell : `bg-black/5 dark:bg-white/5 border-transparent text-brand-text ${muted ? 'opacity-30' : ''}`;
            return (
              <div
                key={key}
                title={status ? STATUS[status].label : undefined}
                className={`aspect-square flex items-center justify-center rounded-lg border text-sm font-bold ${style} ${key === today ? 'ring-2 ring-brand-primary' : ''}`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      )}
      {entry && !entry.error && marked === 0 && (
        <p className="text-xs text-brand-text-dim text-center mt-4">No attendance marked for {monthLabel(month)}.</p>
      )}
    </Card>
  );
}

function FeesView({ child, onReceipt }) {
  const { fees, payments } = child;
  return (
    <>
      {fees ? (
        <Card title="Fee plan this year">
          <div className="space-y-3 mb-5">
            {fees.components.map((c, i) => (
              <div key={i} className="flex justify-between items-center border-b border-brand-card-border pb-3 last:border-0 last:pb-0">
                <span className="text-sm font-semibold text-brand-text">{c.name}</span>
                <div className="text-right">
                  <span className="text-sm font-bold text-brand-text">{INR(c.amount * (c.frequency === 'monthly' ? fees.monthsCharged : 1))}</span>
                  <p className="text-[10px] text-brand-text-dim">{c.frequency === 'monthly' ? `${INR(c.amount)}/month × ${fees.monthsCharged}` : 'One-time'}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-brand-text-dim font-semibold">Total for the year</span><span className="font-bold text-brand-text">{INR(fees.totalAnnual)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-brand-text-dim font-semibold">Paid so far</span><span className="font-bold text-green-600 dark:text-green-400">{INR(fees.paid)}</span></div>
            <div className="flex justify-between items-center pt-2 border-t border-brand-card-border">
              <span className="font-bold text-brand-text">Balance</span>
              <span className={`font-black text-xl ${fees.due > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fees.due > 0 ? INR(fees.due) : 'Cleared'}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card title="Fee plan this year">
          <p className="text-sm text-brand-text-dim">The school hasn't set up a fee plan for {child.name} yet.</p>
        </Card>
      )}

      <Card title="Payments">
        {payments.length === 0 ? (
          <p className="text-sm text-brand-text-dim">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-brand-card-border">
            {payments.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-text truncate">{p.description}</p>
                  <p className="text-xs text-brand-text-dim">
                    {p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not recorded'} · {p.method}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-black text-brand-text">{INR(p.amount)}</span>
                  <button
                    onClick={() => onReceipt(p)}
                    className="flex items-center gap-1 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 px-3 py-1.5 rounded-lg"
                  >
                    <Receipt size={14} /> Receipt
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// The school-wide menu, most recently saved first: menus carry a free-text week
// label rather than a date, so the latest one the school saved is this week's.
function MenuView() {
  const [menu, setMenu] = useState(undefined);

  useEffect(() => {
    getDocs(query(collection(firestore, 'weekly_menus'), orderBy('updatedAt', 'desc'), limit(1)))
      .then(snap => setMenu(snap.empty ? null : snap.docs[0].data()))
      .catch(err => { console.error('Failed to load the weekly menu:', err); setMenu(null); });
  }, []);

  if (menu === undefined) return <div className="py-10 flex justify-center"><Spinner /></div>;
  if (!menu) return <Card title="Weekly menu"><p className="text-sm text-brand-text-dim">The school hasn't posted a menu yet.</p></Card>;

  const itemsOf = (day, slot) => (day[slot] || [])
    .map(it => ({ name: it?.name || '', description: it?.description ?? it?.translation ?? '' }))
    .filter(it => it.name.trim() || it.description.trim());

  return (
    <Card title="Weekly menu" right={menu.weekLabel && <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full">{menu.weekLabel}</span>}>
      <div className="space-y-4">
        {(menu.days || []).map((day, i) => (
          <div key={i} className="border border-brand-card-border rounded-2xl p-4">
            <p className="font-black text-brand-text text-sm tracking-wide mb-3">{String(day.day || '').charAt(0) + String(day.day || '').slice(1).toLowerCase()}</p>
            <dl className="space-y-2">
              {MENU_SLOTS.map(([slot, label]) => {
                const items = itemsOf(day, slot);
                return (
                  <div key={slot} className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
                    <dt className="text-brand-text-dim font-semibold">{label}</dt>
                    <dd className="text-brand-text">
                      {items.length === 0 ? '—' : items.map((it, j) => (
                        <span key={j} className="block">
                          <span className="font-semibold">{it.name}</span>
                          {it.description && <span className="text-brand-text-dim"> · {it.description}</span>}
                        </span>
                      ))}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function ParentPortal() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('attendance');
  const [attendance, setAttendance] = useState({});
  const [receipt, setReceipt] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

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

  // "Today" on the summary tile needs this month whichever tab is open.
  const currentChildId = data?.children.find(c => c.id === selectedId)?.id;
  useEffect(() => {
    if (currentChildId && data?.today) loadMonth(currentChildId, data.today.slice(0, 7));
  }, [currentChildId, data?.today, loadMonth]);

  const signOutButton = (
    <button onClick={() => signOut(auth)} className="bg-brand-primary text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:opacity-90">
      <LogOut size={18} /> Sign out
    </button>
  );

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg text-brand-text p-6 text-center">
        <AlertCircle className="text-red-500 mb-4" size={56} />
        <h2 className="text-2xl font-bold mb-2">{loadError === 'denied' ? 'Please sign in with your phone' : "Couldn't load your child's details"}</h2>
        <p className="text-brand-text-dim max-w-md mb-8">
          {loadError === 'denied'
            ? 'The parent portal opens with the mobile number the school has on file. Sign out and choose "Parent" on the sign-in screen.'
            : 'Check your internet connection and try again.'}
        </p>
        <div className="flex gap-3">
          {loadError === 'failed' && (
            <button onClick={() => { setLoadError(null); load(); }} className="border border-brand-card-border px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5">
              <RefreshCw size={18} /> Try again
            </button>
          )}
          {signOutButton}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="h-screen flex items-center justify-center bg-brand-bg"><Spinner /></div>;
  }

  if (data.children.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg text-brand-text p-6 text-center">
        <XCircle className="text-red-500 mb-4" size={56} />
        <h2 className="text-2xl font-bold mb-2">This number isn't linked to a student</h2>
        <p className="text-brand-text-dim max-w-md mb-8">
          {data.phone.replace(/^\+91/, '+91 ')} doesn't match a parent's number on any student's record, or its access has been removed.
          If you think it should work, ask the school office to check the number they have for you.
        </p>
        {signOutButton}
      </div>
    );
  }

  const child = data.children.find(c => c.id === selectedId) || data.children[0];
  const todayEntry = attendance[`${child.id}:${data.today.slice(0, 7)}`];
  const todayStatus = STATUS[todayEntry?.statuses?.[data.today]] || STATUS.none;
  const TodayIcon = todayStatus.icon;
  const hour = new Date().getHours();

  return (
    <div className="min-h-screen bg-brand-bg font-sans transition-colors duration-300 pb-20">
      <header className="bg-brand-sidebar border-b border-brand-card-border h-16 flex items-center justify-between px-6 shrink-0 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo-coral.png" alt="Abhishri Academy" className="h-10 object-contain block dark:hidden" />
          <img src="/logo-white.png" alt="Abhishri Academy" className="h-10 object-contain hidden dark:block" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDarkMode(!isDarkMode)} aria-label={isDarkMode ? 'Light mode' : 'Dark mode'} className="text-brand-text-dim hover:text-brand-text transition-colors p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5">
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => signOut(auth)} aria-label="Sign out" className="text-brand-text-dim hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 pt-6 space-y-6">
        {data.children.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Your children">
            {data.children.map(c => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === child.id}
                onClick={() => setSelectedId(c.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-colors ${c.id === child.id ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-card text-brand-text border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="bg-gradient-to-br from-brand-primary/10 to-brand-secondary/5 border border-brand-card-border p-8 rounded-3xl shadow-sm">
          <p className="text-brand-text-dim text-sm font-medium mb-1">{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}</p>
          <h1 className="text-3xl font-black text-brand-text mb-3 tracking-tight">{child.name}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="bg-white/50 dark:bg-black/20 text-brand-text font-bold px-3 py-1 rounded-lg text-xs uppercase tracking-wide border border-black/5 dark:border-white/5">{child.programme}</span>
            {formatDay(child.enrollmentDate) && (
              <span className="bg-white/50 dark:bg-black/20 text-brand-text-dim font-semibold px-3 py-1 rounded-lg text-xs border border-black/5 dark:border-white/5">Joined {formatDay(child.enrollmentDate)}</span>
            )}
          </div>
          {child.enrollment.status !== 'active' && (
            <p className="mt-4 text-sm font-semibold text-amber-700 dark:text-amber-400">
              {child.enrollment.status === 'leaving'
                ? `Enrollment ends${child.enrollment.exitDate ? ` on ${formatDay(child.enrollment.exitDate)}` : ''}. Fees are charged up to that month only.`
                : `Enrollment ended${child.enrollment.exitDate ? ` on ${formatDay(child.enrollment.exitDate)}` : ''}. Fees are no longer being charged.`}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setTab('attendance')} className={`text-left border ${todayStatus.tile} p-5 rounded-3xl shadow-sm`}>
            <div className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-3">Today</div>
            <div className={`flex items-center gap-2 text-xl font-black ${todayStatus.color}`}>
              <TodayIcon size={24} className="shrink-0" /> {todayStatus.label}
            </div>
          </button>
          <button onClick={() => setTab('fees')} className={`text-left border ${child.fees && child.fees.due > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'} p-5 rounded-3xl shadow-sm`}>
            <div className="text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-3 flex items-center gap-2"><Wallet size={14} /> Fee balance</div>
            {child.fees ? (
              <div className={`text-xl font-black ${child.fees.due > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {child.fees.due > 0 ? INR(child.fees.due) : 'Cleared'}
              </div>
            ) : (
              <div className="text-lg font-bold text-brand-text-dim">No plan yet</div>
            )}
          </button>
        </div>

        <nav className="grid grid-cols-4 bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-brand-card-border/40" role="tablist">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all ${tab === key ? 'bg-brand-card text-brand-primary shadow-sm border border-brand-card-border/40' : 'text-brand-text-dim hover:text-brand-text'}`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>

        {tab === 'attendance' && <AttendanceMonth key={child.id} child={child} today={data.today} cache={attendance} loadMonth={loadMonth} />}
        {tab === 'fees' && <FeesView child={child} onReceipt={setReceipt} />}
        {tab === 'calendar' && <div className="bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-sm"><SchoolCalendar /></div>}
        {tab === 'menu' && <MenuView />}
      </main>

      {receipt && (
        <PaymentReceipt
          receiptTransaction={receipt}
          student={{ id: child.id, name: child.name }}
          components={child.fees?.components}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
