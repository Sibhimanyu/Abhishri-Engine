import React, { useState, useMemo, useCallback } from 'react';
import { ArrowDownRight, ArrowUpRight, Scale, Percent, Info } from 'lucide-react';
import {
  resolveRange, previousRange, effectiveGranularity, buildBuckets, bucketOf, summarize,
  downloadCSV, GRANULARITY_ADVERB, INR, fmtPct, pct, slugDate, PAYMENT_METHODS, EXPENSE_CATEGORIES, WINGS
} from '../utils/reportUtils';
import ReportToolbar from './ReportToolbar';
import {
  SectionCard, StatCard, Delta, DualTrendChart, MultiSelect, Toggle, Field, TextInput, EmptyState
} from './ReportsUI';

const DEFAULTS = {
  preset: 'this_fy',
  custom: { from: '', to: '' },
  compare: true,
  granularity: 'auto',
  methods: [],
  wings: [],
  categories: [],
  sources: [],
  search: '',
  netOffVoids: true,
  includeFunding: false
};

const SOURCE_OPTIONS = [
  { id: 'office', label: 'Office / Petty cash' },
  { id: 'staff_wallet', label: 'Staff wallet' }
];

/**
 * Cash flow — collections against expenses over the same timeline, bucket by bucket.
 *
 * Both sides are filtered independently but bucketed onto ONE shared timeline, so the
 * net figure per period is always in-out for the identical window. Concessions are not
 * cash and wallet funding is an internal transfer; neither is ever counted here.
 */
export default function ReportCashFlow({ data }) {
  const [f, setF] = useState(DEFAULTS);
  const set = (patch) => setF(prev => ({ ...prev, ...patch }));

  const range = useMemo(() => resolveRange(f.preset, f.custom), [f.preset, f.custom]);
  const prev = useMemo(() => previousRange(range, f.preset), [range, f.preset]);
  const grain = effectiveGranularity(f.granularity, range.start, range.end);

  const facets = useMemo(() => {
    const methods = new Set(PAYMENT_METHODS);
    const categories = new Set(EXPENSE_CATEGORIES);
    data.income.forEach(r => r.method && methods.add(r.method));
    data.expenses.forEach(r => r.category && categories.add(r.category));
    return { methods: Array.from(methods).sort(), categories: Array.from(categories).sort() };
  }, [data.income, data.expenses]);

  const q = f.search.trim().toLowerCase();

  const incomeMatches = useMemo(() => (r) => {
    if (r.txType === 'discount') return false;               // non-cash, never a cash inflow
    if (!f.netOffVoids && r.txType === 'void') return false;
    if (f.methods.length && !f.methods.includes(r.method)) return false;
    if (f.wings.length && !f.wings.includes(r.wing)) return false;
    if (q && !`${r.studentName} ${r.description} ${r.method}`.toLowerCase().includes(q)) return false;
    return true;
  }, [f.methods, f.wings, f.netOffVoids, q]);

  const expenseMatches = useMemo(() => (r) => {
    if (r.txType === 'funding' && !f.includeFunding) return false;
    if (f.categories.length && !f.categories.includes(r.category)) return false;
    if (f.sources.length && !f.sources.includes(r.source)) return false;
    if (q && !`${r.category} ${r.description} ${r.staffName}`.toLowerCase().includes(q)) return false;
    return true;
  }, [f.categories, f.sources, f.includeFunding, q]);

  const pick = useCallback((window) => ({
    income: data.income.filter(r => incomeMatches(r) && r.date >= window.start && r.date <= window.end),
    expenses: data.expenses.filter(r => expenseMatches(r) && r.date >= window.start && r.date <= window.end)
  }), [data.income, data.expenses, incomeMatches, expenseMatches]);

  const current = useMemo(() => pick(range), [pick, range]);
  const previous = useMemo(() => (f.compare ? pick(prev) : null), [pick, prev, f.compare]);

  const totalsOf = (bundle) => {
    const inTotal = summarize(bundle.income).total;              // voids are stored negative
    const outTotal = summarize(bundle.expenses).total;
    return {
      inTotal,
      outTotal,
      net: inTotal - outTotal,
      margin: pct(inTotal - outTotal, inTotal),
      inCount: bundle.income.length,
      outCount: bundle.expenses.length
    };
  };

  const now = totalsOf(current);
  const before = previous ? totalsOf(previous) : null;

  /** One row per bucket, with a running balance that only makes sense within this range. */
  const periods = useMemo(() => {
    const buckets = buildBuckets(range.start, range.end, grain);
    const inMap = new Map(buckets.map(b => [b.key, 0]));
    const outMap = new Map(buckets.map(b => [b.key, 0]));
    current.income.forEach(r => {
      const k = bucketOf(r.date, grain).key;
      if (inMap.has(k)) inMap.set(k, inMap.get(k) + r.amount);
    });
    current.expenses.forEach(r => {
      const k = bucketOf(r.date, grain).key;
      if (outMap.has(k)) outMap.set(k, outMap.get(k) + r.amount);
    });
    // Running balance is a prefix sum over the bucket nets, accumulated with reduce so
    // nothing is mutated while the rows are being produced.
    return buckets.reduce((acc, b) => {
      const income = inMap.get(b.key);
      const expense = outMap.get(b.key);
      const net = income - expense;
      const running = (acc.length ? acc[acc.length - 1].running : 0) + net;
      acc.push({ ...b, income, expense, net, running, margin: pct(net, income) });
      return acc;
    }, []);
  }, [current, range, grain]);

  const activePeriods = periods.filter(p => p.income || p.expense);
  const best = activePeriods.reduce((m, p) => (!m || p.net > m.net ? p : m), null);
  const worst = activePeriods.reduce((m, p) => (!m || p.net < m.net ? p : m), null);

  const activeFilterCount =
    f.methods.length + f.wings.length + f.categories.length + f.sources.length +
    (f.search ? 1 : 0) + (f.netOffVoids ? 0 : 1) + (f.includeFunding ? 1 : 0);

  const handleExport = () => downloadCSV(
    `cash_flow_${slugDate(range.start)}_to_${slugDate(range.end)}`,
    periods.map(p => ({
      Period: p.label,
      'Money in': p.income,
      'Money out': p.expense,
      Net: p.net,
      'Net margin %': p.income ? Number(p.margin.toFixed(2)) : '',
      'Running net': p.running
    }))
  );

  const partial = !data.canViewIncome || !data.canViewExpenses;

  return (
    <div className="space-y-5">
      <ReportToolbar
        preset={f.preset} onPreset={(v) => set({ preset: v })}
        custom={f.custom} onCustom={(v) => set({ custom: v })}
        range={range}
        compare={f.compare} onCompare={(v) => set({ compare: v })}
        granularity={f.granularity} onGranularity={(v) => set({ granularity: v })}
        resolvedGranularity={grain}
        onExport={handleExport} exportDisabled={!periods.length}
        onReset={() => setF(DEFAULTS)}
        activeFilterCount={activeFilterCount}
        savedKey="abhishri.reports.cashflow.views"
        savedFilters={f} onApplySaved={(v) => setF({ ...DEFAULTS, ...v })}
        resultLabel={`Net ${INR(now.net)}`}
      >
        <div className="flex flex-wrap gap-3">
          <MultiSelect label="Income · method" options={facets.methods} selected={f.methods} onChange={(v) => set({ methods: v })} allLabel="All methods" />
          <MultiSelect label="Income · wing" options={[...WINGS, { id: 'unassigned', label: 'Unassigned' }]} selected={f.wings} onChange={(v) => set({ wings: v })} allLabel="All wings" width="w-44" />
          <MultiSelect label="Expense · category" options={facets.categories} selected={f.categories} onChange={(v) => set({ categories: v })} allLabel="All categories" />
          <MultiSelect label="Expense · source" options={SOURCE_OPTIONS} selected={f.sources} onChange={(v) => set({ sources: v })} allLabel="All sources" width="w-48" />
          <Field label="Search" className="flex-1 min-w-[200px]">
            <TextInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Applies to both sides…" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-brand-card-border">
          <Toggle checked={f.netOffVoids} onChange={(v) => set({ netOffVoids: v })} label="Net off reversals" hint="Subtract voided receipts from money in." />
          <Toggle checked={f.includeFunding} onChange={(v) => set({ includeFunding: v })} label="Count wallet funding as outflow" hint="Off by default — funding only moves cash into a staff wallet, it does not leave the school." />
        </div>
      </ReportToolbar>

      {partial && (
        <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl px-4 py-3">
          <Info size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            You can only see the <span className="font-bold">{data.canViewIncome ? 'income' : 'expense'}</span> side of the books,
            so the net figures below are incomplete. Full cash flow needs both fee-ledger visibility and the
            &ldquo;all expenses&rdquo; permission.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Money in" value={INR(now.inTotal)} icon={ArrowDownRight} tone="green"
          sub={`${now.inCount} receipt${now.inCount === 1 ? '' : 's'}`}
          delta={before && <Delta current={now.inTotal} previous={before.inTotal} />}
        />
        <StatCard
          label="Money out" value={INR(now.outTotal)} icon={ArrowUpRight} tone="red"
          sub={`${now.outCount} entr${now.outCount === 1 ? 'y' : 'ies'}`}
          delta={before && <Delta current={now.outTotal} previous={before.outTotal} invert />}
        />
        <StatCard
          label="Net position" value={INR(now.net)} icon={Scale}
          tone={now.net >= 0 ? 'green' : 'red'}
          sub={now.net >= 0 ? 'Surplus for the period' : 'Deficit for the period'}
          delta={before && <Delta current={now.net} previous={before.net} />}
        />
        <StatCard
          label="Net margin" value={now.inTotal ? fmtPct(now.margin) : '—'} icon={Percent}
          tone={now.margin >= 0 ? 'blue' : 'red'}
          sub={now.inTotal ? `${INR(now.outTotal)} spent per ${INR(now.inTotal)} earned` : 'No income in range'}
          delta={before && before.inTotal ? <Delta current={now.margin} previous={before.margin} suffix="pts vs prev." /> : null}
        />
      </div>

      <SectionCard
        title="Money in vs money out"
        subtitle={`${GRANULARITY_ADVERB[grain]} totals across ${periods.length} period${periods.length === 1 ? '' : 's'}`}
      >
        <DualTrendChart series={periods} />
      </SectionCard>

      {(best || worst) && activePeriods.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-brand-card border border-brand-card-border rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Strongest period</p>
              <p className="font-black text-brand-text mt-1">{best.label}</p>
            </div>
            <p className="text-lg font-black text-green-600 dark:text-green-400 tabular-nums">{INR(best.net)}</p>
          </div>
          <div className="bg-brand-card border border-brand-card-border rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Weakest period</p>
              <p className="font-black text-brand-text mt-1">{worst.label}</p>
            </div>
            <p className={`text-lg font-black tabular-nums ${worst.net < 0 ? 'text-red-500' : 'text-brand-text'}`}>{INR(worst.net)}</p>
          </div>
        </div>
      )}

      <SectionCard title="Period ledger" subtitle="Running net is cumulative within the selected range only">
        {periods.length === 0 ? (
          <EmptyState title="No periods in range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider bg-brand-bg text-brand-text-dim border-b border-brand-card-border">
                <tr>
                  <th className="px-4 md:px-6 py-3 text-left font-bold">Period</th>
                  <th className="px-4 py-3 text-right font-bold">Money in</th>
                  <th className="px-4 py-3 text-right font-bold">Money out</th>
                  <th className="px-4 py-3 text-right font-bold">Net</th>
                  <th className="px-4 py-3 text-right font-bold">Margin</th>
                  <th className="px-4 md:px-6 py-3 text-right font-bold">Running net</th>
                </tr>
              </thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.key} className={`border-b border-brand-card-border transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03] ${!p.income && !p.expense ? 'opacity-50' : ''}`}>
                    <td className="px-4 md:px-6 py-3 font-medium text-brand-text whitespace-nowrap">{p.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400 font-medium">{p.income ? INR(p.income) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-500 font-medium">{p.expense ? INR(p.expense) : '—'}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${p.net < 0 ? 'text-red-500' : 'text-brand-text'}`}>{p.income || p.expense ? INR(p.net) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-brand-text-dim text-xs">{p.income ? fmtPct(p.margin) : '—'}</td>
                    <td className={`px-4 md:px-6 py-3 text-right tabular-nums font-bold ${p.running < 0 ? 'text-red-500' : 'text-brand-text'}`}>{INR(p.running)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-brand-bg border-t-2 border-brand-card-border font-black text-brand-text">
                  <td className="px-4 md:px-6 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-600 dark:text-green-400">{INR(now.inTotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-500">{INR(now.outTotal)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${now.net < 0 ? 'text-red-500' : ''}`}>{INR(now.net)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">{now.inTotal ? fmtPct(now.margin) : '—'}</td>
                  <td className="px-4 md:px-6 py-3 text-right tabular-nums">{INR(now.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
