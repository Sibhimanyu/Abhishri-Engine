import Papa from 'papaparse';

/**
 * Shared vocabulary + date maths for the Reports module.
 *
 * The literal option lists below mirror the <select> options in the forms that WRITE
 * these records (StudentLedgerView's payment method, FeesMyExpenses' category). They are
 * used to seed the filter dropdowns so a facet is offerable even when nothing in the
 * current range uses it yet — the actual filter lists are unioned with the values found
 * in live data, so a legacy/renamed value never becomes invisible.
 */
// 'Concession' is deliberately absent: it is not a way money arrives (concessions are
// type:'discount' rows). Legacy rows that carry it as a method still surface in the
// filter facets because those are unioned with live data values.
export const PAYMENT_METHODS = ['Cash', 'GPay/UPI', 'Bank Transfer', 'Cheque', 'Card'];

export const EXPENSE_CATEGORIES = [
  'Office Supplies', 'Maintenance', 'Utility Bills', 'Transport',
  'Meals/Entertainment', 'Refreshments', 'Miscellaneous'
];

/** Categorical series colours, legible on both the light (#F8FAFC) and dark (#0d1117) canvas. */
export const SERIES_COLORS = [
  '#F1615B', '#66C8C8', '#6366F1', '#F59E0B', '#10B981',
  '#EC4899', '#8B5CF6', '#0EA5E9', '#84CC16', '#F97316',
  '#14B8A6', '#A855F7'
];

export const colorAt = (i) => SERIES_COLORS[i % SERIES_COLORS.length];

export const WINGS = [
  { id: 'preschool', label: 'Preschool' },
  { id: 'tuition', label: 'Tuition' }
];

export const CLASSES = {
  preschool: ['Playgroup', 'Nursery', 'LKG', 'UKG'],
  tuition: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']
};

export const ALL_CLASSES = [...CLASSES.preschool, ...CLASSES.tuition];

/* ------------------------------------------------------------------ formatting */

export const INR = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** Compact Indian-notation amount for chart axes and dense tiles (₹1.2L, ₹45.3K). */
export function INRShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(abs >= 100000000 ? 0 : 1)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(abs >= 1000000 ? 0 : 1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export const pct = (part, whole) => (!whole ? 0 : (part / whole) * 100);

export const fmtPct = (n) => `${n >= 0 ? '' : '-'}${Math.abs(n).toFixed(1)}%`;

/* ------------------------------------------------------------------ dates */

/** Firestore Timestamp | ISO string | millis | Date -> Date (epoch 0 when unparseable). */
export function toDate(v) {
  if (!v) return new Date(0);
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * YYYY-MM-DD in the LOCAL calendar. Deliberately not toISOString(): that converts to UTC
 * first, so in IST (UTC+5:30) local midnight resolves to 18:30 on the previous UTC day and
 * every day/week bucket key would silently shift back by one.
 */
export const localKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Parse a date-only string ("2026-08-23") as LOCAL midnight, not UTC midnight. */
export const parseISODate = (str) => {
  const [y, m, day] = String(str).split('-').map(Number);
  return (y && m && day) ? new Date(y, m - 1, day) : new Date(str);
};

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };

/** Monday-start week, matching how Indian school weeks are read. */
export const startOfWeek = (d) => {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - day);
  return x;
};

export const startOfMonth = (d) => startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
export const endOfMonth = (d) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
export const startOfQuarter = (d) => startOfDay(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
export const endOfQuarter = (d) => endOfDay(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0));

/**
 * Indian financial year: 1 April -> 31 March. A date in Jan–Mar belongs to the FY that
 * started the PREVIOUS April, which is why the year offset is conditional.
 */
export const startOfFY = (d) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return startOfDay(new Date(y, 3, 1));
};
export const endOfFY = (d) => endOfDay(new Date(startOfFY(d).getFullYear() + 1, 2, 31));
export const fyLabel = (d) => {
  const y = startOfFY(d).getFullYear();
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

export const DATE_PRESETS = [
  { id: 'today', label: 'Today', group: 'Recent' },
  { id: 'yesterday', label: 'Yesterday', group: 'Recent' },
  { id: 'last7', label: 'Last 7 days', group: 'Recent' },
  { id: 'last30', label: 'Last 30 days', group: 'Recent' },
  { id: 'last90', label: 'Last 90 days', group: 'Recent' },
  { id: 'this_week', label: 'This week', group: 'Calendar' },
  { id: 'this_month', label: 'This month', group: 'Calendar' },
  { id: 'last_month', label: 'Last month', group: 'Calendar' },
  { id: 'this_quarter', label: 'This quarter', group: 'Calendar' },
  { id: 'last_quarter', label: 'Last quarter', group: 'Calendar' },
  { id: 'this_year', label: 'This year', group: 'Calendar' },
  { id: 'last_year', label: 'Last year', group: 'Calendar' },
  { id: 'this_fy', label: 'This financial year', group: 'Financial year' },
  { id: 'last_fy', label: 'Last financial year', group: 'Financial year' },
  { id: 'all', label: 'All time', group: 'Other' },
  { id: 'custom', label: 'Custom range…', group: 'Other' }
];

/** Resolve a preset id (+ custom from/to strings) into a concrete inclusive window. */
export function resolveRange(presetId, custom = {}) {
  const now = new Date();
  switch (presetId) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
    case 'yesterday': {
      const y = addDays(now, -1);
      return { start: startOfDay(y), end: endOfDay(y), label: 'Yesterday' };
    }
    case 'last7':
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now), label: 'Last 7 days' };
    case 'last30':
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now), label: 'Last 30 days' };
    case 'last90':
      return { start: startOfDay(addDays(now, -89)), end: endOfDay(now), label: 'Last 90 days' };
    case 'this_week':
      return { start: startOfWeek(now), end: endOfDay(addDays(startOfWeek(now), 6)), label: 'This week' };
    case 'last_month': {
      const m = addMonths(now, -1);
      return { start: startOfMonth(m), end: endOfMonth(m), label: m.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
    }
    case 'this_quarter':
      return { start: startOfQuarter(now), end: endOfQuarter(now), label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` };
    case 'last_quarter': {
      const q = addMonths(startOfQuarter(now), -3);
      return { start: startOfQuarter(q), end: endOfQuarter(q), label: `Q${Math.floor(q.getMonth() / 3) + 1} ${q.getFullYear()}` };
    }
    case 'this_year':
      return { start: startOfDay(new Date(now.getFullYear(), 0, 1)), end: endOfDay(new Date(now.getFullYear(), 11, 31)), label: String(now.getFullYear()) };
    case 'last_year': {
      const y = now.getFullYear() - 1;
      return { start: startOfDay(new Date(y, 0, 1)), end: endOfDay(new Date(y, 11, 31)), label: String(y) };
    }
    case 'this_fy':
      return { start: startOfFY(now), end: endOfFY(now), label: fyLabel(now) };
    case 'last_fy': {
      const prev = addMonths(startOfFY(now), -12);
      return { start: startOfFY(prev), end: endOfFY(prev), label: fyLabel(prev) };
    }
    case 'all':
      return { start: new Date(2000, 0, 1), end: endOfDay(now), label: 'All time' };
    case 'custom': {
      const s = custom.from ? startOfDay(parseISODate(custom.from)) : startOfDay(addMonths(now, -1));
      const e = custom.to ? endOfDay(parseISODate(custom.to)) : endOfDay(now);
      return { start: s, end: e < s ? endOfDay(s) : e, label: 'Custom range' };
    }
    case 'this_month':
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  }
}

/**
 * The equally-long window immediately before `range`, for period-over-period deltas.
 * Calendar-month/quarter/FY presets step back by calendar unit instead of by raw
 * duration, so "this month vs last month" compares Feb (28d) to Jan (31d) honestly
 * rather than to "the 28 days before 1 Feb".
 */
export function previousRange(range, presetId) {
  const calendarStep = {
    this_month: -1, last_month: -1,
    this_quarter: -3, last_quarter: -3,
    this_year: -12, last_year: -12,
    this_fy: -12, last_fy: -12
  }[presetId];

  if (calendarStep) {
    const start = addMonths(range.start, calendarStep);
    const end = endOfDay(addDays(addMonths(endOfDay(addDays(range.end, 1)), calendarStep), -1));
    return { start: startOfDay(start), end };
  }
  const span = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - span - 1),
    end: new Date(range.start.getTime() - 1)
  };
}

const DAY_MS = 86400000;

/** Pick a bucket size that keeps a chart between roughly 5 and 40 bars. */
export function autoGranularity(start, end) {
  const days = Math.max(1, (end - start) / DAY_MS);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 800) return 'month';
  if (days <= 2400) return 'quarter';
  return 'year';
}

const GRANULARITY_ORDER = ['day', 'week', 'month', 'quarter', 'year'];

/** Past this many bars a trend stops being readable, so a finer choice gets coarsened. */
const MAX_BUCKETS = 200;

/** Roughly how many buckets `granularity` would produce across the window. */
export function estimateBuckets(start, end, granularity) {
  const days = Math.max(1, (end - start) / DAY_MS);
  return { day: days, week: days / 7, month: days / 30.4, quarter: days / 91.3, year: days / 365 }[granularity] || days;
}

/**
 * The granularity actually used to bucket a range.
 *
 * A hand-picked fine granularity over a long window (say "Daily" across all time) would
 * produce thousands of buckets — unreadable as a chart, and a silent under-count once
 * bucket building hits its safety cap. So a too-fine choice is coarsened until it fits,
 * and callers surface the result so the user can see what they actually got.
 */
export function effectiveGranularity(requested, start, end) {
  if (requested === 'auto' || !GRANULARITY_ORDER.includes(requested)) return autoGranularity(start, end);
  let i = GRANULARITY_ORDER.indexOf(requested);
  while (i < GRANULARITY_ORDER.length - 1 && estimateBuckets(start, end, GRANULARITY_ORDER[i]) > MAX_BUCKETS) i++;
  return GRANULARITY_ORDER[i];
}

/** Adverb form for prose ("Monthly totals"), keyed by granularity id. */
export const GRANULARITY_ADVERB = {
  day: 'Daily', week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly'
};

export const GRANULARITIES = [
  { id: 'auto', label: 'Auto' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'year', label: 'Yearly' }
];

/** Stable sortable key + human label for the bucket a date falls into. */
export function bucketOf(date, granularity) {
  const d = new Date(date);
  switch (granularity) {
    case 'day':
      return { key: localKey(d), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) };
    case 'week': {
      const s = startOfWeek(d);
      return { key: localKey(s), label: s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) };
    }
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return { key: `${d.getFullYear()}-Q${q}`, label: `Q${q} '${String(d.getFullYear() % 100).padStart(2, '0')}` };
    }
    case 'year':
      return { key: String(d.getFullYear()), label: String(d.getFullYear()) };
    case 'month':
    default:
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
      };
  }
}

/**
 * Every bucket between start and end, including empty ones — a month with no collections
 * has to show as a zero bar, not silently vanish from the trend.
 */
export function buildBuckets(start, end, granularity) {
  const out = [];
  const seen = new Set();
  let cursor = new Date(start);
  let guard = 0;
  // Bounded well above what effectiveGranularity() allows, purely as a runaway guard.
  while (cursor <= end && guard++ < 1200) {
    const b = bucketOf(cursor, granularity);
    if (!seen.has(b.key)) { seen.add(b.key); out.push(b); }
    if (granularity === 'day') cursor = addDays(cursor, 1);
    else if (granularity === 'week') cursor = addDays(cursor, 7);
    else if (granularity === 'month') cursor = addMonths(cursor, 1);
    else if (granularity === 'quarter') cursor = addMonths(cursor, 3);
    else cursor = new Date(cursor.getFullYear() + 1, 0, 1);
  }
  return out;
}

export const fmtDate = (d) => toDate(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (d) => toDate(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const rangeLabel = (r) => `${fmtDate(r.start)} — ${fmtDate(r.end)}`;

/* ------------------------------------------------------------------ transaction semantics */

/**
 * Classify a raw fee transaction into the three money buckets the reports use.
 *
 * Mirrors reconcileStudent (functions/src/fees/triggers.js) and FeesTransactions:
 * a concession is a type:'discount' row, or the void that reverses one (voids copy
 * the original's category 'Discount'/'Fee Concession'). Method is deliberately NOT
 * consulted: a type:'incoming' row whose method was edited to 'Concession' is still
 * money the dues engine counts as paid, so treating it as non-cash here made the
 * Collections report disagree with every ledger screen by that amount.
 */
export function classifyIncomeTx(t) {
  const concessionShaped = t.category === 'Discount' || t.category === 'Fee Concession';
  const isConcession = t.type === 'discount' ||
    (t.type === 'void' && concessionShaped) ||
    // Legacy rows with NO type field: the writers have always set type, so an untyped
    // row predates them. The dues engine counts untyped rows in neither totalPaid nor
    // totalDiscounted, so treating a concession-shaped one as cash income here would
    // inflate collections by money that never moved.
    (!t.type && (concessionShaped || t.method === 'Concession'));
  return isConcession ? 'discount' : t.type === 'void' ? 'void' : 'incoming';
}

/**
 * A receipt that still stands: an incoming row that has not been voided.
 * Voided originals stay in the row set so gross/net maths can net them off,
 * but they must not count as receipts, students, averages or payment dates.
 */
export const isLiveReceipt = (r) => r.txType === 'incoming' && !r.isVoided;

/* ------------------------------------------------------------------ aggregation */

export function summarize(rows, valueOf = (r) => r.amount) {
  let total = 0, max = -Infinity, min = Infinity;
  rows.forEach(r => {
    const v = Number(valueOf(r)) || 0;
    total += v;
    if (v > max) max = v;
    if (v < min) min = v;
  });
  return {
    total,
    count: rows.length,
    avg: rows.length ? total / rows.length : 0,
    max: rows.length ? max : 0,
    min: rows.length ? min : 0
  };
}

/**
 * Group rows into [{ key, label, total, count, rows }] sorted by total descending.
 * `countIf` decides which rows the human-facing `count` reflects — totals always sum
 * every row (so negative reversals net off), but a voided receipt and its reversal
 * must not each count as an entry. Defaults to counting everything.
 */
export function groupBy(rows, keyOf, labelOf = (k) => k, countIf = () => true) {
  const map = new Map();
  rows.forEach(r => {
    const key = keyOf(r) ?? '—';
    if (!map.has(key)) map.set(key, { key, label: labelOf(key, r), total: 0, count: 0, rows: [] });
    const g = map.get(key);
    g.total += Number(r.amount) || 0;
    if (countIf(r)) g.count += 1;
    g.rows.push(r);
  });
  return Array.from(map.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/**
 * Bucket rows onto a complete timeline, with an optional second (comparison) series.
 * `countIf` mirrors groupBy: values always sum every row, counts only the rows the
 * predicate accepts (e.g. live receipts, not voided pairs).
 */
export function timeSeries(rows, range, granularity, countIf = () => true) {
  const buckets = buildBuckets(range.start, range.end, granularity);
  const totals = new Map(buckets.map(b => [b.key, 0]));
  const counts = new Map(buckets.map(b => [b.key, 0]));
  rows.forEach(r => {
    const k = bucketOf(r.date, granularity).key;
    if (totals.has(k)) {
      totals.set(k, totals.get(k) + (Number(r.amount) || 0));
      if (countIf(r)) counts.set(k, counts.get(k) + 1);
    }
  });
  return buckets.map(b => ({ ...b, value: totals.get(b.key), count: counts.get(b.key) }));
}

/* ------------------------------------------------------------------ export */

/** Trigger a browser download of `rows` (array of flat objects) as CSV. */
export function downloadCSV(filename, rows) {
  if (!rows?.length) return false;
  const csv = Papa.unparse(rows);
  // The BOM keeps Excel from mangling the rupee sign and any non-ASCII student names.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

export const slugDate = (d) => localKey(toDate(d));
