import { describe, it, expect } from 'vitest';
import {
  matchStatementLines, normRef, MIN_REF_LEN, MATCH_TYPE,
} from '../../../functions/src/shared/matchStatement.mjs';

/**
 * The rule under test is "never auto-match ambiguously". A wrong automatic match is worse
 * than an unmatched line: the line looks reconciled, the real payment silently stays
 * open, and nobody looks again. These cases are the ones that actually occur — two
 * students paying the same monthly fee on the same day is normal, not exotic.
 */

const D = (s) => new Date(s);
const line = (o) => ({ id: 'L1', direction: 'credit', status: 'unmatched', reference: '', description: '', ...o });
const pay = (o) => ({ id: 'p1', path: 'students/s1/transactions/p1', ref: '', date: D('2026-09-10'), ...o });

describe('normRef', () => {
  it('strips the punctuation and spacing banks apply inconsistently', () => {
    expect(normRef('utr 4312-5567 / 90')).toBe('UTR4312556790');
    expect(normRef(null)).toBe('');
  });
});

describe('matching by reference', () => {
  it('matches when the payment reference appears inside the bank narration', () => {
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 650000, valueDate: D('2026-09-10'), description: 'UPI/431234567890/FEE' })],
      payments: [pay({ amountMinor: 650000, ref: normRef('431234567890') })],
    });
    const r = results.get('L1');
    expect(r.status).toBe('matched');
    expect(r.matchType).toBe(MATCH_TYPE.REFERENCE);
    expect(r.confidence).toBe('high');
  });

  it('ignores references too short to be evidence', () => {
    // A 4-character "reference" would collide with any amount fragment in the narration.
    const short = 'AB12';
    expect(short.length).toBeLessThan(MIN_REF_LEN);
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 100, valueDate: D('2026-09-10'), description: 'PAYMENT AB12 MISC' })],
      payments: [pay({ amountMinor: 999999, ref: short })],
    });
    expect(results.get('L1').status).toBe('unmatched');
  });

  it('refuses to guess when two payments share a reference in the line', () => {
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 650000, valueDate: D('2026-09-10'), description: 'UPI/431234567890/FEE' })],
      payments: [
        pay({ id: 'p1', path: 'a', amountMinor: 650000, ref: '431234567890' }),
        pay({ id: 'p2', path: 'b', amountMinor: 650000, ref: '4312345678' }),
      ],
    });
    const r = results.get('L1');
    expect(r.status).toBe('unmatched');
    expect(r.candidates).toHaveLength(2);
    expect(r.matchNote).toMatch(/choose manually/i);
  });
});

describe('matching by amount and date', () => {
  it('matches a sole candidate inside the date window', () => {
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 450000, valueDate: D('2026-09-10') })],
      payments: [pay({ amountMinor: 450000, date: D('2026-09-08') })],
    });
    const r = results.get('L1');
    expect(r.status).toBe('matched');
    expect(r.matchType).toBe(MATCH_TYPE.AMOUNT_DATE);
    // Never "high": nothing identifies this beyond the amount lining up.
    expect(r.confidence).toBe('medium');
  });

  it('REFUSES to match when two payments share the amount and date', () => {
    // Two students paying the same monthly fee on the same day. The whole reason the
    // reference field exists.
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 650000, valueDate: D('2026-09-10') })],
      payments: [
        pay({ id: 'p1', path: 'a', amountMinor: 650000, date: D('2026-09-10') }),
        pay({ id: 'p2', path: 'b', amountMinor: 650000, date: D('2026-09-10') }),
      ],
    });
    const r = results.get('L1');
    expect(r.status).toBe('unmatched');
    expect(r.candidates).toHaveLength(2);
    expect(r.matchNote).toMatch(/bank reference would separate them/i);
  });

  it('refuses a payment outside the date window', () => {
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 450000, valueDate: D('2026-09-20') })],
      payments: [pay({ amountMinor: 450000, date: D('2026-09-01') })],
    });
    expect(results.get('L1').status).toBe('unmatched');
  });
});

describe('single assignment', () => {
  it('never lets one payment satisfy two statement lines', () => {
    const { results, usedPaymentIds } = matchStatementLines({
      lines: [
        line({ id: 'L1', amountMinor: 650000, valueDate: D('2026-09-10'), description: 'UPI/999888777666/FEE' }),
        line({ id: 'L2', amountMinor: 650000, valueDate: D('2026-09-10') }),
      ],
      payments: [pay({ id: 'p1', path: 'a', amountMinor: 650000, ref: '999888777666', date: D('2026-09-10') })],
    });
    expect(results.get('L1').status).toBe('matched');
    // L2 looks equally plausible on amount+date, but the payment is already spoken for.
    expect(results.get('L2').status).toBe('unmatched');
    expect(usedPaymentIds.size).toBe(1);
  });

  it('prefers the reference match over the amount match when both are possible', () => {
    const { results } = matchStatementLines({
      lines: [
        line({ id: 'L1', amountMinor: 650000, valueDate: D('2026-09-10') }),
        line({ id: 'L2', amountMinor: 650000, valueDate: D('2026-09-10'), description: 'UPI/555444333222/X' }),
      ],
      payments: [
        pay({ id: 'p1', path: 'a', amountMinor: 650000, ref: '555444333222', date: D('2026-09-10') }),
        pay({ id: 'p2', path: 'b', amountMinor: 650000, date: D('2026-09-10') }),
      ],
    });
    // Reference evidence is consumed first, which leaves the weaker line a clean single
    // candidate instead of an ambiguous pair.
    expect(results.get('L2').matchType).toBe(MATCH_TYPE.REFERENCE);
    expect(results.get('L2').matchedPaymentId).toBe('p1');
    expect(results.get('L1').matchedPaymentId).toBe('p2');
  });
});

describe('deposits and debits', () => {
  it('matches a cash deposit slip by value', () => {
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 1200000, valueDate: D('2026-09-12'), description: 'CASH DEP' })],
      payments: [],
      deposits: [{ id: 'd1', amountMinor: 1200000, ref: '', date: D('2026-09-12') }],
    });
    const r = results.get('L1');
    expect(r.status).toBe('matched');
    expect(r.matchType).toBe(MATCH_TYPE.DEPOSIT);
    expect(r.matchedDepositId).toBe('d1');
  });

  it('never treats a debit as settling a fee', () => {
    const { results } = matchStatementLines({
      lines: [line({ id: 'L1', direction: 'debit', amountMinor: 650000, valueDate: D('2026-09-10') })],
      payments: [pay({ amountMinor: 650000, date: D('2026-09-10') })],
    });
    expect(results.has('L1')).toBe(false);
  });

  it('reports a line with no candidate at all', () => {
    const { results } = matchStatementLines({
      lines: [line({ amountMinor: 777, valueDate: D('2026-09-10') })],
      payments: [],
    });
    expect(results.get('L1').status).toBe('unmatched');
    expect(results.get('L1').matchNote).toMatch(/no payment found/i);
  });
});
