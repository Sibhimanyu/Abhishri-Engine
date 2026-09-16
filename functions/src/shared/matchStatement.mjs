/**
 * Bank statement matching — pure logic, no Firestore.
 *
 * Extracted so it can be unit-tested directly. Money-matching rules are exactly the kind
 * of thing that looks obviously right and is quietly wrong at the edges, and the edges
 * here (two payments of the same amount on the same day) are common rather than exotic.
 *
 * THE RULE THAT MATTERS: an automatic match is only made when it is unambiguous. If two
 * payments could equally explain a line, the line stays unmatched and records its
 * candidates for a human. A wrong auto-match is far worse than an unmatched line — the
 * line looks reconciled, the real payment silently stays open, and nobody looks again.
 */

export const MATCH_TYPE = {
  REFERENCE: 'reference',
  DEPOSIT: 'deposit',
  AMOUNT_DATE: 'amount-date',
};

/** Uppercase alphanumerics only: banks pad, space and punctuate references inconsistently. */
export const normRef = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * A reference must be long enough to be evidence. Four characters would collide with any
 * amount or account fragment in the narration and produce confident nonsense.
 */
export const MIN_REF_LEN = 6;

/** How far a value date may drift from the recorded date before an amount match is refused. */
export const DATE_WINDOW_DAYS = 4;

const daysBetween = (a, b) => Math.abs((a - b) / 86400000);

/**
 * Has an earlier pass already reached a verdict on this line?
 *
 * A match settles it. So does a recorded ambiguity: when pass 1 found two payments whose
 * references both appear in the line, that IS the finding, and letting pass 3 overwrite
 * it with "two payments share this amount" would replace a precise diagnosis with a
 * vaguer one and hide the reference collision from whoever has to resolve it.
 */
const settled = (results, id) => {
  const r = results.get(id);
  return !!r && (r.status === 'matched' || (r.candidates && r.candidates.length > 0));
};

/**
 * @param lines    [{ id, direction, status, amountMinor, valueDate:Date, reference, description }]
 * @param payments [{ id, path, amountMinor, ref (normalised), date:Date, studentName }]
 * @param deposits [{ id, amountMinor, ref (normalised), date:Date }]
 * @returns { results: Map<lineId, result>, usedPaymentIds:Set, usedDepositIds:Set }
 */
export function matchStatementLines({ lines, payments, deposits = [] }) {
  const usedPayments = new Set();
  const usedDeposits = new Set();
  const results = new Map();

  // Credits only. A debit cannot settle a fee; debits are carried so the statement stays
  // whole and its totals visibly tie out, but they are never match candidates.
  const credits = lines.filter((l) => l.direction === 'credit' && l.status !== 'ignored');
  const hay = (l) => normRef(`${l.reference || ''} ${l.description || ''}`);

  // pass 1 — the payment's own reference appears in the line. Strongest evidence: it is
  // the bank's identifier for the same movement of money.
  for (const l of credits) {
    const h = hay(l);
    const hits = payments.filter(
      (p) => !usedPayments.has(p.id) && p.ref && p.ref.length >= MIN_REF_LEN && h.includes(p.ref)
    );
    if (hits.length === 1) {
      usedPayments.add(hits[0].id);
      results.set(l.id, {
        status: 'matched', matchedPaymentPath: hits[0].path, matchedPaymentId: hits[0].id,
        matchType: MATCH_TYPE.REFERENCE, confidence: 'high',
        matchNote: `Reference ${hits[0].ref} found in the statement line.`,
      });
    } else if (hits.length > 1) {
      results.set(l.id, {
        status: 'unmatched', matchType: null, confidence: null,
        matchNote: `${hits.length} payments share a reference appearing in this line; choose manually.`,
        candidates: hits.slice(0, 5).map((h2) => h2.path),
      });
    }
  }

  // pass 2 — cash/cheque deposit slips. Cash reaches the bank as one aggregated credit.
  for (const l of credits) {
    if (settled(results, l.id)) continue;
    const h = hay(l);
    const hits = deposits.filter(
      (d) => !usedDeposits.has(d.id) &&
        ((d.ref && d.ref.length >= MIN_REF_LEN && h.includes(d.ref)) || d.amountMinor === l.amountMinor)
    );
    if (hits.length === 1) {
      usedDeposits.add(hits[0].id);
      const byRef = !!(hits[0].ref && h.includes(hits[0].ref));
      results.set(l.id, {
        status: 'matched', matchedDepositId: hits[0].id, matchType: MATCH_TYPE.DEPOSIT,
        confidence: byRef ? 'high' : 'medium',
        matchNote: byRef ? `Deposit slip ${hits[0].ref} found in the line.` : `Cash deposit of the same value.`,
      });
    }
  }

  // pass 3 — sole candidate on amount within the date window. Weakest: no identifier
  // confirms it, so it is recorded as medium confidence for a human to sanity-check.
  for (const l of credits) {
    if (settled(results, l.id)) continue;
    const hits = payments.filter(
      (p) => !usedPayments.has(p.id) && p.amountMinor === l.amountMinor &&
        p.date && l.valueDate && daysBetween(p.date, l.valueDate) <= DATE_WINDOW_DAYS
    );
    if (hits.length === 1) {
      usedPayments.add(hits[0].id);
      results.set(l.id, {
        status: 'matched', matchedPaymentPath: hits[0].path, matchedPaymentId: hits[0].id,
        matchType: MATCH_TYPE.AMOUNT_DATE, confidence: 'medium',
        matchNote: `Only payment of this amount within ${DATE_WINDOW_DAYS} days. No reference to confirm it.`,
      });
    } else if (hits.length > 1) {
      // Precisely the situation that makes capturing a reference at entry worth doing.
      results.set(l.id, {
        status: 'unmatched', matchType: null, confidence: null,
        matchNote: `${hits.length} payments of this amount fall in the date window. A bank reference would separate them.`,
        candidates: hits.slice(0, 5).map((h2) => h2.path),
      });
    }
  }

  // Anything still unseen had no candidate at all.
  for (const l of credits) {
    if (!results.has(l.id)) {
      results.set(l.id, {
        status: 'unmatched', matchType: null, confidence: null,
        matchNote: 'No payment found for this line.', candidates: [],
      });
    }
  }

  return { results, usedPaymentIds: usedPayments, usedDepositIds: usedDeposits };
}
