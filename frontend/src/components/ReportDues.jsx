import React, { useState, useMemo, useCallback } from 'react';
import { AlertCircle, Users, PiggyBank, CalendarClock, BadgePercent, Filter } from 'lucide-react';
import {
  resolveRange, groupBy, downloadCSV, INR, fmtDate, slugDate, WINGS, ALL_CLASSES
} from '../utils/reportUtils';
import ReportToolbar from './ReportToolbar';
import {
  SectionCard, StatCard, BreakdownTable, DataTable, MultiSelect, Toggle,
  Field, Select, TextInput, Pill
} from './ReportsUI';

const DEFAULTS = {
  preset: 'this_month',
  custom: { from: '', to: '' },
  groupBy: 'wing',
  wings: [],
  grades: [],
  statuses: ['due'],
  minDue: '',
  search: '',
  agingBucket: 'any',
  onlyWithDues: true,
  includeUnconfigured: false
};

const GROUP_OPTIONS = [
  { id: 'wing', label: 'Wing' },
  { id: 'grade', label: 'Class / Grade' },
  { id: 'aging', label: 'Days since last payment' },
  { id: 'status', label: 'Status' }
];

const STATUS_OPTIONS = [
  { id: 'due', label: 'Has dues' },
  { id: 'clear', label: 'Clear' },
  { id: 'ahead', label: 'Paid ahead' },
  { id: 'unconfigured', label: 'Fee plan not set' }
];

const STATUS_TONE = { due: 'red', clear: 'green', ahead: 'blue', unconfigured: 'neutral' };
const STATUS_LABEL = { due: 'Due', clear: 'Clear', ahead: 'Ahead', unconfigured: 'No plan' };
const WING_LABEL = { preschool: 'Preschool', tuition: 'Tuition', unassigned: 'Unassigned' };

/** Receivables ageing bands, oldest-payment-first. `never` covers students who never paid. */
const AGE_BANDS = [
  { id: '0-30', label: '0–30 days', min: 0, max: 30 },
  { id: '31-60', label: '31–60 days', min: 31, max: 60 },
  { id: '61-90', label: '61–90 days', min: 61, max: 90 },
  { id: '90+', label: 'Over 90 days', min: 91, max: Infinity },
  { id: 'never', label: 'Never paid', min: null, max: null }
];

const bandOf = (days) => (days === null ? 'never' : AGE_BANDS.find(b => b.min !== null && days >= b.min && days <= b.max)?.id || '90+');

/**
 * Outstanding dues — a point-in-time receivables snapshot, not a period report.
 *
 * Balances come from each student's `financialSummary`, which the syncStudentFeeTotals
 * Cloud Function maintains; recomputing them here from raw transactions would risk
 * disagreeing with the ledger screens. The selected period only drives the "paid in
 * range" column and the ageing clock, so the report answers both "who owes" and "what
 * have they actually paid lately".
 */
export default function ReportDues({ data }) {
  const [f, setF] = useState(DEFAULTS);
  const [drill, setDrill] = useState(null);
  const set = (patch) => setF(prev => ({ ...prev, ...patch }));

  const range = useMemo(() => resolveRange(f.preset, f.custom), [f.preset, f.custom]);

  /** Per-student payment facts derived from the receipts we can see. */
  const paymentIndex = useMemo(() => {
    const idx = new Map();
    data.income.forEach(r => {
      if (r.txType === 'discount' || !r.studentId) return;
      const e = idx.get(r.studentId) || { lastPaid: null, paidInRange: 0, receiptsInRange: 0, lifetime: 0 };
      if (r.amount > 0 && (!e.lastPaid || r.date > e.lastPaid)) e.lastPaid = r.date;
      e.lifetime += r.amount;
      if (r.date >= range.start && r.date <= range.end) {
        e.paidInRange += r.amount;
        if (r.amount > 0) e.receiptsInRange += 1;
      }
      idx.set(r.studentId, e);
    });
    return idx;
  }, [data.income, range]);

  const today = useMemo(() => new Date(), []);

  const enriched = useMemo(() => data.students.map(s => {
    const fin = s.financialSummary || {};
    const pay = paymentIndex.get(s.id) || { lastPaid: null, paidInRange: 0, receiptsInRange: 0, lifetime: 0 };
    // The reconciliation Cloud Function writes 'arrears' for owing students — NOT 'due'.
    // FeesLedger renders any status outside clear/ahead/unconfigured as "Due" via its else
    // branch; mirror that here so the status filter actually matches real documents.
    // (Filtering on 'due' directly matched nothing and emptied the whole report.)
    const rawStatus = fin.status || 'unconfigured';
    const status = ['clear', 'ahead', 'unconfigured'].includes(rawStatus) ? rawStatus : 'due';
    const daysSince = pay.lastPaid ? Math.floor((today - pay.lastPaid) / 86400000) : null;
    return {
      id: s.id,
      name: s.name,
      wing: s.wing || 'unassigned',
      grade: s.grade || '',
      status,
      dueNow: Number(fin.dueNow) || 0,
      aheadBy: Number(fin.aheadBy) || 0,
      discount: Number(fin.totalDiscounted) || 0,
      annualRemaining: Number(fin.annualRemaining) || 0,
      lastPaid: pay.lastPaid,
      daysSince,
      band: bandOf(daysSince),
      paidInRange: pay.paidInRange,
      receiptsInRange: pay.receiptsInRange,
      // BreakdownTable sums `amount`, and on this report the money being ranked is the due.
      amount: Number(fin.dueNow) || 0
    };
  }), [data.students, paymentIndex, today]);

  const facets = useMemo(() => {
    const grades = new Set(ALL_CLASSES);
    enriched.forEach(s => { if (s.grade) grades.add(s.grade); });
    return { grades: Array.from(grades).sort() };
  }, [enriched]);

  const rows = useMemo(() => {
    const min = f.minDue === '' ? null : Number(f.minDue);
    const q = f.search.trim().toLowerCase();
    return enriched.filter(s => {
      if (!f.includeUnconfigured && s.status === 'unconfigured') return false;
      if (f.onlyWithDues && s.dueNow <= 0) return false;
      if (f.statuses.length && !f.statuses.includes(s.status)) return false;
      if (f.wings.length && !f.wings.includes(s.wing)) return false;
      if (f.grades.length && !f.grades.includes(s.grade)) return false;
      if (f.agingBucket !== 'any' && s.band !== f.agingBucket) return false;
      if (min !== null && s.dueNow < min) return false;
      if (q && !`${s.name} ${s.grade} ${WING_LABEL[s.wing]}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, f]);

  const totals = useMemo(() => ({
    due: rows.reduce((a, s) => a + s.dueNow, 0),
    withDues: rows.filter(s => s.dueNow > 0).length,
    ahead: rows.reduce((a, s) => a + s.aheadBy, 0),
    annualRemaining: rows.reduce((a, s) => a + s.annualRemaining, 0),
    concessions: rows.reduce((a, s) => a + s.discount, 0),
    paidInRange: rows.reduce((a, s) => a + s.paidInRange, 0),
    stale: rows.filter(s => s.dueNow > 0 && (s.daysSince === null || s.daysSince > 60)).length,
    largest: rows.reduce((m, s) => Math.max(m, s.dueNow), 0)
  }), [rows]);

  const groups = useMemo(() => {
    switch (f.groupBy) {
      case 'grade': return groupBy(rows, r => r.grade || '—', k => (k === '—' ? 'No class set' : k));
      case 'aging': {
        const g = groupBy(rows, r => r.band, k => AGE_BANDS.find(b => b.id === k)?.label || k);
        // Ageing reads chronologically, not by size — newest band first.
        const order = AGE_BANDS.map(b => b.id);
        return g.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
      }
      case 'status': return groupBy(rows, r => r.status, k => STATUS_LABEL[k] || k);
      case 'wing':
      default: return groupBy(rows, r => r.wing, k => WING_LABEL[k] || k);
    }
  }, [rows, f.groupBy]);

  const groupKeyOf = useCallback(
    (r) => ({ grade: r.grade || '—', aging: r.band, status: r.status, wing: r.wing }[f.groupBy] ?? r.wing),
    [f.groupBy]
  );
  const detailRows = useMemo(() => (drill ? rows.filter(r => groupKeyOf(r) === drill) : rows), [rows, drill, groupKeyOf]);

  const activeFilterCount =
    f.wings.length + f.grades.length + f.statuses.length + (f.minDue !== '' ? 1 : 0) +
    (f.search ? 1 : 0) + (f.agingBucket !== 'any' ? 1 : 0) +
    (f.onlyWithDues ? 1 : 0) + (f.includeUnconfigured ? 1 : 0);

  const handleExport = () => downloadCSV(
    `outstanding_dues_${slugDate(new Date())}`,
    detailRows.map(s => ({
      Student: s.name,
      Wing: WING_LABEL[s.wing] || s.wing,
      Class: s.grade || '',
      Status: STATUS_LABEL[s.status] || s.status,
      'Due now': s.dueNow,
      'Paid ahead': s.aheadBy,
      'Concessions given': s.discount,
      'Annual remaining': s.annualRemaining,
      'Last payment': s.lastPaid ? fmtDate(s.lastPaid) : 'Never',
      'Days since payment': s.daysSince ?? '',
      [`Paid in ${range.label}`]: s.paidInRange
    }))
  );

  const columns = [
    {
      key: 'name', header: 'Student', cellClass: 'text-brand-text',
      render: s => (
        <div className="min-w-[160px]">
          <div className="font-medium text-brand-text truncate max-w-[220px]">{s.name}</div>
          <div className="text-[11px] text-brand-text-dim">{WING_LABEL[s.wing] || s.wing}{s.grade ? ` · ${s.grade}` : ''}</div>
        </div>
      )
    },
    { key: 'status', header: 'Status', width: '100px', render: s => <Pill tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status] || s.status}</Pill> },
    {
      key: 'dueNow', header: 'Due now', align: 'right', width: '120px', cellClass: 'font-bold tabular-nums',
      render: s => <span className={s.dueNow > 0 ? 'text-red-500' : 'text-brand-text-dim'}>{s.dueNow > 0 ? INR(s.dueNow) : '—'}</span>
    },
    {
      key: 'aheadBy', header: 'Paid ahead', align: 'right', width: '110px', cellClass: 'tabular-nums',
      render: s => <span className={s.aheadBy > 0 ? 'text-brand-secondary font-bold' : 'text-brand-text-dim'}>{s.aheadBy > 0 ? INR(s.aheadBy) : '—'}</span>
    },
    {
      key: 'paidInRange', header: `Paid · ${range.label}`, align: 'right', width: '130px', cellClass: 'tabular-nums',
      render: s => <span className={s.paidInRange > 0 ? 'text-green-600 dark:text-green-400 font-bold' : 'text-brand-text-dim'}>{s.paidInRange > 0 ? INR(s.paidInRange) : '—'}</span>
    },
    {
      key: 'daysSince', header: 'Last payment', align: 'right', width: '140px',
      sortValue: s => (s.daysSince === null ? Number.MAX_SAFE_INTEGER : s.daysSince),
      render: s => (
        <div className="text-right">
          <div className="text-xs text-brand-text whitespace-nowrap">{s.lastPaid ? fmtDate(s.lastPaid) : 'Never'}</div>
          {s.daysSince !== null && <div className={`text-[11px] ${s.daysSince > 60 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-brand-text-dim'}`}>{s.daysSince}d ago</div>}
        </div>
      )
    },
    { key: 'annualRemaining', header: 'Annual left', align: 'right', width: '120px', cellClass: 'tabular-nums text-brand-text-dim', render: s => INR(s.annualRemaining) }
  ];

  return (
    <div className="space-y-5">
      <ReportToolbar
        preset={f.preset} onPreset={(v) => set({ preset: v })}
        custom={f.custom} onCustom={(v) => set({ custom: v })}
        range={range}
        showCompare={false} showGranularity={false}
        onExport={handleExport} exportDisabled={!detailRows.length}
        onReset={() => { setF(DEFAULTS); setDrill(null); }}
        activeFilterCount={activeFilterCount}
        savedKey="abhishri.reports.dues.views"
        savedFilters={f} onApplySaved={(v) => { setF({ ...DEFAULTS, ...v }); setDrill(null); }}
        resultLabel={`${totals.withDues} student${totals.withDues === 1 ? '' : 's'} owing ${INR(totals.due)}`}
      >
        <div className="flex flex-wrap gap-3">
          <MultiSelect label="Wing" options={[...WINGS, { id: 'unassigned', label: 'Unassigned' }]} selected={f.wings} onChange={(v) => set({ wings: v })} allLabel="All wings" width="w-44" />
          <MultiSelect label="Class / Grade" options={facets.grades} selected={f.grades} onChange={(v) => set({ grades: v })} allLabel="All classes" width="w-44" />
          <MultiSelect label="Status" options={STATUS_OPTIONS} selected={f.statuses} onChange={(v) => set({ statuses: v })} allLabel="Any status" width="w-44" />
          <Field label="Days since payment">
            <Select
              value={f.agingBucket} onChange={(v) => set({ agingBucket: v })}
              options={[{ id: 'any', label: 'Any' }, ...AGE_BANDS.map(b => ({ id: b.id, label: b.label }))]}
              className="w-44"
            />
          </Field>
          <Field label="Min due ₹"><TextInput type="number" value={f.minDue} onChange={(v) => set({ minDue: v })} placeholder="0" className="w-28" /></Field>
          <Field label="Search" className="flex-1 min-w-[200px]">
            <TextInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Student or class…" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-brand-card-border">
          <Toggle checked={f.onlyWithDues} onChange={(v) => set({ onlyWithDues: v })} label="Only students who owe money" hint="Turn off to review the whole roster, including clear and paid-ahead students." />
          <Toggle checked={f.includeUnconfigured} onChange={(v) => set({ includeUnconfigured: v })} label="Include students without a fee plan" hint="These have no computed balance yet, so they cannot show a due." />
        </div>
      </ReportToolbar>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Outstanding now" value={INR(totals.due)} icon={AlertCircle} tone="red"
          sub={totals.largest ? `Largest ${INR(totals.largest)}` : null}
        />
        <StatCard
          label="Students owing" value={totals.withDues.toLocaleString('en-IN')} icon={Users} tone="primary"
          sub={`${rows.length} in view`}
        />
        <StatCard
          label="Paid ahead" value={INR(totals.ahead)} icon={PiggyBank} tone="blue"
          sub={`${INR(totals.paidInRange)} collected in ${range.label}`}
        />
        <StatCard
          label="Chase list" value={totals.stale.toLocaleString('en-IN')} icon={CalendarClock}
          tone={totals.stale ? 'amber' : 'green'}
          sub={totals.stale ? 'Owing and no payment in 60+ days' : 'No stale receivables'}
        />
      </div>

      {totals.concessions > 0 && (
        <div className="flex items-start gap-2.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl px-4 py-3">
          <BadgePercent size={16} className="text-purple-500 mt-0.5 shrink-0" />
          <p className="text-sm text-purple-800 dark:text-purple-200">
            <span className="font-bold">{INR(totals.concessions)}</span> in fee concessions has been granted to the students in this view.
            Concessions reduce what is owed and never appear as collected cash.
          </p>
        </div>
      )}

      <SectionCard
        title="Where the money is owed"
        subtitle={drill ? 'Click the highlighted row again to clear the drill-down.' : 'Click any row to filter the students below.'}
        actions={
          <Field label="Split by">
            <Select value={f.groupBy} onChange={(v) => { set({ groupBy: v }); setDrill(null); }} options={GROUP_OPTIONS} className="w-52" />
          </Field>
        }
      >
        <BreakdownTable
          groups={groups}
          total={groups.reduce((a, g) => a + g.total, 0)}
          labelHeader={GROUP_OPTIONS.find(g => g.id === f.groupBy)?.label || 'Group'}
          onRowClick={setDrill}
          activeKey={drill}
        />
      </SectionCard>

      <SectionCard
        title="Students"
        subtitle={drill ? `Filtered to “${groups.find(g => g.key === drill)?.label ?? drill}”` : `${detailRows.length} student${detailRows.length === 1 ? '' : 's'}`}
        actions={drill ? (
          <button onClick={() => setDrill(null)} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline">
            <Filter size={12} /> Clear drill-down
          </button>
        ) : null}
      >
        <DataTable
          columns={columns}
          rows={detailRows}
          pageSize={30}
          emptyTitle="No students match these filters"
          emptyHint="Try turning off “Only students who owe money”, or widen the status filter."
        />
      </SectionCard>
    </div>
  );
}
