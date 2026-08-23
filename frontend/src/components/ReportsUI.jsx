import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, ArrowUp, ArrowDown, Inbox, ChevronLeft, ChevronRight, ArrowUpDown, Bookmark, Trash2, Plus } from 'lucide-react';
import { INR, INRShort, pct, fmtPct, colorAt } from '../utils/reportUtils';

/**
 * Presentational building blocks shared by every report view. Nothing here talks to
 * Firestore — reports do their own loading/filtering and hand these plain arrays.
 */

const TONES = {
  primary: 'text-brand-primary bg-brand-primary/10',
  green: 'text-green-600 dark:text-green-400 bg-green-500/10',
  red: 'text-red-600 dark:text-red-400 bg-red-500/10',
  blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  purple: 'text-purple-600 dark:text-purple-400 bg-purple-500/10',
  amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  neutral: 'text-brand-text-dim bg-black/5 dark:bg-white/5'
};

/* ------------------------------------------------------------------ layout */

export function SectionCard({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="px-4 md:px-6 py-4 border-b border-brand-card-border flex flex-wrap items-center justify-between gap-3 bg-black/[0.02] dark:bg-white/[0.02]">
          <div>
            {title && <h3 className="font-bold text-brand-text">{title}</h3>}
            {subtitle && <p className="text-xs text-brand-text-dim mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ title = 'Nothing to report', hint, icon: Icon = Inbox }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center px-6">
      <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-3">
        <Icon size={22} className="text-brand-text-dim" />
      </div>
      <p className="font-bold text-brand-text">{title}</p>
      {hint && <p className="text-sm text-brand-text-dim mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ stats */

/**
 * Period-over-period change. `invert` flips the colour semantics for metrics where
 * "up" is bad (expenses): the arrow still points up, but it reads red instead of green.
 */
export function Delta({ current, previous, invert = false, suffix = 'vs prev.' }) {
  if (previous === null || previous === undefined) return null;
  if (!previous) {
    if (!current) return <span className="text-xs text-brand-text-dim">no change</span>;
    return <span className="text-xs font-bold text-brand-text-dim">new</span>;
  }
  const change = pct(current - previous, Math.abs(previous));
  const up = change >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${Math.abs(change) < 0.05 ? 'text-brand-text-dim' : good ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
      <Icon size={12} /> {fmtPct(change)}
      <span className="font-medium text-brand-text-dim">{suffix}</span>
    </span>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'neutral', delta, className = '' }) {
  return (
    <div className={`bg-brand-card border border-brand-card-border rounded-xl p-4 md:p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-text-dim">{label}</p>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONES[tone] || TONES.neutral}`}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <p className="text-2xl md:text-[26px] font-black text-brand-text mt-2 leading-tight break-words">{value}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[18px]">
        {sub && <span className="text-xs text-brand-text-dim">{sub}</span>}
        {delta}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

/** Small hook: close a popover when the user clicks outside it or presses Escape. */
function useDismiss(ref, onDismiss, active) {
  useEffect(() => {
    if (!active) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onDismiss(); };
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onDismiss, active]);
}

const CONTROL = 'bg-brand-bg border border-brand-card-border rounded-lg px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-colors';

export function Field({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">{label}</label>
      {children}
    </div>
  );
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${CONTROL} ${className}`}>
      {options.map(o => <option key={o.id ?? o.value} value={o.id ?? o.value}>{o.label}</option>)}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${CONTROL} ${className}`}
    />
  );
}

/**
 * Checkbox dropdown. An EMPTY selection means "no filter applied" (everything passes) —
 * that keeps a freshly opened report showing all data, and makes "clear" a real reset
 * rather than a state that hides every row.
 */
export function MultiSelect({ label, options, selected, onChange, allLabel = 'All', searchable, width = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);

  const opts = options.map(o => (typeof o === 'string' ? { id: o, label: o } : o));
  const showSearch = searchable ?? opts.length > 8;
  const visible = q ? opts.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : opts;

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  const summary = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? (opts.find(o => o.id === selected[0])?.label || selected[0])
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <Field label={label}>
        <button
          type="button" onClick={() => setOpen(o => !o)}
          className={`${CONTROL} ${width} flex items-center justify-between gap-2 text-left ${selected.length ? 'border-brand-primary/60 ring-1 ring-brand-primary/20' : ''}`}
        >
          <span className={`truncate ${selected.length ? 'font-semibold text-brand-text' : 'text-brand-text-dim'}`}>{summary}</span>
          <ChevronDown size={14} className={`shrink-0 text-brand-text-dim transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </Field>

      {open && (
        <div className={`absolute z-40 mt-1 ${width} min-w-full bg-brand-card border border-brand-card-border rounded-lg shadow-xl overflow-hidden`}>
          {showSearch && (
            <div className="p-2 border-b border-brand-card-border relative">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-dim" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full bg-brand-bg border border-brand-card-border rounded-md py-1.5 pl-7 pr-2 text-xs text-brand-text focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {visible.length === 0 && <p className="px-3 py-4 text-xs text-brand-text-dim text-center">No matches</p>}
            {visible.map(o => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id} type="button" onClick={() => toggle(o.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-brand-primary border-brand-primary' : 'border-brand-card-border'}`}>
                    {on && <Check size={11} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="truncate text-brand-text">{o.label}</span>
                  {o.hint != null && <span className="ml-auto text-[10px] text-brand-text-dim shrink-0">{o.hint}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex border-t border-brand-card-border">
            <button type="button" onClick={() => onChange(visible.map(o => o.id))} className="flex-1 px-3 py-2 text-[11px] font-bold text-brand-primary hover:bg-black/5 dark:hover:bg-white/5">Select all</button>
            <button type="button" onClick={() => onChange([])} className="flex-1 px-3 py-2 text-[11px] font-bold text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 border-l border-brand-card-border">Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)}
      className="flex items-start gap-2.5 text-left group"
    >
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${checked ? 'bg-brand-primary' : 'bg-black/15 dark:bg-white/20'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-brand-text group-hover:text-brand-primary transition-colors">{label}</span>
        {hint && <span className="block text-[11px] text-brand-text-dim leading-snug">{hint}</span>}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ charts */

/**
 * Bar trend built from flexbox divs rather than SVG: it reflows with the container at
 * any width without needing to measure the DOM, and the labels stay crisp text.
 * `series` = [{ key, label, value, count }]; `compare` is an optional aligned series.
 */
export function TrendChart({ series, compare, height = 200, color = '#F1615B', compareColor = '#94a3b8', formatter = INRShort, emptyHint }) {
  const [hover, setHover] = useState(null);
  const peak = Math.max(1, ...series.map(s => Math.abs(s.value)), ...(compare || []).map(s => Math.abs(s.value)));
  const hasData = series.some(s => s.value);

  if (!series.length) return <EmptyState title="No periods in range" hint={emptyHint} />;

  // A dense timeline would collide its own tick labels, so thin them to ~12 visible.
  const step = Math.ceil(series.length / 12);

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <div key={f} className="absolute left-0 right-0 border-t border-dashed border-brand-card-border/70 pointer-events-none" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 text-[9px] text-brand-text-dim bg-brand-card px-1">{formatter(peak * f)}</span>
          </div>
        ))}
        {series.map((s, i) => {
          const cmp = compare?.[i];
          const isHover = hover === i;
          return (
            <div
              key={s.key}
              className="relative flex-1 h-full flex items-end justify-center gap-[2px] group"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            >
              {cmp && (
                <div
                  className="flex-1 max-w-[14px] rounded-t-[3px] transition-all"
                  style={{ height: `${Math.max(Math.abs(cmp.value) / peak * 100, cmp.value ? 1.5 : 0)}%`, backgroundColor: compareColor, opacity: isHover ? 0.9 : 0.45 }}
                />
              )}
              <div
                className="flex-1 max-w-[26px] rounded-t-[3px] transition-all"
                style={{
                  height: `${Math.max(Math.abs(s.value) / peak * 100, s.value ? 1.5 : 0)}%`,
                  backgroundColor: s.value < 0 ? '#ef4444' : color,
                  opacity: hover === null || isHover ? 1 : 0.45
                }}
              />
              {isHover && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 bg-brand-text text-brand-bg px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none">
                  <p className="text-[10px] font-bold opacity-70">{s.label}</p>
                  <p className="text-xs font-black">{INR(s.value)}</p>
                  {cmp && <p className="text-[10px] opacity-70">prev: {INR(cmp.value)}</p>}
                  {s.count != null && <p className="text-[10px] opacity-70">{s.count} {s.count === 1 ? 'entry' : 'entries'}</p>}
                </div>
              )}
            </div>
          );
        })}
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-brand-text-dim">No activity in this range</p>
          </div>
        )}
      </div>
      <div className="flex gap-[3px] mt-2 border-t border-brand-card-border pt-2">
        {series.map((s, i) => (
          <div key={s.key} className="flex-1 text-center overflow-hidden">
            {i % step === 0 && <span className="text-[9px] text-brand-text-dim whitespace-nowrap">{s.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Income vs expense grouped bars with a net line read out on hover. */
export function DualTrendChart({ series, height = 220 }) {
  const [hover, setHover] = useState(null);
  const peak = Math.max(1, ...series.map(s => Math.max(s.income, s.expense)));
  const step = Math.ceil(series.length / 12);

  if (!series.length) return <EmptyState title="No periods in range" />;

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-text"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Money in</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-text"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Money out</span>
      </div>
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <div key={f} className="absolute left-0 right-0 border-t border-dashed border-brand-card-border/70 pointer-events-none" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 text-[9px] text-brand-text-dim bg-brand-card px-1">{INRShort(peak * f)}</span>
          </div>
        ))}
        {series.map((s, i) => {
          const isHover = hover === i;
          const net = s.income - s.expense;
          return (
            <div
              key={s.key} className="relative flex-1 h-full flex items-end justify-center gap-[2px]"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            >
              <div className="flex-1 max-w-[16px] rounded-t-[3px] bg-green-500 transition-all" style={{ height: `${Math.max(s.income / peak * 100, s.income ? 1.5 : 0)}%`, opacity: hover === null || isHover ? 1 : 0.4 }} />
              <div className="flex-1 max-w-[16px] rounded-t-[3px] bg-red-500 transition-all" style={{ height: `${Math.max(s.expense / peak * 100, s.expense ? 1.5 : 0)}%`, opacity: hover === null || isHover ? 1 : 0.4 }} />
              {isHover && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 bg-brand-text text-brand-bg px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none">
                  <p className="text-[10px] font-bold opacity-70">{s.label}</p>
                  <p className="text-xs font-black text-green-400">+{INR(s.income)}</p>
                  <p className="text-xs font-black text-red-400">-{INR(s.expense)}</p>
                  <p className="text-[11px] font-bold mt-0.5 border-t border-white/20 pt-0.5">Net {INR(net)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-2 border-t border-brand-card-border pt-2">
        {series.map((s, i) => (
          <div key={s.key} className="flex-1 text-center overflow-hidden">
            {i % step === 0 && <span className="text-[9px] text-brand-text-dim whitespace-nowrap">{s.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Donut for share-of-total. Slices are drawn as stroked arcs on one circle. */
export function DonutChart({ slices, total, size = 148, thickness = 18 }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const denominator = Math.abs(total) || 1;

  // Each arc starts where the previous one ended, so the offsets are a running sum of the
  // arc lengths before it — precomputed here rather than mutated while mapping to JSX.
  const arcs = [];
  slices.filter(s => Math.abs(s.value) > 0).forEach((s, i) => {
    const length = (Math.abs(s.value) / denominator) * circumference;
    const offset = arcs.length ? arcs[arcs.length - 1].offset + arcs[arcs.length - 1].length : 0;
    arcs.push({ ...s, length, offset, color: s.color || colorAt(i), i });
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} className="stroke-black/5 dark:stroke-white/5" />
        {arcs.map(a => (
          <circle
            key={a.key ?? a.i} cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={a.color} strokeWidth={thickness}
            strokeDasharray={`${a.length} ${circumference - a.length}`}
            strokeDashoffset={-a.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Total</span>
        <span className="text-base font-black text-brand-text leading-tight">{INRShort(total)}</span>
      </div>
    </div>
  );
}

/**
 * Ranked "share of total" table with an inline proportion bar. Rows are clickable so a
 * report can use it to drill the detail table down to one method / category / staff.
 */
export function BreakdownTable({ groups, total, labelHeader = 'Group', onRowClick, activeKey, max = 12 }) {
  const shown = groups.slice(0, max);
  const rest = groups.slice(max);
  const restTotal = rest.reduce((a, g) => a + g.total, 0);
  const restCount = rest.reduce((a, g) => a + g.count, 0);

  if (!groups.length) return <EmptyState title="No data to break down" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-wider bg-brand-bg text-brand-text-dim border-b border-brand-card-border">
          <tr>
            <th className="px-4 md:px-6 py-3 text-left font-bold">{labelHeader}</th>
            <th className="px-3 py-3 text-right font-bold w-20">Entries</th>
            <th className="px-3 py-3 text-right font-bold w-32">Amount</th>
            <th className="px-4 md:px-6 py-3 text-left font-bold w-[34%]">Share</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((g, i) => {
            const share = pct(Math.abs(g.total), Math.abs(total));
            const active = activeKey === g.key;
            return (
              <tr
                key={g.key}
                onClick={onRowClick ? () => onRowClick(active ? null : g.key) : undefined}
                className={`border-b border-brand-card-border transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${active ? 'bg-brand-primary/5' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'}`}
              >
                <td className="px-4 md:px-6 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorAt(i) }} />
                    <span className="font-medium text-brand-text truncate max-w-[220px]" title={g.label}>{g.label}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-brand-text-dim tabular-nums">{g.count}</td>
                <td className={`px-3 py-3 text-right font-bold tabular-nums ${g.total < 0 ? 'text-red-500' : 'text-brand-text'}`}>{INR(g.total)}</td>
                <td className="px-4 md:px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, backgroundColor: colorAt(i) }} />
                    </div>
                    <span className="text-xs font-bold text-brand-text-dim w-11 text-right tabular-nums">{share.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
          {rest.length > 0 && (
            <tr className="border-b border-brand-card-border text-brand-text-dim">
              <td className="px-4 md:px-6 py-3 italic">+ {rest.length} more</td>
              <td className="px-3 py-3 text-right tabular-nums">{restCount}</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums">{INR(restTotal)}</td>
              <td className="px-4 md:px-6 py-3 text-xs tabular-nums">{pct(Math.abs(restTotal), Math.abs(total)).toFixed(1)}%</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Sortable, paginated detail grid. `columns` = [{ key, header, align, width, render, sortValue }].
 */
export function DataTable({ columns, rows, pageSize = 25, emptyTitle = 'No entries match these filters', emptyHint, rowKey = (r) => r.id }) {
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  // Paging is stored against the row set + sort it was chosen for. When the caller's
  // filters produce a new array (or the sort changes) the stored page no longer applies
  // and we fall back to the first page — derived during render, so there is no effect
  // round-trip that would briefly show page 7 of a 2-page result.
  const [paging, setPaging] = useState({ page: 0, rows: null, sort: null });
  const page = paging.rows === rows && paging.sort === sort ? paging.page : 0;
  const setPage = (next) => setPaging(p => ({
    page: typeof next === 'function' ? next(p.rows === rows && p.sort === sort ? p.page : 0) : next,
    rows,
    sort
  }));

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    const valueOf = col.sortValue || ((r) => r[col.key]);
    return [...rows].sort((a, b) => {
      const va = valueOf(a), vb = valueOf(b);
      if (va === vb) return 0;
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va ?? '').localeCompare(String(vb ?? ''))
        : (va ?? 0) - (vb ?? 0);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  if (!rows.length) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider bg-brand-bg text-brand-text-dim border-b border-brand-card-border">
            <tr>
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={c.sortable === false ? undefined : () => toggleSort(c.key)}
                  className={`px-4 py-3 font-bold whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sortable === false ? '' : 'cursor-pointer select-none hover:text-brand-text'}`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {c.header}
                    {c.sortable !== false && (
                      sort.key === c.key
                        ? (sort.dir === 'asc' ? <ArrowUp size={11} className="text-brand-primary" /> : <ArrowDown size={11} className="text-brand-primary" />)
                        : <ArrowUpDown size={10} className="opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(r => (
              <tr key={rowKey(r)} className="border-b border-brand-card-border hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors">
                {columns.map(c => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.cellClass || 'text-brand-text-dim'}`}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 border-t border-brand-card-border bg-black/[0.02] dark:bg-white/[0.02]">
          <p className="text-xs text-brand-text-dim">
            Showing <span className="font-bold text-brand-text">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)}</span> of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} className="p-1.5 rounded-md border border-brand-card-border text-brand-text-dim hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs font-bold text-brand-text px-2 tabular-nums">{safePage + 1} / {pageCount}</span>
            <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="p-1.5 rounded-md border border-brand-card-border text-brand-text-dim hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function Pill({ children, tone = 'neutral' }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${TONES[tone] || TONES.neutral}`}>
      {children}
    </span>
  );
}

/**
 * Named filter presets, persisted per-report in localStorage. Reports carry a lot of
 * knobs; saving "Cash collections, preschool, this FY" once beats re-setting six
 * controls every month. Storage is per-browser and best-effort — a quota/private-mode
 * failure must not take the report down with it.
 */
function readViews(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // private mode, corrupted entry — start from an empty list
  }
}

export function SavedViews({ storageKey, current, onApply }) {
  const [views, setViews] = useState(() => readViews(storageKey));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);

  const persist = (next) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota or private mode — views just won't persist */ }
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    persist([...views.filter(v => v.name !== trimmed), { name: trimmed, filters: current }]);
    setName('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-card-border text-xs font-bold text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <Bookmark size={13} /> Saved views {views.length > 0 && <span className="text-brand-primary">({views.length})</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 bg-brand-card border border-brand-card-border rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {views.length === 0 && <p className="px-3 py-4 text-xs text-brand-text-dim text-center">No saved views yet.</p>}
            {views.map(v => (
              <div key={v.name} className="flex items-center gap-1 border-b border-brand-card-border last:border-0">
                <button
                  type="button" onClick={() => { onApply(v.filters); setOpen(false); }}
                  className="flex-1 px-3 py-2 text-left text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 truncate transition-colors"
                >
                  {v.name}
                </button>
                <button
                  type="button" onClick={() => persist(views.filter(x => x.name !== v.name))}
                  className="px-2 py-2 text-brand-text-dim hover:text-red-500 transition-colors" title={`Delete "${v.name}"`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1 p-2 border-t border-brand-card-border bg-black/[0.02] dark:bg-white/[0.02]">
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="Save current filters as…"
              className="flex-1 min-w-0 bg-brand-bg border border-brand-card-border rounded-md px-2 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
            />
            <button type="button" onClick={save} disabled={!name.trim()} className="px-2 rounded-md bg-brand-primary text-white disabled:opacity-40 transition-opacity" title="Save view">
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
