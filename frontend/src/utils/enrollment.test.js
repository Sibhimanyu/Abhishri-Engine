import { describe, it, expect } from 'vitest';
import { isDiscontinued, getEnrollmentStatus, getDiscontinuationDate, billableInstallments, billingSchedule, isEnrolledOn, isOnRolls } from './reportUtils';

/**
 * The billing cutoff for a student who leaves mid-year. This rule is shared verbatim
 * with the backend dues engine (functions/src/fees/triggers.js), so a disagreement here
 * means the ledger screen and the arrears reports would quote different amounts.
 *
 * Run with TZ=Asia/Kolkata, like the rest of the suite.
 */

// June start (startMonth 5) is the school's academic year.
const PLAN = { startMonth: 5, billingCycle: 12, academicStartYear: 2026 };
const SEPT = new Date(2026, 8, 21);

const leaver = (effectiveDate, extra = {}) => ({
  enrollmentStatus: 'discontinued',
  discontinuation: { effectiveDate, ...extra }
});

describe('enrollment status', () => {
  it('treats a record with no enrollmentStatus as active', () => {
    // Every student admitted before this feature shipped has no such field.
    expect(getEnrollmentStatus({ name: 'Old Record' })).toBe('active');
    expect(isDiscontinued({ name: 'Old Record' })).toBe(false);
  });

  it('reads the exit date only for a discontinued student', () => {
    expect(getDiscontinuationDate(leaver('2026-07-15'))).toEqual(new Date(2026, 6, 15));
    // A stale discontinuation record left on a re-enrolled student must not bill-cap them.
    expect(getDiscontinuationDate({ enrollmentStatus: 'active', discontinuation: { effectiveDate: '2026-07-15' } })).toBeNull();
  });
});

describe('billableInstallments', () => {
  it('bills an active student up to the current month', () => {
    // June, July, August, September.
    expect(billableInstallments(PLAN, {}, SEPT)).toBe(4);
  });

  it('stops billing at the exit month for a student who left', () => {
    // Left 15 July: June + July only, even though it is now September.
    expect(billableInstallments(PLAN, leaver('2026-07-15'), SEPT)).toBe(2);
  });

  it('drops the exit month when the school waived it', () => {
    expect(billableInstallments(PLAN, leaver('2026-07-15', { waiveFinalMonth: true }), SEPT)).toBe(1);
  });

  it('never bills past today, even if the exit date is in the future', () => {
    // A notice period recorded in advance must not pull unearned months forward.
    expect(billableInstallments(PLAN, leaver('2027-01-10'), SEPT)).toBe(4);
  });

  it('bills an enrolled student at least the first month', () => {
    // Plan starts in June; it is only May.
    expect(billableInstallments(PLAN, {}, new Date(2026, 4, 10))).toBe(1);
  });

  it('bills nothing monthly to a student who left before the year opened', () => {
    expect(billableInstallments(PLAN, leaver('2026-04-02'), SEPT)).toBe(0);
    expect(billingSchedule(PLAN, leaver('2026-04-02'), SEPT).chargeable).toEqual([]);
  });

  it('bills the first month to a student who left during it with it not waived', () => {
    expect(billableInstallments(PLAN, leaver('2026-06-03'), SEPT)).toBe(1);
    expect(billableInstallments(PLAN, leaver('2026-06-03', { waiveFinalMonth: true }), SEPT)).toBe(0);
  });

  it('never exceeds the billing cycle', () => {
    const shortCycle = { ...PLAN, billingCycle: 10 };
    expect(billableInstallments(shortCycle, {}, new Date(2027, 4, 1))).toBe(10);
    expect(billableInstallments(shortCycle, leaver('2027-04-30'), new Date(2027, 4, 1))).toBe(10);
  });

  it('accepts a Firestore Timestamp exit date', () => {
    const ts = { toDate: () => new Date(2026, 6, 15) };
    expect(billableInstallments(PLAN, leaver(ts), SEPT)).toBe(2);
  });
});

describe('plans saved without academicStartYear', () => {
  // Older plans roll over every June, so the year must come from today, not the exit date.
  const LEGACY = { startMonth: 5, billingCycle: 12 };

  it('does not bill this year for a student who left last academic year', () => {
    // Left March 2026 (the 2025-26 year); it is now September 2026. Previously this
    // read the year from the exit date and billed June-September 2026.
    expect(billableInstallments(LEGACY, leaver('2026-03-15'), SEPT)).toBe(0);
    expect(billingSchedule(LEGACY, leaver('2026-03-15'), SEPT).chargeable).toEqual([]);
  });

  it('still caps a same-year leaver at the exit month', () => {
    expect(billableInstallments(LEGACY, leaver('2026-07-15'), SEPT)).toBe(2);
  });
});

describe('re-enrollment after a gap', () => {
  const returned = (exit, back, extra = {}) => ({
    enrollmentStatus: 'active',
    discontinuation: null,
    discontinuationHistory: [{ effectiveDate: exit, reEnrolledOn: back, ...extra }]
  });

  it('skips the months between the exit month and the return month', () => {
    // Left 15 July, back 2 September: June, July billed; August skipped; September billed.
    const s = billingSchedule(PLAN, returned('2026-07-15', '2026-09-02'), SEPT);
    expect(s.due).toEqual([0, 1, 3]);
    expect(s.paused).toEqual([2]);
    expect(s.isChargeable(2)).toBe(false);
    // The rest of the year is still owed.
    expect(s.chargeable).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(billableInstallments(PLAN, returned('2026-07-15', '2026-09-02'), SEPT)).toBe(3);
  });

  it('also skips the exit month when it was waived', () => {
    const s = billingSchedule(PLAN, returned('2026-07-15', '2026-09-02', { waiveFinalMonth: true }), SEPT);
    expect(s.due).toEqual([0, 3]);
  });

  it('skips nothing when they came back within the same month', () => {
    const s = billingSchedule(PLAN, returned('2026-07-10', '2026-07-25'), SEPT);
    expect(s.paused).toEqual([]);
    expect(s.due).toEqual([0, 1, 2, 3]);
  });

  it('reads the return month from a UTC timestamp in local time', () => {
    // 00:30 IST on 1 September is still 31 August in UTC. Local time says September.
    const back = new Date(2026, 8, 1, 0, 30).toISOString();
    const student = {
      enrollmentStatus: 'active',
      discontinuationHistory: [{ effectiveDate: '2026-07-15', reEnrolledAt: back }]
    };
    expect(billingSchedule(PLAN, student, SEPT).paused).toEqual([2]);
  });

  it('ignores an absence from an earlier academic year', () => {
    const s = billingSchedule(PLAN, returned('2025-11-10', '2026-02-01'), SEPT);
    expect(s.paused).toEqual([]);
    expect(s.due).toEqual([0, 1, 2, 3]);
  });

  it('combines an earlier gap with a later exit', () => {
    const student = {
      enrollmentStatus: 'discontinued',
      discontinuation: { effectiveDate: '2026-11-20' },
      discontinuationHistory: [{ effectiveDate: '2026-07-15', reEnrolledOn: '2026-09-02' }]
    };
    const s = billingSchedule(PLAN, student, new Date(2027, 0, 5));
    // June, July, (Aug skipped), Sept, Oct, Nov.
    expect(s.due).toEqual([0, 1, 3, 4, 5]);
    expect(s.chargeable).toEqual([0, 1, 3, 4, 5]);
  });
});

describe('final settlement with an exit date still ahead', () => {
  it('owes through the exit month even though those months are not due yet', () => {
    const s = billingSchedule(PLAN, leaver('2026-11-30'), SEPT);
    expect(s.due).toEqual([0, 1, 2, 3]);
    expect(s.chargeable).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('isEnrolledOn (attendance, head counts, broadcasts)', () => {
  const day = (y, m, d) => new Date(y, m - 1, d);

  it('is always true for an active student with no history', () => {
    expect(isEnrolledOn({}, day(2026, 9, 21))).toBe(true);
  });

  it('includes the exit day and nothing after it', () => {
    const s = leaver('2026-07-15');
    expect(isEnrolledOn(s, day(2026, 7, 15))).toBe(true);
    expect(isEnrolledOn(s, day(2026, 7, 16))).toBe(false);
    expect(isEnrolledOn(s, day(2026, 7, 1))).toBe(true);
  });

  it('keeps a student serving notice on the rolls until the exit date', () => {
    expect(isOnRolls(leaver('2026-10-31'), SEPT)).toBe(true);
    expect(isOnRolls(leaver('2026-09-01'), SEPT)).toBe(false);
  });

  it('treats a discontinued record with no usable date as gone', () => {
    expect(isOnRolls({ enrollmentStatus: 'discontinued' }, SEPT)).toBe(false);
  });

  it('excludes the days spent away before a re-enrollment', () => {
    const s = { discontinuationHistory: [{ effectiveDate: '2026-07-15', reEnrolledOn: '2026-09-02' }] };
    expect(isEnrolledOn(s, day(2026, 7, 15))).toBe(true);
    expect(isEnrolledOn(s, day(2026, 8, 10))).toBe(false);
    expect(isEnrolledOn(s, day(2026, 9, 2))).toBe(true);
  });
});
