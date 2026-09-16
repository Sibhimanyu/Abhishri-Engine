/**
 * Bank statement CSV parsing helpers.
 *
 * Indian bank statements are not a format, they are a genre. Column names, date order,
 * amount notation and debit/credit representation all differ per bank, so everything
 * here is auto-detected but overridable — a wrong guess that the operator can see and
 * correct is fine; a wrong guess applied silently is not.
 */

/**
 * Parse a statement date with an EXPLICIT field order.
 *
 * `new Date('03/09/2026')` yields 9 March, because JS assumes US month-first. Indian
 * statements mean 3 September. That silently mis-files every payment made in the first
 * twelve days of a month, so the order is never inferred from the value itself.
 */
export function parseStatementDate(raw, order = 'DMY') {
  const s = String(raw || '').trim();
  if (!s) return null;

  // ISO first: unambiguous regardless of the selected order.
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return safeDate(+iso[1], +iso[2], +iso[3]);

  // dd-MMM-yyyy / dd MMM yy — common on Indian statements and also unambiguous.
  const named = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})/);
  if (named) {
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (m >= 0) return safeDate(fullYear(+named[3]), m + 1, +named[1]);
  }

  const parts = s.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!parts) return null;
  const a = +parts[1], b = +parts[2], c = +parts[3];

  if (order === 'YMD') return safeDate(fullYear(a), b, c);
  if (order === 'MDY') return safeDate(fullYear(c), a, b);
  return safeDate(fullYear(c), b, a); // DMY
}

const fullYear = (y) => (y < 100 ? 2000 + y : y);

/** Local midnight, and rejects impossible dates instead of rolling them over silently. */
function safeDate(y, m, d) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Parse an amount from a statement cell.
 *
 * Handles thousands separators, a trailing Cr/Dr marker, and parentheses for negatives.
 * Returns null for a blank cell — important, because banks use an empty credit column to
 * mean "this row is a debit", and treating that as 0 would silently create phantom rows.
 */
export function parseAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /\bdr\b/i.test(s);
  const cleaned = s.replace(/[()]/g, '').replace(/\b(cr|dr)\b/gi, '').replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/** Header aliases seen across Indian bank exports, longest/most specific first. */
const ALIASES = {
  valueDate: ['value date', 'value dt', 'val date', 'txn date', 'transaction date', 'tran date', 'date'],
  description: ['narration', 'particulars', 'description', 'transaction remarks', 'remarks', 'details'],
  reference: ['ref no', 'reference no', 'reference', 'cheque no', 'chq no', 'utr', 'transaction id', 'ref'],
  credit: ['deposit amt', 'deposit', 'credit amt', 'credit', 'cr amount', 'cr'],
  debit: ['withdrawal amt', 'withdrawal', 'debit amt', 'debit', 'dr amount', 'dr'],
  amount: ['amount', 'txn amount', 'transaction amount'],
};

/**
 * Guess which column is which. Returns the mapping AND whether the statement uses
 * separate debit/credit columns, because that changes how a row's sign is derived.
 */
export function detectColumns(headers) {
  const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalised = headers.map(norm);
  const pick = (aliases) => {
    for (const alias of aliases) {
      const exact = normalised.indexOf(alias);
      if (exact !== -1) return headers[exact];
    }
    for (const alias of aliases) {
      const partial = normalised.findIndex((h) => h.includes(alias));
      if (partial !== -1) return headers[partial];
    }
    return '';
  };
  const credit = pick(ALIASES.credit);
  const debit = pick(ALIASES.debit);
  return {
    valueDate: pick(ALIASES.valueDate),
    description: pick(ALIASES.description),
    reference: pick(ALIASES.reference),
    credit,
    debit,
    amount: credit && debit ? '' : pick(ALIASES.amount),
    splitColumns: !!(credit && debit),
  };
}

/**
 * Turn parsed CSV rows into statement lines for importStatement.
 * Returns { lines, errors } — errors name the row so the operator can fix the mapping
 * rather than being told the file is simply bad.
 */
export function buildLines(rows, mapping, dateOrder = 'DMY') {
  const lines = [];
  const errors = [];

  rows.forEach((row, i) => {
    const rowNo = i + 2; // +1 for zero-index, +1 for the header row
    const valueDate = parseStatementDate(row[mapping.valueDate], dateOrder);

    let amount = null;
    if (mapping.splitColumns) {
      const cr = parseAmount(row[mapping.credit]);
      const dr = parseAmount(row[mapping.debit]);
      if (cr !== null && cr !== 0) amount = Math.abs(cr);
      else if (dr !== null && dr !== 0) amount = -Math.abs(dr);
    } else {
      amount = parseAmount(row[mapping.amount]);
    }

    // A row with neither a usable date nor an amount is almost always a footer or a
    // carried-forward balance line, not an error worth shouting about.
    const blank = !valueDate && (amount === null || amount === 0);
    if (blank) return;

    if (!valueDate) { errors.push(`Row ${rowNo}: could not read the date "${row[mapping.valueDate] ?? ''}".`); return; }
    if (amount === null || amount === 0) { errors.push(`Row ${rowNo}: no amount found.`); return; }

    lines.push({
      valueDate: valueDate.toISOString(),
      description: String(row[mapping.description] ?? '').trim(),
      reference: String(row[mapping.reference] ?? '').trim(),
      amount,
    });
  });

  return { lines, errors };
}
