import { describe, it, expect } from 'vitest';
import { parseStatementDate, parseAmount, detectColumns, buildLines } from './statementParse';

describe('parseStatementDate', () => {
  it('reads DD/MM/YYYY the Indian way, not the US way', () => {
    // The whole reason this function exists: new Date('03/09/2026') is 9 MARCH in JS,
    // which would mis-file every payment made in the first twelve days of a month.
    expect(new Date('03/09/2026').getMonth()).toBe(2); // documents the trap
    const d = parseStatementDate('03/09/2026', 'DMY');
    expect(d.getDate()).toBe(3);
    expect(d.getMonth()).toBe(8); // September
  });

  it('honours an explicit MDY order when the bank really is month-first', () => {
    const d = parseStatementDate('03/09/2026', 'MDY');
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(9);
  });

  it('treats ISO as unambiguous regardless of the selected order', () => {
    const d = parseStatementDate('2026-09-03', 'MDY');
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(3);
  });

  it('reads dd-MMM-yyyy, common on Indian statements', () => {
    const d = parseStatementDate('03-Sep-2026', 'DMY');
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(3);
  });

  it('expands two-digit years', () => {
    expect(parseStatementDate('03/09/26', 'DMY').getFullYear()).toBe(2026);
  });

  it('rejects an impossible date instead of rolling it into the next month', () => {
    // new Date(2026, 1, 31) silently becomes 3 March. A statement saying 31/02 is a
    // parsing failure, and must not be accepted as a real date.
    expect(parseStatementDate('31/02/2026', 'DMY')).toBeNull();
    expect(parseStatementDate('', 'DMY')).toBeNull();
    expect(parseStatementDate('not a date', 'DMY')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('handles thousands separators and currency noise', () => {
    expect(parseAmount('1,23,456.78')).toBeCloseTo(123456.78);
    expect(parseAmount('₹ 4,500.00')).toBeCloseTo(4500);
  });

  it('reads Cr/Dr markers and parentheses as sign', () => {
    expect(parseAmount('4,500.00 Cr')).toBeCloseTo(4500);
    expect(parseAmount('4,500.00 Dr')).toBeCloseTo(-4500);
    expect(parseAmount('(4,500.00)')).toBeCloseTo(-4500);
  });

  it('returns null for a blank cell rather than zero', () => {
    // Banks leave the credit column empty to mean "this row is a debit". Reading that as
    // 0 would manufacture phantom zero-value rows.
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });
});

describe('detectColumns', () => {
  it('recognises a split debit/credit statement', () => {
    const m = detectColumns(['Txn Date', 'Narration', 'Chq No', 'Withdrawal Amt', 'Deposit Amt', 'Balance']);
    expect(m.valueDate).toBe('Txn Date');
    expect(m.description).toBe('Narration');
    expect(m.reference).toBe('Chq No');
    expect(m.credit).toBe('Deposit Amt');
    expect(m.debit).toBe('Withdrawal Amt');
    expect(m.splitColumns).toBe(true);
    expect(m.amount).toBe('');
  });

  it('recognises a single-amount statement', () => {
    const m = detectColumns(['Value Date', 'Description', 'Reference No', 'Amount']);
    expect(m.splitColumns).toBe(false);
    expect(m.amount).toBe('Amount');
    expect(m.reference).toBe('Reference No');
  });
});

describe('buildLines', () => {
  const mapping = {
    valueDate: 'Date', description: 'Narration', reference: 'Ref',
    credit: 'Deposit', debit: 'Withdrawal', amount: '', splitColumns: true,
  };

  it('derives sign from which of the split columns is filled', () => {
    const { lines, errors } = buildLines([
      { Date: '03/09/2026', Narration: 'UPI FEE', Ref: '4312', Deposit: '6,500.00', Withdrawal: '' },
      { Date: '04/09/2026', Narration: 'BANK CHG', Ref: '', Deposit: '', Withdrawal: '118.00' },
    ], mapping, 'DMY');
    expect(errors).toHaveLength(0);
    expect(lines[0].amount).toBeCloseTo(6500);
    expect(lines[1].amount).toBeCloseTo(-118);
    expect(new Date(lines[0].valueDate).getMonth()).toBe(8); // September, not March
  });

  it('skips footer and carried-forward rows without calling them errors', () => {
    const { lines, errors } = buildLines([
      { Date: '', Narration: 'Opening Balance', Ref: '', Deposit: '', Withdrawal: '' },
      { Date: '03/09/2026', Narration: 'UPI', Ref: '', Deposit: '100', Withdrawal: '' },
    ], mapping, 'DMY');
    expect(lines).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('names the row when a date cannot be read, so the mapping can be fixed', () => {
    const { lines, errors } = buildLines([
      { Date: 'garbage', Narration: 'x', Ref: '', Deposit: '100', Withdrawal: '' },
    ], mapping, 'DMY');
    expect(lines).toHaveLength(0);
    expect(errors[0]).toMatch(/Row 2/);
    expect(errors[0]).toMatch(/garbage/);
  });
});
