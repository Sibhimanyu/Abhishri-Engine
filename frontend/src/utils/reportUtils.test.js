import { describe, it, expect } from 'vitest';
import { classifyIncomeTx, isLiveReceipt, localKey, toDate, normalizeClass, ALL_CLASSES } from './reportUtils';
import { requiresReference, validateReference, periodKeyOf, buildPaymentAuditFields, newIdempotencyKey } from './paymentFields';

/**
 * Regression tests for the Reports "wrong data" investigation (see the five
 * data-shape mismatches fixed alongside this file). Run with TZ=Asia/Kolkata:
 * the date tests document IST-specific behaviour.
 */

describe('classifyIncomeTx', () => {
  it('keeps an incoming payment as income even when its method was edited to Concession', () => {
    // Regression: the old rule (`method === 'Concession'` ⇒ concession) silently dropped
    // such payments from Collections while the dues engine still counted them as paid.
    expect(classifyIncomeTx({ type: 'incoming', method: 'Concession', category: 'General Fees' })).toBe('incoming');
  });

  it('classifies granted concessions as discount', () => {
    expect(classifyIncomeTx({ type: 'discount', method: 'Concession', category: 'Discount' })).toBe('discount');
  });

  it('keeps a void-of-concession in the discount bucket, not the cash-reversal bucket', () => {
    expect(classifyIncomeTx({ type: 'void', method: 'Concession', category: 'Discount' })).toBe('discount');
    expect(classifyIncomeTx({ type: 'void', category: 'Fee Concession' })).toBe('discount');
  });

  it('classifies a void of a cash payment as a reversal', () => {
    expect(classifyIncomeTx({ type: 'void', method: 'Cash', category: 'General Fees' })).toBe('void');
  });

  it('classifies a plain payment as income', () => {
    expect(classifyIncomeTx({ type: 'incoming', method: 'Cash', category: 'General Fees' })).toBe('incoming');
  });

  it('treats legacy UNTYPED concession-shaped rows as discount, not cash', () => {
    // Regression: rows with no `type` predate the current writers. The dues engine
    // counts them in neither totalPaid nor totalDiscounted, so classifying a
    // concession-shaped one as income inflated Collections by money that never moved.
    expect(classifyIncomeTx({ category: 'Fee Concession', method: 'Concession', amount: 5000 })).toBe('discount');
    expect(classifyIncomeTx({ category: 'Discount', amount: 1000 })).toBe('discount');
    expect(classifyIncomeTx({ method: 'Concession', category: 'General Fees' })).toBe('discount');
  });

  it('still treats an untyped row with normal method/category as income', () => {
    expect(classifyIncomeTx({ method: 'Cash', category: 'General Fees', amount: 500 })).toBe('incoming');
  });
});

describe('isLiveReceipt', () => {
  it('rejects voided originals so counts and ageing ignore them', () => {
    // Regression: receipt/student counts and "Last payment" treated voided receipts as real.
    expect(isLiveReceipt({ txType: 'incoming', isVoided: true })).toBe(false);
  });

  it('rejects reversal and concession rows', () => {
    expect(isLiveReceipt({ txType: 'void', isVoided: false })).toBe(false);
    expect(isLiveReceipt({ txType: 'discount', isVoided: false })).toBe(false);
  });

  it('accepts a standing receipt', () => {
    expect(isLiveReceipt({ txType: 'incoming', isVoided: false })).toBe(true);
  });
});

describe('local calendar date handling (run under TZ=Asia/Kolkata)', () => {
  it('localKey keeps an early-morning IST timestamp on its own calendar day', () => {
    // Regression: the ledger edit modal prefilled its date input via toISOString(),
    // which converts to UTC first — a payment at 00:30 IST prefilled as the PREVIOUS
    // day, and saving any edit then moved the payment back a day in every report.
    const earlyMorning = new Date(2026, 7, 30, 0, 30); // 30 Aug 2026, 00:30 IST
    expect(localKey(earlyMorning)).toBe('2026-08-30');
    // Documents why toISOString() was the bug, so this doesn't regress:
    expect(earlyMorning.toISOString().split('T')[0]).toBe('2026-08-29');
  });

  it('toDate parses Firestore-like shapes and falls back to epoch on null', () => {
    expect(toDate({ seconds: 1_756_500_000 }).getTime()).toBe(1_756_500_000_000);
    expect(toDate(null).getTime()).toBe(0);
  });
});

describe('normalizeClass', () => {
  // Regression: the live roster spells the same class several ways. Grouping on the raw
  // value split UKG into 'U.K.G' (Rs 37,500) and 'UKG' (Rs 4,500), and the class filter
  // offered a canonical 'LKG' option that matched none of the 3 real 'L.K.G' students.
  it('folds punctuation variants onto the canonical class', () => {
    expect(normalizeClass('L.K.G')).toBe('LKG');
    expect(normalizeClass('U.K.G')).toBe('UKG');
    expect(normalizeClass('l.k.g')).toBe('LKG');
  });

  it('folds spacing and case variants', () => {
    expect(normalizeClass('Play Group')).toBe('Playgroup');
    expect(normalizeClass('  playgroup ')).toBe('Playgroup');
    expect(normalizeClass('class 10')).toBe('Class 10');
  });

  it('recognises PRE-KG, which the admission form never offered', () => {
    expect(ALL_CLASSES).toContain('PRE-KG');
    expect(normalizeClass('PRE-KG')).toBe('PRE-KG');
    expect(normalizeClass('pre kg')).toBe('PRE-KG');
  });

  it('leaves genuinely different wording alone rather than guessing', () => {
    // 'Earlier PRE-KG' is not obviously the same class; merging it would be a guess.
    expect(normalizeClass('Earlier PRE-KG')).toBe('Earlier PRE-KG');
    expect(normalizeClass('Montessori')).toBe('Montessori');
  });

  it('maps blank-ish values to the empty string so they bucket as "Unspecified"', () => {
    expect(normalizeClass('')).toBe('');
    expect(normalizeClass('   ')).toBe('');
    expect(normalizeClass(null)).toBe('');
    expect(normalizeClass(undefined)).toBe('');
  });

  it('is idempotent', () => {
    expect(normalizeClass(normalizeClass('L.K.G'))).toBe('LKG');
  });
});

describe('paymentFields (Phase 1 migration)', () => {
  it('requires a reference only for methods that produce one', () => {
    expect(requiresReference('GPay/UPI')).toBe(true);
    expect(requiresReference('Bank Transfer')).toBe(true);
    expect(requiresReference('Cheque')).toBe(true);
    expect(requiresReference('Card')).toBe(true);
    // Cash reconciles via a deposit record, not a reference.
    expect(requiresReference('Cash')).toBe(false);
  });

  it('blocks an electronic payment with no reference, allows cash without one', () => {
    expect(validateReference('GPay/UPI', '')).toMatch(/reference number is required/i);
    expect(validateReference('GPay/UPI', '  ')).toMatch(/reference number is required/i);
    expect(validateReference('GPay/UPI', '431234567890')).toBe('');
    expect(validateReference('Cash', '')).toBe('');
  });

  it('derives the accounting period from the LOCAL month, not UTC', () => {
    // 1 Sep 2026 00:30 IST is 31 Aug 18:30 UTC — a UTC-derived key would file this
    // payment in the wrong accounting month.
    expect(periodKeyOf(new Date(2026, 8, 1, 0, 30))).toBe('2026-09');
    expect(periodKeyOf(new Date(2026, 11, 31, 23, 59))).toBe('2026-12');
    expect(periodKeyOf(new Date('nonsense'))).toBe('');
  });

  it('only stores a reference for methods that have one', () => {
    const cash = buildPaymentAuditFields({ receivedAt: new Date(2026, 8, 1), method: 'Cash', externalRef: 'stray', idempotencyKey: 'k1' });
    expect(cash.externalRef).toBe('');
    const upi = buildPaymentAuditFields({ receivedAt: new Date(2026, 8, 1), method: 'GPay/UPI', externalRef: ' 4312 ', idempotencyKey: 'k2' });
    expect(upi.externalRef).toBe('4312');
    expect(upi.periodKey).toBe('2026-09');
    expect(upi.idempotencyKey).toBe('k2');
    expect(upi.schemaVersion).toBe(2);
  });

  it('generates distinct idempotency keys', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
