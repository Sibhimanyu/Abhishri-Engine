import { describe, it, expect } from 'vitest';
import { buildRequirements, componentKey, allocatePayment } from '../../../functions/src/shared/feeAllocation.mjs';
import { billingSchedule } from '../../../functions/src/shared/enrollment.mjs';

/**
 * How payments are split across a student's fee lines. Shared by the dues engine
 * (componentPayments) and the logPayment callable (each payment's breakdown).
 */
const SEPT = new Date(2026, 8, 21);
const plan = (extra = {}) => ({
  startMonth: 5, billingCycle: 12, academicStartYear: 2026,
  components: [
    { uid: 'adm', name: 'Admission', amount: 5000, frequency: 'onetime' },
    { uid: 'tui', name: 'Tuition', amount: 1000, frequency: 'monthly' },
  ],
  componentPayments: {}, paid: 0, discounted: 0,
  ...extra,
});
const sched = (p, student = {}) => billingSchedule(p, student, SEPT);

describe('componentKey', () => {
  it('year-prefixes plans with academicStartYear, as componentPayments stores them', () => {
    const [adm, june] = buildRequirements(plan());
    expect(componentKey(adm, plan())).toBe('2026-adm');
    expect(componentKey(june, plan())).toBe('2026-tui-June');
  });

  it('leaves plans saved before academicStartYear unprefixed', () => {
    // The ledger screen used to prefix these too, so such plans never showed paid.
    const legacy = plan({ academicStartYear: undefined });
    const [, june] = buildRequirements(legacy);
    expect(componentKey(june, legacy)).toBe('tui-June');
  });
});

describe('buildRequirements', () => {
  it('takes structural discounts off the first lines first', () => {
    const p = plan({ components: [...plan().components, { uid: 'sib', name: 'Sibling', amount: -5500, frequency: 'onetime' }] });
    const reqs = buildRequirements(p);
    expect(reqs[0].effectiveAmount).toBe(0);      // admission fully covered
    expect(reqs[1].effectiveAmount).toBe(500);    // June half covered
    expect(reqs[2].effectiveAmount).toBe(1000);
    expect(reqs).toHaveLength(13);
  });
});

describe('allocatePayment', () => {
  it('pays overdue lines first, in order', () => {
    const p = plan();
    const { breakdown } = allocatePayment({ plan: p, schedule: sched(p), amount: 6500 });
    expect(breakdown).toEqual({ '2026-adm': 5000, '2026-tui-June': 1000, '2026-tui-July': 500 });
  });

  it('continues into later months once nothing is overdue, and keeps the rest unallocated', () => {
    // Admission + June..September already paid; 3 more months then leftover.
    const paid = { '2026-adm': 5000, '2026-tui-June': 1000, '2026-tui-July': 1000, '2026-tui-August': 1000, '2026-tui-September': 1000 };
    const p = plan({ componentPayments: paid, paid: 9000 });
    const { breakdown, breakdownNames } = allocatePayment({ plan: p, schedule: sched(p), amount: 2500 });
    expect(breakdown).toEqual({ '2026-tui-October': 1000, '2026-tui-November': 1000, '2026-tui-December': 500 });
    expect(breakdownNames['2026-tui-October']).toBe('Tuition');

    const all = allocatePayment({ plan: p, schedule: sched(p), amount: 8500 });
    expect(all.breakdown.Unallocated).toBe(500);
  });

  it('never parks an advance on months a leaver will not be billed for', () => {
    const paid = { '2026-adm': 5000, '2026-tui-June': 1000, '2026-tui-July': 1000 };
    const p = plan({ componentPayments: paid, paid: 7000 });
    const leaver = { enrollmentStatus: 'discontinued', discontinuation: { effectiveDate: '2026-07-20' } };
    const { breakdown } = allocatePayment({ plan: p, schedule: sched(p, leaver), amount: 1000 });
    expect(breakdown).toEqual({ Unallocated: 1000 });
  });

  it('honours the ticked dues checklist, and ignores keys that are not overdue', () => {
    const p = plan();
    const { breakdown } = allocatePayment({
      plan: p, schedule: sched(p), amount: 3000,
      selectedKeys: ['2026-tui-August', '2026-tui-December', '2026-tui-June'],
    });
    // December isn't due yet, so it can't be ticked; the rest goes unallocated.
    expect(breakdown).toEqual({ '2026-tui-August': 1000, '2026-tui-June': 1000, Unallocated: 1000 });
  });

  it('allocates against what is still outstanding on a part-paid line', () => {
    const p = plan({ componentPayments: { '2026-adm': 4000 }, paid: 4000 });
    const { breakdown } = allocatePayment({ plan: p, schedule: sched(p), amount: 1500 });
    expect(breakdown).toEqual({ '2026-adm': 1000, '2026-tui-June': 500 });
  });
});
