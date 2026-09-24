/**
 * How a fee plan turns into line items ("requirements"), what each line item is keyed
 * by, and how a payment is split across them.
 *
 * Shared by the dues engine (reconcileStudent in functions/src/fees/triggers.js, which
 * writes plan_details.componentPayments) and the logPayment callable (which writes each
 * payment's breakdown). Before this module the dues engine built requirements in one
 * place and the ledger screen split payments in another, and for plans saved without
 * academicStartYear the two used different keys, so such plans never showed a month as
 * paid. Same shared-ESM arrangement as feeTx.mjs and enrollment.mjs.
 */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isMonthly = (c) => (c.frequency || '').toLowerCase() === 'monthly';

/**
 * Every line item a plan charges over one billing cycle, with structural (negative
 * one-time) discounts already taken off, first line first.
 *   { uid, name, baseAmount, amount, effectiveAmount, frequency: 'onetime'|'monthly', month, relativeIdx }
 */
export function buildRequirements(plan) {
  const f = plan || {};
  const components = f.components || [];
  const startMonth = f.startMonth !== undefined ? f.startMonth : 5;
  const reqs = [];
  components.filter(c => !isMonthly(c) && c.amount >= 0).forEach(c => {
    reqs.push({ uid: c.uid, name: c.name, baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount, amount: c.amount, frequency: 'onetime', month: null });
  });
  for (let i = 0; i < (f.billingCycle || 12); i++) {
    const month = MONTHS[(startMonth + i) % 12];
    components.filter(isMonthly).forEach(c => {
      reqs.push({ uid: c.uid, name: c.name, baseAmount: c.baseAmount !== undefined ? c.baseAmount : c.amount, amount: c.amount, frequency: 'monthly', month, relativeIdx: i });
    });
  }
  let remainingDiscount = components.filter(c => !isMonthly(c) && c.amount < 0).reduce((acc, c) => acc + Math.abs(c.amount), 0);
  return reqs.map(r => {
    const deduction = Math.min(r.amount, remainingDiscount);
    remainingDiscount -= deduction;
    return { ...r, effectiveAmount: r.amount - deduction };
  });
}

/**
 * The key a line item's payments are stored under in componentPayments and breakdown.
 * Plans with academicStartYear are year-prefixed ('2026-tuition-June'); plans saved
 * before that field existed are not ('tuition-June'). This is the dues engine's
 * convention, and it is the one that is actually stored.
 */
export function componentKey(req, plan) {
  const f = plan || {};
  const prefix = f.academicStartYear !== undefined ? `${f.academicStartYear}-` : '';
  const id = req.uid || req.name;
  return req.month ? `${prefix}${id}-${req.month}` : `${prefix}${id}`;
}

/** One-time items are always expected; monthly ones only when `isDue(relativeIdx)`. */
const expected = (r, schedule) => r.frequency !== 'monthly' || (r.relativeIdx !== undefined && schedule.isDue(r.relativeIdx));

/**
 * Split a payment across a student's line items, for the payment's `breakdown` (what
 * the receipt shows). Mirrors the ledger screen's long-standing allocateFunds:
 *   - with `selectedKeys` (the "pending dues" checklist), only those overdue items, in
 *     the order ticked
 *   - otherwise overdue items first (only when something is actually due), then items
 *     billed later in the year, skipping months that will never be billed
 *   - whatever is left over is 'Unallocated'
 * Allocation is against componentPayments as the dues engine last wrote it.
 *
 * `schedule` is billingSchedule(plan, student, now) from enrollment.mjs.
 */
export function allocatePayment({ plan, schedule, amount, selectedKeys = [] }) {
  const f = plan || {};
  const paid = f.componentPayments || {};
  const reqs = buildRequirements(f);
  const breakdown = {};
  const breakdownNames = {};
  let remaining = amount;

  const outstanding = (r) => r.effectiveAmount - (paid[componentKey(r, f)] || 0);
  const give = (r) => {
    const due = outstanding(r);
    if (remaining <= 0 || due <= 0) return;
    const key = componentKey(r, f);
    const take = Math.min(remaining, due);
    breakdown[key] = (breakdown[key] || 0) + take;
    breakdownNames[key] = r.name;
    remaining -= take;
  };

  const expectedToDate = reqs.filter(r => expected(r, schedule)).reduce((a, r) => a + r.effectiveAmount, 0);
  const duesNow = expectedToDate - (f.paid || 0) - (f.discounted || 0);

  if (selectedKeys.length > 0) {
    // Only items the ledger lists as overdue can be ticked.
    const overdue = new Map(duesNow > 0
      ? reqs.filter(r => expected(r, schedule) && outstanding(r) > 0).map(r => [componentKey(r, f), r])
      : []);
    selectedKeys.forEach(k => { if (overdue.has(k)) give(overdue.get(k)); });
  } else {
    if (duesNow > 0) reqs.filter(r => expected(r, schedule)).forEach(give);
    reqs.filter(r => !expected(r, schedule))
      // Advance payments only go to months that will actually be billed.
      .filter(r => r.relativeIdx === undefined || schedule.isChargeable(r.relativeIdx))
      .forEach(give);
  }

  if (remaining > 0) {
    breakdown.Unallocated = remaining;
    breakdownNames.Unallocated = 'Unallocated Funds';
  }
  return { breakdown, breakdownNames };
}
