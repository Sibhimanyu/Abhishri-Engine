// Role-based fee access, shared by the fee screens. The PRO role is "fee entry only":
// it can log and void payments but never sees totals, reports or settings.
// `perms` is userData.permissions.fees_accounting; `isAdmin` covers admin/master users.
export function feeAccess(perms, isAdmin = false) {
  const p = perms && typeof perms === 'object' ? perms : {};
  const master = !!isAdmin || perms === true;
  const canSeeTotals = master || !!(p.view || p.ledger || p.view_dashboard);
  return {
    canLog: master || !!p.trans_add,
    canVoid: master || !!p.trans_void,
    canConfig: master || !!p.config,
    canSeeTotals,
    // Who may see the All Transactions tab (it listens to every payment).
    canSeeAllTransactions: canSeeTotals,
    canOpenFeeCollection: master || !!(p.view || p.ledger || p.config || p.trans_add),
    canSeeLedgerTabs: master || !!(p.ledger || p.trans_add),
  };
}
