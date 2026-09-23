/**
 * THE single source of truth for a student's enrollment status and for how far
 * a discontinued student is billed.
 *
 * Consumed by BOTH sides of the system (same reasoning as feeTx.mjs, which see):
 *   - frontend: re-exported through frontend/src/utils/reportUtils.js and used by
 *     the directory, the ledger view, attendance, the dashboard and broadcasts
 *   - backend:  functions/src/fees/triggers.js (reconcileStudent), which computes
 *     every student's dueNow/annualRemaining
 *
 * A student who leaves mid-year must stop accruing monthly fees, otherwise their
 * dues keep climbing forever and the arrears reports never settle. The record is
 * kept (never deleted) so the two months they did attend, and what they paid for
 * them, stay auditable.
 */

export const ENROLLMENT_ACTIVE = 'active';
export const ENROLLMENT_DISCONTINUED = 'discontinued';

/**
 * Absent/unknown enrollmentStatus means active: every student that existed before
 * this feature shipped has no such field and is still on the rolls.
 */
export function getEnrollmentStatus(student) {
  return (student && student.enrollmentStatus) === ENROLLMENT_DISCONTINUED
    ? ENROLLMENT_DISCONTINUED
    : ENROLLMENT_ACTIVE;
}

export function isDiscontinued(student) {
  return getEnrollmentStatus(student) === ENROLLMENT_DISCONTINUED;
}

/**
 * Parse an enrollment date into a local Date.
 *
 * A bare 'YYYY-MM-DD' (what the date pickers store) is built as LOCAL midnight rather
 * than via `new Date(str)`, which would read it as UTC midnight. Anything with a time
 * part (an ISO timestamp such as reEnrolledAt) goes through `new Date` untouched, so
 * 00:30 IST on the 1st reads as the 1st and not as the UTC date, the 31st.
 */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Local calendar day as a sortable integer (20260923), for day-granular comparisons. */
function dayNumber(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function getDiscontinuationDate(student) {
  if (!isDiscontinued(student)) return null;
  const d = student && student.discontinuation;
  return parseDate(d && (d.effectiveDate || d.date));
}

/**
 * Completed absences: every earlier discontinuation that ended in a re-enrollment.
 * Each is { exit, back, waiveFinalMonth } with `exit` the last attending day and
 * `back` the day they rejoined. Entries missing either date are ignored.
 */
function pastAbsences(student) {
  const history = (student && Array.isArray(student.discontinuationHistory)) ? student.discontinuationHistory : [];
  return history
    .map(h => ({
      exit: parseDate(h && (h.effectiveDate || h.date)),
      back: parseDate(h && (h.reEnrolledOn || h.reEnrolledAt)),
      waiveFinalMonth: !!(h && h.waiveFinalMonth)
    }))
    .filter(a => a.exit && a.back);
}

/**
 * Was this student on the rolls on the given day? False after the current exit date,
 * and false for days inside an earlier absence (after that exit, before the return).
 * The exit day itself and the return day both count as enrolled.
 *
 * This is the day-level rule for attendance, head counts and broadcasts; billing is
 * month-level and lives in billingSchedule below.
 */
export function isEnrolledOn(student, date = new Date()) {
  const day = dayNumber(date);
  const exit = getDiscontinuationDate(student);
  if (isDiscontinued(student)) {
    // Discontinued with no usable date: treat as gone, never as still enrolled.
    if (!exit || day > dayNumber(exit)) return false;
  }
  return !pastAbsences(student).some(a => day > dayNumber(a.exit) && day < dayNumber(a.back));
}

/** On the rolls right now: active, or discontinued with an exit date still ahead. */
export function isOnRolls(student, now = new Date()) {
  return isEnrolledOn(student, now);
}

/**
 * Which monthly installments this student owes, as 0-based offsets into the plan's
 * billing cycle (0 = the plan's start month).
 *
 *   due        billed as of `now`: what dueNow is measured against
 *   chargeable the whole obligation: for an active student the full cycle, for one who
 *              has left everything through their exit month (the final settlement)
 *   paused     months skipped because the student was away between an earlier exit
 *              and their re-enrollment
 *
 * Rules:
 *   - an active student's `due` is exactly the long-standing rule,
 *     min(billingCycle, max(1, monthsPassed + 1)) months, minus any paused months
 *   - the exit month is billed unless the admin waived it (waiveFinalMonth)
 *   - the month a student re-enrolls in is billed; the months strictly between the
 *     exit month and it are not
 *   - never bills past today or past the cycle
 *   - a student still enrolled always owes at least the first month; one whose exit
 *     came before this plan's year began owes no monthly installments at all
 *
 * The plan's year is always taken from TODAY (or the plan's academicStartYear), never
 * from the exit date: plans saved before academicStartYear existed roll over every
 * June, and reading the year from an old exit date would bill a student who left last
 * year for this year's months.
 */
export function billingSchedule(plan, student, now = new Date()) {
  const f = plan || {};
  const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
  const billingCycle = f.billingCycle || 12;
  const academicStartYear = f.academicStartYear !== undefined
    ? f.academicStartYear
    : ((now.getMonth() < startMonth) ? now.getFullYear() - 1 : now.getFullYear());
  const offsetOf = (d) => (d.getFullYear() - academicStartYear) * 12 + (d.getMonth() - startMonth);

  const paused = new Set();
  pastAbsences(student).forEach(a => {
    const from = offsetOf(a.exit) + (a.waiveFinalMonth ? 0 : 1);
    const to = offsetOf(a.back) - 1;
    for (let i = Math.max(0, from); i <= Math.min(billingCycle - 1, to); i++) paused.add(i);
  });

  let chargeableEnd = billingCycle; // exclusive
  let dueEnd = Math.min(billingCycle, Math.max(1, offsetOf(now) + 1));
  const exit = getDiscontinuationDate(student);
  if (exit) {
    const waive = !!(student.discontinuation && student.discontinuation.waiveFinalMonth);
    const throughExit = offsetOf(exit) + (waive ? 0 : 1);
    chargeableEnd = Math.min(chargeableEnd, throughExit);
    dueEnd = Math.min(dueEnd, throughExit);
  }

  const range = (end) => {
    const out = [];
    for (let i = 0; i < end; i++) if (!paused.has(i)) out.push(i);
    return out;
  };
  let due = range(dueEnd);
  let chargeable = range(chargeableEnd);
  // An enrolled student always owes the first installment once a plan exists (the
  // long-standing max(1, ...) rule). Not so for someone who left before the plan's year
  // opened: they never attended a month of it.
  if (!exit && due.length === 0) due = [0];
  if (!exit && chargeable.length === 0) chargeable = [0];

  const dueSet = new Set(due);
  const chargeableSet = new Set(chargeable);
  return {
    due,
    chargeable,
    paused: [...paused].sort((a, b) => a - b),
    isDue: (i) => dueSet.has(i),
    isChargeable: (i) => chargeableSet.has(i),
    // The latest billed month, for "status as of" displays; 0 when nothing is billed.
    lastDueIndex: due.length ? due[due.length - 1] : 0
  };
}

/** How many monthly installments are billed as of `now` (see billingSchedule). */
export function billableInstallments(plan, student, now = new Date()) {
  return billingSchedule(plan, student, now).due.length;
}
