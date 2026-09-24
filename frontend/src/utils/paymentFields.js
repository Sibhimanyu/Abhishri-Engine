/**
 * Phase 1 of the payments data-model migration (docs/payments-data-model-review.md).
 *
 * These fields are ADDITIVE. Existing documents are never rewritten by this module and
 * the legacy `timestamp` field keeps being written exactly as before, so every reader
 * that predates this change carries on working untouched.
 *
 * What they buy:
 *   externalRef     the bank/UPI reference. Without it a payment can never be matched
 *                   to a bank statement line — 108 existing payments are unmatchable
 *                   for exactly this reason, which is why capture starts now.
 *   receivedAt      value date: when the money actually moved (what the bank shows).
 *   recordedAt      entry date: when staff typed it in (what an auditor asks about).
 *                   One combined field could answer neither question.
 *   periodKey       'YYYY-MM' of receivedAt, in IST. Drives period-close checks later.
 *   idempotencyKey  doubles as the document id, so a double-submit overwrites the same
 *                   document instead of creating a second payment.
 */

import { requiresReference } from '../../../functions/src/shared/paymentRules.mjs';

// The method/reference rules are shared with the logPayment callable and ported to the
// iOS app, so all three agree on which payments need a bank reference.
export {
  PAYMENT_METHODS,
  REFERENCE_REQUIRED_METHODS,
  requiresReference,
} from '../../../functions/src/shared/paymentRules.mjs';

/**
 * 'YYYY-MM' in the LOCAL calendar, never via toISOString(): a payment received at
 * 00:30 IST on 1 September is 18:30 UTC on 31 August, which would file it in the
 * wrong accounting month — precisely the class of bug already fixed for day keys.
 */
export function periodKeyOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * A fresh idempotency key. crypto.randomUUID() needs a secure context, which
 * production (https) always has; the fallback keeps local http dev working rather
 * than throwing at the moment someone records a payment.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export { validateReference } from '../../../functions/src/shared/paymentRules.mjs';

/**
 * The additive Phase 1 fields for one payment write.
 * `receivedAt` is the caller-chosen value date (or now when left blank).
 */
export function buildPaymentAuditFields({ receivedAt, method, externalRef, idempotencyKey }) {
  return {
    externalRef: requiresReference(method) ? String(externalRef || '').trim() : '',
    receivedAt,
    periodKey: periodKeyOf(receivedAt),
    idempotencyKey,
    schemaVersion: 2,
  };
}
