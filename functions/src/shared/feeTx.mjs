/**
 * THE single source of truth for classifying a fee-ledger transaction.
 *
 * Consumed by BOTH sides of the system:
 *   - frontend: re-exported through frontend/src/utils/reportUtils.js and used by
 *     the Reports tab, the All Transactions ledger and the dashboard revenue tile
 *   - backend:  functions/src/fees/triggers.js (reconcileStudent), which computes
 *     every student's dueNow/totalPaid/totalDiscounted
 *
 * It lives under functions/ because a Cloud Functions deploy only uploads this
 * directory; the frontend can import across the repo, the deploy bundle cannot.
 * Plain ESM so Vite consumes it natively; the CommonJS functions code loads it
 * with a dynamic import().
 *
 * History (why this rule is shaped this way — see PRs #3/#4):
 *   - method is deliberately NOT consulted on typed rows: a type:'incoming' payment
 *     whose method was edited to 'Concession' is still money the dues engine counts
 *     as paid, so treating it as non-cash made screens disagree by that amount.
 *   - voids copy the original's category, so a void-of-concession is identified by
 *     category ('Discount'/'Fee Concession') and stays non-cash.
 *   - rows with NO type predate the current writers; the broader concession match
 *     (category OR method) applies only to them.
 */
const CONCESSION_CATEGORIES = ['Discount', 'Fee Concession'];

export function classifyIncomeTx(t) {
  const concessionShaped = CONCESSION_CATEGORIES.includes(t.category);
  const isConcession = t.type === 'discount' ||
    (t.type === 'void' && concessionShaped) ||
    (!t.type && (concessionShaped || t.method === 'Concession'));
  return isConcession ? 'discount' : t.type === 'void' ? 'void' : 'incoming';
}
