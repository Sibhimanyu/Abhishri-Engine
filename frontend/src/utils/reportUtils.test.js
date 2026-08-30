import { describe, it, expect } from 'vitest';
import { classifyIncomeTx, isLiveReceipt, localKey, toDate } from './reportUtils';

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
