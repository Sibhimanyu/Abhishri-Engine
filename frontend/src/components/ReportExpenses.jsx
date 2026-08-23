import React, { useState, useMemo, useCallback } from 'react';
import { IndianRupee, Receipt, TrendingDown, Wallet, FileWarning, ExternalLink, Filter } from 'lucide-react';
import {
  resolveRange, previousRange, effectiveGranularity, timeSeries, groupBy, summarize,
  downloadCSV, GRANULARITY_ADVERB, INR, fmtDate, slugDate, colorAt, EXPENSE_CATEGORIES
} from '../utils/reportUtils';
import ReportToolbar from './ReportToolbar';
import {
  SectionCard, StatCard, Delta, TrendChart, BreakdownTable, DataTable, DonutChart,
  MultiSelect, Toggle, Field, Select, TextInput, Pill
} from './ReportsUI';

const DEFAULTS = {
  preset: 'this_month',
  custom: { from: '', to: '' },
  compare: true,
  granularity: 'auto',
  groupBy: 'category',
  categories: [],
  sources: [],
  staffIds: [],
  recordedBy: [],
  minAmount: '',
  maxAmount: '',
  search: '',
  billStatus: 'any',
  includeFunding: false
};

const GROUP_OPTIONS = [
  { id: 'category', label: 'Category' },
  { id: 'source', label: 'Payment source' },
  { id: 'staff', label: 'Staff member' },
  { id: 'recordedBy', label: 'Recorded by' },
  { id: 'period', label: 'Period' }
];

const SOURCE_OPTIONS = [
  { id: 'office', label: 'Office / Petty cash' },
  { id: 'staff_wallet', label: 'Staff wallet' }
];

const BILL_OPTIONS = [
  { id: 'any', label: 'Any' },
  { id: 'with', label: 'Bill attached' },
  { id: 'without', label: 'Missing bill' }
];

const SOURCE_LABEL = { office: 'Office', staff_wallet: 'Staff wallet' };

/**
 * Expenses report — money OUT, split by category, source and the staff member it sits against.
 *
 * Wallet "funding" entries are deliberately not spend: they move cash from the office into
 * a staff member's wallet, and the real outflow is recorded again when that staff member
 * spends it. Counting both would double the outgoings, so funding is excluded from every
 * spend figure by default and offered as its own memo line.
 */
export default function ReportExpenses({ data }) {
  const [f, setF] = useState(DEFAULTS);
  const [drill, setDrill] = useState(null);
  const set = (patch) => setF(prev => ({ ...prev, ...patch }));

  const range = useMemo(() => resolveRange(f.preset, f.custom), [f.preset, f.custom]);
  const prev = useMemo(() => previousRange(range, f.preset), [range, f.preset]);
  const grain = effectiveGranularity(f.granularity, range.start, range.end);

  const facets = useMemo(() => {
    const categories = new Set(EXPENSE_CATEGORIES);
    const recorders = new Set();
    const staffSeen = new Map();
    data.expenses.forEach(r => {
      if (r.category) categories.add(r.category);
      if (r.recordedBy) recorders.add(r.recordedBy);
      const key = r.staffId || r.staffEmail;
      if (key && !staffSeen.has(key)) staffSeen.set(key, r.staffName);
    });
    data.staff.forEach(s => { if (!staffSeen.has(s.id)) staffSeen.set(s.id, s.name); });
    return {
      categories: Array.from(categories).sort(),
      recorders: Array.from(recorders).sort(),
      staff: Array.from(staffSeen.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
    };
  }, [data.expenses, data.staff]);

  const matches = useMemo(() => {
    const min = f.minAmount === '' ? null : Number(f.minAmount);
    const max = f.maxAmount === '' ? null : Number(f.maxAmount);
    const q = f.search.trim().toLowerCase();

    return (r) => {
      if (r.txType === 'funding' && !f.includeFunding) return false;
      if (f.categories.length && !f.categories.includes(r.category)) return false;
      if (f.sources.length && !f.sources.includes(r.source)) return false;
      if (f.staffIds.length && !f.staffIds.includes(r.staffId) && !f.staffIds.includes(r.staffEmail)) return false;
      if (f.recordedBy.length && !f.recordedBy.includes(r.recordedBy)) return false;
      if (f.billStatus === 'with' && !r.hasBill) return false;
      if (f.billStatus === 'without' && r.hasBill) return false;
      if (min !== null && r.amount < min) return false;
      if (max !== null && r.amount > max) return false;
      if (q) {
        const hay = `${r.category} ${r.description} ${r.staffName} ${r.recordedBy} ${SOURCE_LABEL[r.source]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
  }, [f]);

  const inWindow = (r, w) => r.date >= w.start && r.date <= w.end;

  const rows = useMemo(() => data.expenses.filter(r => matches(r) && inWindow(r, range)), [data.expenses, matches, range]);
  const prevRows = useMemo(
    () => (f.compare ? data.expenses.filter(r => matches(r) && inWindow(r, prev)) : []),
    [data.expenses, matches, prev, f.compare]
  );

  const split = (list) => {
    const spend = list.filter(r => r.txType !== 'funding');
    const funding = list.filter(r => r.txType === 'funding');
    const s = summarize(spend);
    return {
      spend, funding,
      total: s.total,
      count: s.count,
      avg: s.avg,
      largest: s.max,
      fundingTotal: summarize(funding).total,
      wallet: summarize(spend.filter(r => r.source === 'staff_wallet')).total,
      office: summarize(spend.filter(r => r.source === 'office')).total,
      missingBills: spend.filter(r => !r.hasBill).length,
      missingBillValue: summarize(spend.filter(r => !r.hasBill)).total
    };
  };

  const now = useMemo(() => split(rows), [rows]);
  const before = useMemo(() => (f.compare ? split(prevRows) : null), [prevRows, f.compare]);

  const spendRows = useMemo(() => rows.filter(r => r.txType !== 'funding'), [rows]);
  const series = useMemo(() => timeSeries(spendRows, range, grain), [spendRows, range, grain]);
  const compareSeries = useMemo(() => {
    if (!f.compare) return null;
    const s = timeSeries(prevRows.filter(r => r.txType !== 'funding'), prev, grain);
    return series.map((_, i) => s[i] || { key: `pad-${i}`, label: '', value: 0, count: 0 });
  }, [f.compare, prevRows, prev, grain, series]);

  const groups = useMemo(() => {
    switch (f.groupBy) {
      case 'source': return groupBy(spendRows, r => r.source, k => SOURCE_LABEL[k] || k);
      case 'staff': return groupBy(spendRows, r => r.staffId || r.staffEmail || '—', (k, r) => r.staffName || 'Unattributed');
      case 'recordedBy': return groupBy(spendRows, r => r.recordedBy || '—', k => (k === '—' ? 'Unattributed' : k));
      case 'period': {
        const s = timeSeries(spendRows, range, grain);
        return s.map(b => ({ key: b.key, label: b.label, total: b.value, count: b.count, rows: [] })).filter(b => b.count > 0);
      }
      case 'category':
      default: return groupBy(spendRows, r => r.category);
    }
  }, [spendRows, f.groupBy, range, grain]);

  const groupKeyOf = useCallback((r) => {
    switch (f.groupBy) {
      case 'source': return r.source;
      case 'staff': return r.staffId || r.staffEmail || '—';
      case 'recordedBy': return r.recordedBy || '—';
      case 'period': return null;
      default: return r.category;
    }
  }, [f.groupBy]);

  const detailRows = useMemo(
    () => (drill && f.groupBy !== 'period' ? rows.filter(r => groupKeyOf(r) === drill) : rows),
    [rows, drill, f.groupBy, groupKeyOf]
  );

  const categoryMix = useMemo(() => {
    const g = groupBy(spendRows, r => r.category);
    return g.map((x, i) => ({ key: x.key, label: x.label, value: x.total, color: colorAt(i), count: x.count }));
  }, [spendRows]);

  const activeFilterCount =
    f.categories.length + f.sources.length + f.staffIds.length + f.recordedBy.length +
    (f.minAmount !== '' ? 1 : 0) + (f.maxAmount !== '' ? 1 : 0) + (f.search ? 1 : 0) +
    (f.billStatus !== 'any' ? 1 : 0) + (f.includeFunding ? 1 : 0);

  const handleExport = () => downloadCSV(
    `expenses_${slugDate(range.start)}_to_${slugDate(range.end)}`,
    detailRows.map(r => ({
      Date: fmtDate(r.date),
      Category: r.category,
      Source: SOURCE_LABEL[r.source] || r.source,
      Type: r.txType === 'funding' ? 'Wallet funding' : 'Spend',
      Staff: r.source === 'staff_wallet' ? r.staffName : '',
      Details: r.description,
      'Recorded by': r.recordedBy,
      'Bill attached': r.hasBill ? 'Yes' : 'No',
      Amount: r.amount
    }))
  );

  const columns = [
    { key: 'date', header: 'Date', width: '110px', sortValue: r => r.date.getTime(), render: r => <span className="whitespace-nowrap">{fmtDate(r.date)}</span> },
    {
      key: 'category', header: 'Category', cellClass: 'text-brand-text',
      render: r => (
        <div className="min-w-[150px]">
          <div className="font-medium text-brand-text">{r.category}</div>
          <div className="text-[11px] text-brand-text-dim truncate max-w-[240px]">{r.description || '—'}</div>
        </div>
      )
    },
    {
      key: 'source', header: 'Source', width: '150px',
      render: r => (
        <div className="space-y-1">
          <Pill tone={r.txType === 'funding' ? 'blue' : r.source === 'staff_wallet' ? 'amber' : 'neutral'}>
            {r.txType === 'funding' ? 'Wallet funding' : SOURCE_LABEL[r.source]}
          </Pill>
          {r.source === 'staff_wallet' && <div className="text-[11px] text-brand-text-dim truncate max-w-[140px]">{r.staffName}</div>}
        </div>
      )
    },
    { key: 'recordedBy', header: 'Recorded by', width: '160px', render: r => <span className="text-xs truncate max-w-[150px] block">{r.recordedBy || '—'}</span> },
    {
      key: 'hasBill', header: 'Bill', width: '80px', sortValue: r => (r.hasBill ? 1 : 0),
      render: r => r.hasBill
        ? <a href={r.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-bold hover:underline"><ExternalLink size={12} /> View</a>
        : <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">Missing</span>
    },
    {
      key: 'amount', header: 'Amount', align: 'right', width: '120px', cellClass: 'font-bold tabular-nums',
      render: r => <span className={r.txType === 'funding' ? 'text-blue-500' : 'text-brand-text'}>{r.txType === 'funding' ? '' : '-'}{INR(r.amount)}</span>
    }
  ];

  return (
    <div className="space-y-5">
      <ReportToolbar
        preset={f.preset} onPreset={(v) => set({ preset: v })}
        custom={f.custom} onCustom={(v) => set({ custom: v })}
        range={range}
        compare={f.compare} onCompare={(v) => set({ compare: v })}
        granularity={f.granularity} onGranularity={(v) => set({ granularity: v })}
        resolvedGranularity={grain}
        onExport={handleExport} exportDisabled={!detailRows.length}
        onReset={() => { setF(DEFAULTS); setDrill(null); }}
        activeFilterCount={activeFilterCount}
        savedKey="abhishri.reports.expenses.views"
        savedFilters={f} onApplySaved={(v) => { setF({ ...DEFAULTS, ...v }); setDrill(null); }}
        resultLabel={`${now.count} entr${now.count === 1 ? 'y' : 'ies'} · ${INR(now.total)} spent`}
      >
        <div className="flex flex-wrap gap-3">
          <MultiSelect label="Category" options={facets.categories} selected={f.categories} onChange={(v) => set({ categories: v })} allLabel="All categories" />
          <MultiSelect label="Payment source" options={SOURCE_OPTIONS} selected={f.sources} onChange={(v) => set({ sources: v })} allLabel="All sources" width="w-48" />
          <MultiSelect label="Staff member" options={facets.staff} selected={f.staffIds} onChange={(v) => set({ staffIds: v })} allLabel="All staff" />
          <MultiSelect label="Recorded by" options={facets.recorders} selected={f.recordedBy} onChange={(v) => set({ recordedBy: v })} allLabel="Anyone" />
          <Field label="Bill">
            <Select value={f.billStatus} onChange={(v) => set({ billStatus: v })} options={BILL_OPTIONS} className="w-36" />
          </Field>
          <Field label="Min amount ₹"><TextInput type="number" value={f.minAmount} onChange={(v) => set({ minAmount: v })} placeholder="0" className="w-28" /></Field>
          <Field label="Max amount ₹"><TextInput type="number" value={f.maxAmount} onChange={(v) => set({ maxAmount: v })} placeholder="Any" className="w-28" /></Field>
          <Field label="Search" className="flex-1 min-w-[200px]">
            <TextInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Details, staff, category…" />
          </Field>
        </div>
        <div className="mt-5 pt-4 border-t border-brand-card-border">
          <Toggle
            checked={f.includeFunding} onChange={(v) => set({ includeFunding: v })}
            label="Show wallet funding entries"
            hint="Funding moves cash from the office into a staff wallet. It is an internal transfer and never counts as spend."
          />
        </div>
      </ReportToolbar>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total spend" value={INR(now.total)} icon={IndianRupee} tone="red"
          sub={`${INR(now.office)} office · ${INR(now.wallet)} wallet`}
          delta={before && <Delta current={now.total} previous={before.total} invert />}
        />
        <StatCard
          label="Entries" value={now.count.toLocaleString('en-IN')} icon={Receipt} tone="primary"
          sub={now.largest ? `Largest ${INR(now.largest)}` : null}
          delta={before && <Delta current={now.count} previous={before.count} invert />}
        />
        <StatCard
          label="Average entry" value={INR(now.avg)} icon={TrendingDown} tone="amber"
          delta={before && <Delta current={now.avg} previous={before.avg} invert />}
        />
        <StatCard
          label="Missing bills" value={now.missingBills.toLocaleString('en-IN')} icon={FileWarning}
          tone={now.missingBills ? 'red' : 'green'}
          sub={now.missingBills ? `${INR(now.missingBillValue)} unsupported` : 'Every entry has a bill'}
        />
      </div>

      {f.includeFunding && now.fundingTotal > 0 && (
        <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3">
          <Wallet size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-bold">{INR(now.fundingTotal)}</span> of wallet funding is listed below for reference.
            It is an internal transfer and is excluded from every spend figure above.
          </p>
        </div>
      )}

      <SectionCard
        title="Spending trend"
        subtitle={`${GRANULARITY_ADVERB[grain]} totals${f.compare ? ' · grey bars are the previous period' : ''}`}
      >
        <TrendChart series={series} compare={compareSeries} color="#EF4444" />
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <SectionCard
          className="xl:col-span-2"
          title="Breakdown"
          subtitle={drill ? 'Click the highlighted row again to clear the drill-down.' : 'Click any row to filter the entries below.'}
          actions={
            <Field label="Split by">
              <Select value={f.groupBy} onChange={(v) => { set({ groupBy: v }); setDrill(null); }} options={GROUP_OPTIONS} className="w-44" />
            </Field>
          }
        >
          <BreakdownTable
            groups={groups}
            total={groups.reduce((a, g) => a + g.total, 0)}
            labelHeader={GROUP_OPTIONS.find(g => g.id === f.groupBy)?.label || 'Group'}
            onRowClick={f.groupBy === 'period' ? undefined : setDrill}
            activeKey={drill}
          />
        </SectionCard>

        <SectionCard title="Category mix" subtitle="Share of total spend">
          {categoryMix.length === 0 ? (
            <div className="py-12 text-center text-sm text-brand-text-dim">No spend in range</div>
          ) : (
            <div className="p-5 flex flex-col items-center gap-5">
              <DonutChart slices={categoryMix} total={categoryMix.reduce((a, s) => a + s.value, 0)} />
              <div className="w-full space-y-2">
                {categoryMix.slice(0, 8).map(s => (
                  <div key={s.key} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-brand-text truncate flex-1">{s.label}</span>
                    <span className="text-brand-text-dim text-xs tabular-nums">{s.count}</span>
                    <span className="font-bold text-brand-text tabular-nums">{INR(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Entries"
        subtitle={drill ? `Filtered to “${groups.find(g => g.key === drill)?.label ?? drill}”` : `${detailRows.length} entr${detailRows.length === 1 ? 'y' : 'ies'} in range`}
        actions={drill ? (
          <button onClick={() => setDrill(null)} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline">
            <Filter size={12} /> Clear drill-down
          </button>
        ) : null}
      >
        <DataTable
          columns={columns}
          rows={detailRows}
          emptyTitle="No expenses match these filters"
          emptyHint="Widen the date range, or clear a filter or two."
        />
      </SectionCard>
    </div>
  );
}
