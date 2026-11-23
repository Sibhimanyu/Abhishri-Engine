import { describe, it, expect } from 'vitest';
import { feeAccess } from './feeAccess';

const pro = { trans_add: true, trans_void: true, exp_own: true, wallet_view_own: true };

describe('feeAccess', () => {
  it('PRO can log and void but sees no totals or settings', () => {
    const a = feeAccess(pro, false);
    expect(a.canLog).toBe(true);
    expect(a.canVoid).toBe(true);
    expect(a.canSeeTotals).toBe(false);
    expect(a.canSeeAllTransactions).toBe(false);
    expect(a.canConfig).toBe(false);
    expect(a.canOpenFeeCollection).toBe(true);
    expect(a.canSeeLedgerTabs).toBe(true);
  });
  it('admin gets everything', () => {
    const a = feeAccess({}, true);
    expect(Object.values(a).every(Boolean)).toBe(true);
  });
  it('trans_add alone cannot void', () => {
    expect(feeAccess({ trans_add: true }, false).canVoid).toBe(false);
  });
  it('ledger/view/view_dashboard see totals', () => {
    for (const k of ['view', 'ledger', 'view_dashboard']) expect(feeAccess({ [k]: true }).canSeeTotals).toBe(true);
  });
  it('empty perms get nothing', () => {
    const a = feeAccess(undefined, false);
    expect(Object.values(a).some(Boolean)).toBe(false);
  });
});
