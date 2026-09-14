# Payments data model — engineering review

**Question asked:** is the current structure good enough to build reconciliation on?

**Verdict: no — but it does not need a rewrite.** The model is sound for what it was
built to do (record payments, show balances). It is missing four things that
reconciliation *structurally* requires. Three of them are cheap to add now and
expensive to retrofit after you have another year of data.

Every number below was measured against the live database, not inferred from code.

---

## 1. What is already right

Worth stating, because it means this is an extension rather than a rebuild:

- **Money arithmetic reconciles exactly.** `sum(financialSummary.totalPaid)`,
  `sum(live incoming tx)` and `gross + voids` all agree at ₹612,600.
- **Reversals already exist as first-class rows.** Voiding writes a negative
  `type:'void'` row rather than deleting — the right instinct, and the seed of a
  proper journal.
- **Transaction integrity is clean.** Every `studentId` resolves, every timestamp is
  a real `Timestamp`, all payments live under one path (`students/{id}/transactions`).
- **Expense security rules are genuinely well-hardened** (self-attribution enforced,
  wallet spoofing closed, `funding` blocked for non-`exp_all`).

---

## 2. What blocks reconciliation

### 2.1 No external payment reference — the hard blocker

| method | count | reconcilable against a bank statement today? |
|---|---|---|
| GPay/UPI | 104 | **no** |
| Cash | 51 | no — no deposit record either |
| Bank Transfer | 2 | **no** |
| Card | 2 | **no** |

There is no `utr` / `referenceNumber` / `instrumentRef` field anywhere on the
transaction document. **108 electronic payments have nothing to match a bank line
against.** Reconciliation is not "hard" without this — it is impossible. You would be
matching on `(amount, date)` alone, which collides constantly (see 2.5).

This is the single highest-value change, and it is also the cheapest: one field plus
one input box. Every day it is not there produces more unreconcilable history.

### 2.2 Two competing answers to "which fee did this payment settle?"

There are **two independent allocation algorithms** that do not agree:

- **Client:** `allocateFunds()` in `StudentLedgerView.jsx` writes `breakdown` onto each
  transaction at payment time.
- **Server:** `reconcileStudent()` in `functions/src/fees/triggers.js` recomputes
  `componentPayments` on the plan with its own greedy fill — **ignoring `breakdown`
  entirely.**

Measured: **13 of 49 students with a plan (27%) disagree.** Example (Shree Rudhran):

```
from transactions: June 4500, July 4500, Aug 4500, Sep 4000
plan says        : June 6200, July 6500, Aug 6500, Sep 2000
```

Worse, because fee-plan edits regenerate component UIDs, **10 allocation lines worth
₹35,900 point at component UIDs that no longer exist in the student's plan.** One
student's transactions reference `comp_1784528122414_*` while the plan now only
contains `comp_1788855694580_*`.

A reconciliation system has to answer "what was this money applied to". Right now that
question has two answers and they differ a quarter of the time.

### 2.3 The ledger is mutable, so history is not stable

`allow update` and `allow delete` are both open on transactions, and editing a payment
**re-runs allocation**. Measured: **17 of 173 transactions (10%) were modified after
creation.**

Consequence: you cannot answer *"what did the books say on 31 August?"* — because the
August rows may have changed since. Any reconciliation you sign off can be silently
invalidated afterwards, with no record that it happened.

### 2.4 No separation of "when money arrived" from "when it was typed in"

**155 of 159 payments carry a date-only timestamp** (backdated via the date picker).
There is exactly one time field, so the system cannot distinguish:

- value date (when the money actually moved — what the bank statement shows), from
- entry date (when staff recorded it — what an auditor asks about).

Bank reconciliation matches on value date. Cut-off testing needs both.

### 2.5 No idempotency, and duplicates already exist

**7 groups** of (same student, same amount, same day). At least one is a likely
re-entry rather than two genuine payments:

```
d2Gl3xCFCFSTRRZLfsiC  created 08:54  desc "Fee Payment"
p15YocJ9wNyYZd1D4q7o  created 09:12  desc "August "
```

Same student, same ₹4,500, same value date, 18 minutes apart. No client-supplied
idempotency key exists to prevent or detect this. (These need a human decision —
I have not touched them.)

### 2.6 Derived balances are stored as authoritative state

`financialSummary` (student), `componentPayments`/`paid` (plan) and `walletBalance`
(staff) are all caches of a computation, stored as if they were facts. **Two drift
bugs have already been found and fixed in this codebase** — the wallet balance that
read ₹1,000 against a true ₹45 for six weeks, and the fee-status mismatch. A
reconciliation system that trusts a cache inherits every drift bug forever.

### 2.7 Missing entirely: settlement and period close

- **Settlement:** 51 cash payments, and nothing records when (or whether) they were
  banked. Cash-in-hand is unauditable.
- **Period close:** nothing marks a month as closed, and backdating is unrestricted.
  A reconciled period can be altered afterwards with no trace.

### 2.8 Money as floating point

Amounts are JS numbers (Firestore doubles). All happen to be integers today, but the
moment a percentage concession or a split payment produces ₹4,166.67, rounding drift
starts — and it will land in exactly the totals you are trying to reconcile.

---

## 3. Target model

The principle: **an append-only journal, with every balance as a rebuildable
projection.** Nothing below requires abandoning Firestore or the existing screens.

```
payments/{paymentId}                       # append-only. never updated, never deleted
  studentId, amountMinor: int, currency: 'INR'
  method, externalRef, instrumentHint
  receivedAt   # value date — what the bank sees
  recordedAt, recordedBy
  idempotencyKey              # unique; blocks double-submit
  periodKey: '2026-09'        # derived from receivedAt; drives close checks
  status: 'posted' | 'reversed'
  reversalOf / reversedBy     # corrections post a reversal, never an edit
  depositId?                  # settlement link

allocations/{allocationId}                 # append-only, separate from the payment
  paymentId, studentId
  planVersionId, componentUid, periodKey   # versioned -> orphan UIDs impossible
  amountMinor
  reversalOf?                              # re-allocation without touching the payment

students/{id}/fee_plan_versions/{versionId}  # immutable snapshots
  components[], annualNetFee, startMonth, billingCycle, academicStartYear
  effectiveFrom, supersededBy

deposits/{depositId}                       # settlement: cash/cheque -> bank
  bankAccountId, depositedAt, amountMinor, reference, status

periods/{'2026-09'}                        # close control
  status: 'open' | 'closed', closedAt, closedBy, totals{}

reconciliations/{runId}                    # the thing you want to build
  periodKey, source: 'bank' | 'internal', status
  /lines/{n}: externalRef, amountMinor, valueDate, matchedPaymentId?, status
```

Everything currently stored as a balance (`financialSummary`, `componentPayments`,
`walletBalance`) stays — but demoted to an explicitly-labelled **projection**, with a
`computedFrom` marker so staleness is detectable, and a rebuild job that can
regenerate it from the journal at any time.

### Two deliberate non-changes

- **Keep payments under `students/{id}`** rather than moving to a root collection.
  Collection-group queries already work and are indexed; the subcollection gives
  natural per-student rules. The nesting is not what is broken.
- **Keep the existing void/reversal pattern.** It is already correct — just extend it
  from "voids only" to "all corrections".

---

## 4. Migration plan

Ordered by *cost of delay*, not by size. Phase 1 is the one that matters.

### Phase 1 — stop creating unreconcilable data (do first, ~half a day)

Purely additive. No migration, no breaking change, nothing to backfill.

1. Add `externalRef` to the payment form — required for GPay/UPI, Bank Transfer and
   Cheque; optional for Cash. **This is the single highest-value change in this
   document.**
2. Split `receivedAt` (value date, from the picker) from `recordedAt`
   (`serverTimestamp()`). Keep writing `timestamp` as today so nothing breaks.
3. Write `idempotencyKey` (client-generated UUID per submit) and reject duplicates.
4. Write `periodKey` derived from `receivedAt`.

After this, every *new* payment is reconcilable. The existing 108 are not, and never
fully will be — which is exactly why this is Phase 1.

### Phase 2 — one allocation truth (~1 day)

5. Pick a winner. Recommendation: **the transaction's `breakdown` is authoritative**
   (it records intent at the moment of payment); `reconcileStudent` stops re-deriving
   and instead *sums* allocations. This also makes the dues engine cheaper.
6. Introduce `fee_plan_versions` so component UIDs are stable across plan edits, and
   repoint the 10 orphaned allocation lines (₹35,900) at the correct version.
7. Backfill `allocations/` from existing `breakdown` maps.

### Phase 3 — immutability (~1 day)

8. Rules: `allow update, delete: if false` on payments for everyone (admins included).
9. Convert the edit modal into "post a correction" — writes a reversal plus a
   replacement, preserving both. The UI can still *present* it as an edit.
10. Keep a legacy-edit escape hatch behind an admin flag for a short window.

### Phase 4 — reconciliation foundations (~2–3 days)

11. `deposits` + a "bank this cash" screen; link payments to deposits.
12. `periods` + close action; rules deny writes into a closed period, forcing an
    adjustment in the open one.
13. `reconciliations` + a statement-import/matching screen — the actual feature. This
    is straightforward *once* 1–12 exist, and near-impossible before.

### Phase 5 — hardening (opportunistic)

14. Migrate `amount` → `amountMinor` (integer paise) with a dual-write window.
15. Nightly projection-rebuild job that recomputes every balance from the journal and
    alerts on mismatch — turns the drift class of bug into a monitored signal rather
    than a silent wrong number.

---

## 5. If you only do one thing

**Phase 1, this week.** It is a field on a form and four lines in the write path. Every
day it is deferred adds ~2 more payments that can never be matched to a bank line, and
the reconciliation system you are about to build is only as good as the oldest payment
it can match.

Phases 2–3 are genuinely important but they are *repairs* — they can be done in
parallel with building the reconciliation UI. Phase 1 is a one-way door: unrecorded
reference numbers cannot be recovered later.
