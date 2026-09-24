/**
 * Payment-entry rules shared by the web (frontend/src/utils/paymentFields.js re-exports
 * them), the logPayment callable, and, by port, the iOS app (AbhishriCore/Payments.swift).
 */

/** Every method a payment can be recorded with, in the order the forms offer them. */
export const PAYMENT_METHODS = ['Cash', 'GPay/UPI', 'Bank Transfer', 'Cheque', 'Card'];

/** Methods where a payment lands in a bank account and therefore has a reference to capture. */
export const REFERENCE_REQUIRED_METHODS = ['GPay/UPI', 'Bank Transfer', 'Cheque', 'Card'];

/** Cash has no external reference; it is reconciled through a deposit record instead. */
export const requiresReference = (method) => REFERENCE_REQUIRED_METHODS.includes(method);

/**
 * Validate the reference before a write. Returns an error string, or '' when fine,
 * so callers can surface it without this module knowing about the UI.
 */
export function validateReference(method, externalRef) {
  if (!requiresReference(method)) return '';
  if (!String(externalRef || '').trim()) {
    return `A reference number is required for ${method} payments so it can be matched against the bank statement.`;
  }
  return '';
}
