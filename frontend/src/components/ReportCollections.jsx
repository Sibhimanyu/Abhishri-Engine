import React, { useState, useMemo, useCallback } from 'react';
import { IndianRupee, Receipt, TrendingUp, Undo2, BadgePercent, Filter } from 'lucide-react';
import {
  resolveRange, previousRange, effectiveGranularity, timeSeries, groupBy, summarize,
  downloadCSV, GRANULARITY_ADVERB, INR, fmtDate, slugDate, colorAt, PAYMENT_METHODS, WINGS, ALL_CLASSES
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
  groupBy: 'method',
  methods: [],
  wings: [],
  grades: [],
  categories: [],
  recordedBy: [],
  minAmount: '',
  maxAmount: '',
  search: '',
  netOffVoids: true,
  hideVoidedPairs: false,
  includeConcessions: false
};

const GROUP_OPTIONS = [
  { id: 'method', label: 'Payment method' },
  { id: 'wing', label: 'Wing' },
  { id: 'grade', label: 'Class / Grade' },
  { id: 'category', label: 'Fee category' },
  { id: 'student', label: 'Student' },
  { id: 'recordedBy', label: 'Recorded by' },
  { id: 'period', label: 'Period' }
];

const WING_LABEL = { preschool: 'Preschool', tuition: 'Tuition', unassigned: 'Unassigned' };

/**
 * Collections report — every rupee that came IN, sliced by how it was paid, who paid it,
 * which wing it belongs to and who recorded it.
 *
 * Money semantics, applied consistently everywhere in this file:
 *   receipts      — type 'incoming', positive
 *   reversals     — type 'void', stored negative, so summing nets them off automatically
 *   concessions   — type 'discount', NEVER cash; excluded from collections by default and
 *                   surfaced as their own memo figure so the headline can't be inflated
 */
export default function ReportCollections({ data }) {
  const [f, setF] = useState(DEFAULTS);
  const [drill, setDrill] = useState(null);
  const set = (patch) => setF(prev => ({ ...prev, ...patch }));

  const range = useMemo(() => resolveRange(f.preset, f.custom), [f.preset, f.custom]);
  const prev = useMemo(() => previousRange(range, f.preset), [range, f.preset]);
  const grain = effectiveGranularity(f.granularity, range.start, range.end);

  // Facet options are seeded from the known vocabulary and unioned with whatever the data
  // actually contains, so a legacy or hand-entered value is still filterable.
  const facets = useMemo(() => {
    const methods = new Set(PAYMENT_METHODS);
    const categories = new Set();
    const recorders = new Set();
    const grades = new Set();
    data.income.forEach(r => {
      if (r.method) methods.add(r.method);
      if (r.category) categories.add(r.category);
      if (r.recordedBy) recorders.add(r.recordedBy);
      if (r.grade) grades.add(r.grade);
    });
    ALL_CLASSES.forEach(c => grades.add(c));
    return {
      methods: Array.from(methods).sort(),
      categories: Array.from(categories).sort(),
      recorders: Array.from(recorders).sort(),
      grades: Array.from(grades).sort()
    };
  }, [data.income]);

  /** All non-date filters. Kept separate so the comparison period gets the identical lens. */
  const matches = useMemo(() => {
    const min = f.minAmount === '' ? null : Number(f.minAmount);
    const max = f.maxAmount === '' ? null : Number(f.maxAmount);
    const q = f.search.trim().toLowerCase();

    return (r) => {
      if (r.txType === 'discount' && !f.includeConcessions) return false;
      if (f.hideVoidedPairs && (r.isVoided || r.txType === 'void')) return false;
      if (!f.netOffVoids && r.txType === 'void') return false;
      if (f.methods.length && !f.methods.includes(r.method)) return false;
      if (f.wings.length && !f.wings.includes(r.wing)) return false;
      if (f.grades.length && !f.grades.includes(r.grade)) return false;
      if (f.categories.length && !f.categories.includes(r.category)) return false;
      if (f.recordedBy.length && !f.recordedBy.includes(r.recordedBy)) return false;
      const abs = Math.abs(r.amount);
      if (min !== null && abs < min) return false;
      if (max !== null && abs > max) return false;
      if (q) {
        const hay = `${r.studentName} ${r.description} ${r.method} ${r.category} ${r.recordedBy} ${r.grade}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
  }, [f]);

  const inWindow = (r, w) => r.date >= w.start && r.date <= w.end;

  const rows = useMemo(() => data.income.filter(r => matches(r) && inWindow(r, range)), [data.income, matches, range]);
  const prevRows = useMemo(
    () => (f.compare ? data.income.filter(r => matches(r) && inWindow(r, prev)) : []),
    [data.income, matches, prev, f.compare]
  );

  /** Split a row set into the three money buckets the KPI strip reports on. */
  const split = useCallback((list) => {
    const receipts = list.filter(r => r.txType === 'incoming');
    const voids = list.filter(r => r.txType === 'void');
    const concessions = list.filter(r => r.txType === 'discount');
    const gross = summarize(receipts).total;
    const reversed = Math.abs(summarize(voids).total);
    return {
      receipts, voids, concessions,
      gross,
      reversed,
      net: gross - (f.netOffVoids ? reversed : 0),
      concessionTotal: summarize(concessions).total,
      count: receipts.length,
      students: new Set(receipts.map(r => r.studentId)).size,
      avg: receipts.length ? gross / receipts.length : 0,
      largest: receipts.reduce((m, r) => Math.max(m, r.amount), 0)
    };
  }, [f.netOffVoids]);

  const now = useMemo(() => split(rows), [rows, split]);
  const before = useMemo(() => (f.compare ? split(prevRows) : null), [prevRows, f.compare, split]);

  // The trend charts cash movement only — concessions are non-cash and would distort it.
  const cashRows = useMemo(() => rows.filter(r => r.txType !== 'discount'), [rows]);
  const series = useMemo(() => timeSeries(cashRows, range, grain), [cashRows, range, grain]);
  const compareSeries = useMemo(() => {
    if (!f.compare) return null;
    const prevCash = prevRows.filter(r => r.txType !== 'discount');
    const s = timeSeries(prevCash, prev, grain);
    // Align by index so bucket N of the previous period sits behind bucket N of this one.
    return series.map((_, i) => s[i] || { key: `pad-${i}`, label: '', value: 0, count: 0 });
  }, [f.compare, prevRows, prev, grain, series]);

  const groups = useMemo(() => {
    const src = cashRows;
    switch (f.groupBy) {
      case 'wing': return groupBy(src, r => r.wing, k => WING_LABEL[k] || k);
      case 'grade': return groupBy(src, r => r.grade || '—', k => (k === '—' ? 'No class set' : k));
      case 'category': return groupBy(src, r => r.category);
      case 'student': return groupBy(src, r => r.studentId || r.studentName, (k, r) => r.studentName);
      case 'recordedBy': return groupBy(src, r => r.recordedBy || '—', k => (k === '—' ? 'Unattributed' : k));
      case 'period': {
        const s = timeSeries(src, range, grain);
        return s.map(b => ({ key: b.key, label: b.label, total: b.value, count: b.count, rows: [] }))
          .filter(b => b.count > 0);
      }
      case 'method':
      default: return groupBy(src, r => r.method || 'Cash');
    }
  }, [cashRows, f.groupBy, range, grain]);

  const groupKeyOf = useCallback((r) => {
    switch (f.groupBy) {
      case 'wing': return r.wing;
      case 'grade': return r.grade || '—';
      case 'category': return r.category;
      case 'student': return r.studentId || r.studentName;
      case 'recordedBy': return r.recordedBy || '—';
      case 'period': return null;
      default: return r.method || 'Cash';
    }
  }, [f.groupBy]);

  const detailRows = useMemo(
    () => (drill && f.groupBy !== 'period' ? rows.filter(r => groupKeyOf(r) === drill) : rows),
    [rows, drill, f.groupBy, groupKeyOf]
  );

  const methodMix = useMemo(() => {
    const g = groupBy(cashRows.filter(r => r.amount > 0), r => r.method || 'Cash');
    return g.map((x, i) => ({ key: x.key, label: x.label, value: x.total, color: colorAt(i), count: x.count }));
  }, [cashRows]);

  const activeFilterCount =
    f.methods.length + f.wings.length + f.grades.length + f.categories.length + f.recordedBy.length +
    (f.minAmount !== '' ? 1 : 0) + (f.maxAmount !== '' ? 1 : 0) + (f.search ? 1 : 0) +
    (f.netOffVoids ? 0 : 1) + (f.hideVoidedPairs ? 1 : 0) + (f.includeConcessions ? 1 : 0);

  const handleExport = () => downloadCSV(
    `collections_${slugDate(range.start)}_to_${slugDate(range.end)}`,
    detailRows.map(r => ({
      Date: fmtDate(r.date),
      Student: r.studentName,
      Wing: WING_LABEL[r.wing] || r.wing,
      Class: r.grade || '',
      Method: r.method,
      Category: r.category,
      Type: r.txType === 'void' ? 'Reversal' : r.txType === 'discount' ? 'Concession' : 'Receipt',
      Description: r.description,
      'Recorded by': r.recordedBy,
      Amount: r.amount
    }))
  );

  const columns = [
    { key: 'date', header: 'Date', width: '110px', sortValue: r => r.date.getTime(), render: r => <span className="whitespace-nowrap">{fmtDate(r.date)}</span> },
    {
      key: 'studentName', header: 'Student', cellClass: 'text-brand-text',
      render: r => (
        <div className="min-w-[150px]">
          <div className="font-medium text-brand-text truncate max-w-[220px]">{r.studentName}</div>
          <div className="text-[11px] text-brand-text-dim truncate max-w-[220px]">
            {WING_LABEL[r.wing] || r.wing}{r.grade ? ` · ${r.grade}` : ''}
          </div>
        </div>
      )
    },
    { key: 'method', header: 'Method', width: '130px', render: r => <Pill tone={r.txType === 'void' ? 'red' : r.txType === 'discount' ? 'purple' : 'neutral'}>{r.txType === 'void' ? 'Reversal' : r.method}</Pill> },
    { key: 'category', header: 'Category', width: '140px', render: r => <span className="text-xs">{r.category}</span> },
    { key: 'description', header: 'Description', render: r => <span className="text-xs line-clamp-2 max-w-[280px] block">{r.description || '—'}</span> },
    { key: 'recordedBy', header: 'Recorded by', width: '160px', render: r => <span className="text-xs truncate max-w-[150px] block">{r.recordedBy || '—'}</span> },
    {
      key: 'amount', header: 'Amount', align: 'right', width: '120px',
      cellClass: 'font-bold tabular-nums',
      render: r => <span className={r.amount < 0 ? 'text-red-500' : r.txType === 'discount' ? 'text-purple-500' : 'text-green-600 dark:text-green-400'}>{INR(r.amount)}</span>
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
        savedKey="abhishri.reports.collections.views"
        savedFilters={f} onApplySaved={(v) => { setF({ ...DEFAULTS, ...v }); setDrill(null); }}
        resultLabel={`${now.count} receipt${now.count === 1 ? '' : 's'} · ${INR(now.net)} collected`}
      >
        <div className="flex flex-wrap gap-3">
          <MultiSelect label="Payment method" options={facets.methods} selected={f.methods} onChange={(v) => set({ methods: v })} allLabel="All methods" />
          <MultiSelect label="Wing" options={[...WINGS, { id: 'unassigned', label: 'Unassigned' }]} selected={f.wings} onChange={(v) => set({ wings: v })} allLabel="All wings" width="w-44" />
          <MultiSelect label="Class / Grade" options={facets.grades} selected={f.grades} onChange={(v) => set({ grades: v })} allLabel="All classes" width="w-44" />
          <MultiSelect label="Fee category" options={facets.categories} selected={f.categories} onChange={(v) => set({ categories: v })} allLabel="All categories" />
          <MultiSelect label="Recorded by" options={facets.recorders} selected={f.recordedBy} onChange={(v) => set({ recordedBy: v })} allLabel="Anyone" />
          <Field label="Min amount ₹"><TextInput type="number" value={f.minAmount} onChange={(v) => set({ minAmount: v })} placeholder="0" className="w-28" /></Field>
          <Field label="Max amount ₹"><TextInput type="number" value={f.maxAmount} onChange={(v) => set({ maxAmount: v })} placeholder="Any" className="w-28" /></Field>
          <Field label="Search" className="flex-1 min-w-[200px]">
            <TextInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Student, note, method…" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-brand-card-border">
          <Toggle
            checked={f.netOffVoids} onChange={(v) => set({ netOffVoids: v })}
            label="Net off reversals" hint="Subtract voided receipts from the collected total."
          />
          <Toggle
            checked={f.hideVoidedPairs} onChange={(v) => set({ hideVoidedPairs: v })}
            label="Exclude voided receipts" hint="Drop both the original receipt and its reversal from the report."
          />
          <Toggle
            checked={f.includeConcessions} onChange={(v) => set({ includeConcessions: v })}
            label="Include fee concessions" hint="Concessions are non-cash; they never count towards collections."
          />
        </div>
      </ReportToolbar>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Collected (net)" value={INR(now.net)} icon={IndianRupee} tone="green"
          sub={f.netOffVoids && now.reversed ? `${INR(now.gross)} gross` : null}
          delta={before && <Delta current={now.net} previous={before.net} />}
        />
        <StatCard
          label="Receipts" value={now.count.toLocaleString('en-IN')} icon={Receipt} tone="primary"
          sub={`${now.students} student${now.students === 1 ? '' : 's'}`}
          delta={before && <Delta current={now.count} previous={before.count} />}
        />
        <StatCard
          label="Average receipt" value={INR(now.avg)} icon={TrendingUp} tone="blue"
          sub={now.largest ? `Largest ${INR(now.largest)}` : null}
          delta={before && <Delta current={now.avg} previous={before.avg} />}
        />
        <StatCard
          label={now.reversed ? 'Reversals' : 'Concessions'}
          value={INR(now.reversed || now.concessionTotal)}
          icon={now.reversed ? Undo2 : BadgePercent}
          tone={now.reversed ? 'red' : 'purple'}
          sub={now.reversed && now.concessionTotal ? `+ ${INR(now.concessionTotal)} concessions` : now.reversed ? `${now.voids.length} voided` : 'Non-cash, excluded above'}
          delta={before && <Delta current={now.reversed || now.concessionTotal} previous={before.reversed || before.concessionTotal} invert />}
        />
      </div>

      {/* Trend */}
      <SectionCard
        title="Collection trend"
        subtitle={`${GRANULARITY_ADVERB[grain]} totals${f.compare ? ' · grey bars are the previous period' : ''}`}
      >
        <TrendChart series={series} compare={compareSeries} color="#10B981" />
      </SectionCard>

      {/* Breakdown + mix */}
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

        <SectionCard title="Payment mix" subtitle="Share of gross receipts by method">
          {methodMix.length === 0 ? (
            <div className="py-12 text-center text-sm text-brand-text-dim">No receipts in range</div>
          ) : (
            <div className="p-5 flex flex-col items-center gap-5">
              <DonutChart slices={methodMix} total={methodMix.reduce((a, s) => a + s.value, 0)} />
              <div className="w-full space-y-2">
                {methodMix.map(s => (
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

      {/* Detail */}
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
          emptyTitle="No collections match these filters"
          emptyHint="Widen the date range, or clear a filter or two."
        />
      </SectionCard>
    </div>
  );
}
