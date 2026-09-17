import { CenteredSpinner, Spinner } from './Spinner';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  Landmark, Lock, LockOpen, AlertCircle, CheckCircle2, Banknote,
  FileWarning, RefreshCw, X
} from 'lucide-react';
import { INR, localKey } from '../utils/reportUtils';
import { periodKeyOf } from '../utils/paymentFields';
import StatementMatch from './StatementMatch';

/**
 * Month-end reconciliation.
 *
 * Phase 4 of docs/payments-data-model-review.md shipped the machinery (closePeriod,
 * previewPeriod, createDeposit, undepositedCash) with no way for anyone to reach it.
 * This is that surface: what a month collected, what of it can be matched against a
 * bank statement, what cash is still sitting unbanked, and the sign-off itself.
 *
 * Everything shown is recomputed server-side on each load rather than read from a
 * stored balance. That is deliberate: the whole point of the exercise is to stop
 * trusting caches, and a reconciliation screen that displayed a cached figure would
 * be reporting the very thing it exists to check.
 */

const rupees = (minor) => INR((Number(minor) || 0) / 100);

/** Last 12 months, newest first — the realistic range anyone reconciles. */
function recentPeriods() {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    out.push(periodKeyOf(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  }
  return out;
}

const MONTH_LABEL = (pk) => {
  const [y, m] = String(pk).split('-').map(Number);
  if (!y || !m) return pk;
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

function Stat({ label, value, sub, tone = 'neutral', icon: Icon }) {
  const tones = {
    neutral: 'text-brand-text',
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-500',
  };
  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">{label}</p>
          <p className={`text-2xl font-black mt-1.5 tabular-nums ${tones[tone]}`}>{value}</p>
          {sub && <p className="text-xs text-brand-text-dim mt-1">{sub}</p>}
        </div>
        {Icon && <Icon size={18} className="text-brand-text-dim shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

export default function Reconciliation() {
  const { userData } = useAuth();
  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.fees_accounting || {};
  const canClose = isAdmin || perms?.config === true;

  const periods = useMemo(recentPeriods, []);
  const [periodKey, setPeriodKey] = useState(periods[0]);
  const [summary, setSummary] = useState(null);
  const [cash, setCash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const [depositOpen, setDepositOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [depositForm, setDepositForm] = useState({ reference: '', bankLabel: '', depositedAt: localKey(new Date()) });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, c] = await Promise.all([
        httpsCallable(functions, 'previewPeriod')({ periodKey }),
        httpsCallable(functions, 'undepositedCash')(),
      ]);
      setSummary(p.data);
      setCash(c.data);
    } catch (e) {
      console.error('Reconciliation load failed', e);
      // Surface the real reason: "permission-denied" and "index still building" need
      // very different responses from whoever is reading this.
      setError(e?.message || 'Could not load reconciliation data.');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [periodKey]);

  useEffect(() => { load(); }, [load]);

  const totals = summary?.totals;
  const closed = summary?.status === 'closed';
  const matchable = totals?.matchable || { withReference: 0, withoutReference: 0 };
  const matchableTotal = matchable.withReference + matchable.withoutReference;

  // Cash for THIS period only; the rest belongs to other months.
  const periodCashRows = useMemo(
    () => (cash?.rows || []).filter(r => r.periodKey === periodKey),
    [cash, periodKey]
  );
  const selectedMinor = useMemo(
    () => periodCashRows.filter(r => selected.includes(r.paymentPath)).reduce((a, r) => a + r.amountMinor, 0),
    [periodCashRows, selected]
  );

  const runClose = async () => {
    if (!window.confirm(
      `Close ${MONTH_LABEL(periodKey)}?\n\nIts totals get frozen and no further payment can be recorded into it. ` +
      `A later correction would have to be posted into the open month instead.`
    )) return;
    setBusy('close');
    try {
      await httpsCallable(functions, 'closePeriod')({ periodKey });
      await load();
    } catch (e) {
      alert(e?.message || 'Could not close the period.');
    } finally { setBusy(''); }
  };

  const runReopen = async () => {
    const reason = window.prompt('Reopening a closed month is recorded. Why is it being reopened?');
    if (reason === null) return;
    if (!reason.trim()) return alert('A reason is required.');
    setBusy('reopen');
    try {
      await httpsCallable(functions, 'reopenPeriod')({ periodKey, reason: reason.trim() });
      await load();
    } catch (e) {
      alert(e?.message || 'Could not reopen the period.');
    } finally { setBusy(''); }
  };

  const runDeposit = async (e) => {
    e.preventDefault();
    if (!selected.length) return alert('Select at least one payment.');
    if (!depositForm.reference.trim()) return alert('A deposit slip reference is required.');
    setBusy('deposit');
    try {
      await httpsCallable(functions, 'createDeposit')({
        paymentPaths: selected,
        reference: depositForm.reference.trim(),
        bankLabel: depositForm.bankLabel.trim(),
        depositedAt: depositForm.depositedAt,
      });
      setDepositOpen(false);
      setSelected([]);
      setDepositForm({ reference: '', bankLabel: '', depositedAt: localKey(new Date()) });
      await load();
    } catch (e) {
      // The callable returns the specific reason (already banked, voided, wrong method).
      alert(e?.message || 'Could not record the deposit.');
    } finally { setBusy(''); }
  };

  if (loading && !summary) return <CenteredSpinner />;

  return (
    <div className="space-y-5">
      {/* Period picker + sign-off */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Landmark className="text-brand-primary shrink-0" size={20} />
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-dim mb-1">Month</label>
            <select
              value={periodKey}
              onChange={(e) => { setPeriodKey(e.target.value); setSelected([]); }}
              className="bg-brand-bg border border-brand-card-border rounded-md py-1.5 px-3 text-sm font-medium text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            >
              {periods.map(p => <option key={p} value={p}>{MONTH_LABEL(p)}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            closed
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}>
            {closed ? <Lock size={12} /> : <LockOpen size={12} />}
            {closed ? 'Closed' : 'Open'}
          </span>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw size={14} />} Recheck
          </button>
          {canClose && !closed && (
            <button onClick={runClose} disabled={!!busy} className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50">
              {busy === 'close' ? <Spinner className="h-4 w-4" /> : <Lock size={14} />} Close month
            </button>
          )}
          {isAdmin && closed && (
            <button onClick={runReopen} disabled={!!busy} className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
              {busy === 'reopen' ? <Spinner className="h-4 w-4" /> : <LockOpen size={14} />} Reopen
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Drift: the figures moved after the month was signed off. */}
      {closed && summary?.driftMinor !== null && summary?.driftMinor !== 0 && (
        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl px-4 py-3">
          <FileWarning size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            This month was signed off at <span className="font-bold">{rupees(totals.netMinor - summary.driftMinor)}</span> but
            now recomputes to <span className="font-bold">{rupees(totals.netMinor)}</span> — a drift of{' '}
            <span className="font-bold">{rupees(summary.driftMinor)}</span>. Something changed after close.
          </p>
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat label="Net collected" value={rupees(totals.netMinor)} tone="green" icon={Banknote}
            sub={totals.reversalsMinor ? `${rupees(totals.grossMinor)} gross, ${rupees(Math.abs(totals.reversalsMinor))} reversed` : `${totals.paymentCount} payments`} />
          <Stat label="Payments" value={totals.paymentCount.toLocaleString('en-IN')}
            sub={totals.reversalCount ? `${totals.reversalCount} reversal${totals.reversalCount === 1 ? '' : 's'}` : 'no reversals'} />
          <Stat label="Bank-matchable"
            value={matchableTotal ? `${matchable.withReference} / ${matchableTotal}` : '—'}
            tone={matchable.withoutReference ? 'amber' : 'green'}
            sub={matchable.withoutReference ? `${matchable.withoutReference} without a reference` : 'all electronic payments referenced'} />
          <Stat label="Cash awaiting deposit" value={rupees(periodCashRows.reduce((a, r) => a + r.amountMinor, 0))}
            tone={periodCashRows.length ? 'amber' : 'green'}
            sub={`${periodCashRows.length} payment${periodCashRows.length === 1 ? '' : 's'} this month`} />
        </div>
      )}

      {/* Why the matchable number is what it is. */}
      {totals && matchable.withoutReference > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-bold">{matchable.withoutReference}</span> electronic payment{matchable.withoutReference === 1 ? '' : 's'} in
            this month {matchable.withoutReference === 1 ? 'carries' : 'carry'} no bank reference, so {matchable.withoutReference === 1 ? 'it' : 'they'} cannot
            be matched to a statement line automatically. Payments recorded from now on capture the reference at entry;
            older ones can only be matched by amount and date.
          </p>
        </div>
      )}

      {/* Cash awaiting deposit */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-brand-card-border flex items-center justify-between gap-3 bg-black/5 dark:bg-white/5">
          <div>
            <h3 className="font-bold text-brand-text">Cash &amp; cheques awaiting deposit</h3>
            <p className="text-xs text-brand-text-dim mt-0.5">
              {cash ? `${rupees(cash.totalMinor)} across all months · ${periodCashRows.length} in ${MONTH_LABEL(periodKey)}` : '—'}
            </p>
          </div>
          {periodCashRows.length > 0 && (
            <button
              onClick={() => setDepositOpen(true)}
              disabled={!selected.length || !!busy}
              className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-40"
            >
              <Banknote size={14} /> Record deposit{selected.length ? ` (${selected.length})` : ''}
            </button>
          )}
        </div>

        {periodCashRows.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto text-green-500 mb-2" size={28} />
            <p className="text-sm text-brand-text-dim">No cash or cheques from this month are waiting to be banked.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider bg-brand-bg text-brand-text-dim border-b border-brand-card-border">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.length === periodCashRows.length && periodCashRows.length > 0}
                      onChange={(e) => setSelected(e.target.checked ? periodCashRows.map(r => r.paymentPath) : [])}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-bold">Student</th>
                  <th className="px-3 py-3 text-left font-bold">Method</th>
                  <th className="px-3 py-3 text-left font-bold">Received</th>
                  <th className="px-4 py-3 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {periodCashRows.map(r => (
                  <tr key={r.paymentPath} className="border-b border-brand-card-border hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.paymentPath)}
                        onChange={(e) => setSelected(prev => e.target.checked ? [...prev, r.paymentPath] : prev.filter(p => p !== r.paymentPath))}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-brand-text">{r.studentName || '—'}</td>
                    <td className="px-3 py-3 text-brand-text-dim">{r.method}</td>
                    <td className="px-3 py-3 text-brand-text-dim whitespace-nowrap">
                      {r.receivedAt ? new Date(r.receivedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-brand-text">{rupees(r.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
              {selected.length > 0 && (
                <tfoot>
                  <tr className="bg-brand-bg border-t-2 border-brand-card-border font-black text-brand-text">
                    <td colSpan="4" className="px-4 py-3">{selected.length} selected</td>
                    <td className="px-4 py-3 text-right tabular-nums">{rupees(selectedMinor)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Bank statement: imported per month, matched against the ledger. */}
      <StatementMatch key={periodKey} periodKey={periodKey} />
      {/* Deposit modal */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-card-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-black/5 dark:bg-white/5">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <Banknote className="text-brand-primary" size={20} /> Record deposit
              </h2>
              <button onClick={() => setDepositOpen(false)} className="text-brand-text-dim hover:text-brand-text"><X size={20} /></button>
            </div>
            <form onSubmit={runDeposit} className="p-6 space-y-4">
              <div className="bg-brand-bg border border-brand-card-border rounded-lg px-4 py-3">
                <p className="text-xs text-brand-text-dim">Banking</p>
                <p className="text-xl font-black text-brand-text tabular-nums">{rupees(selectedMinor)}</p>
                <p className="text-xs text-brand-text-dim">{selected.length} payment{selected.length === 1 ? '' : 's'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">
                  Slip reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" value={depositForm.reference}
                  onChange={(e) => setDepositForm({ ...depositForm, reference: e.target.value })}
                  placeholder="Counterfoil / slip number"
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
                <p className="text-[10px] text-brand-text-dim mt-1">This is what ties the deposit to the bank statement line.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Bank / account (optional)</label>
                <input
                  type="text" value={depositForm.bankLabel}
                  onChange={(e) => setDepositForm({ ...depositForm, bankLabel: e.target.value })}
                  placeholder="e.g. Current a/c ...4821"
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-dim mb-1">Deposited on</label>
                <input
                  type="date" value={depositForm.depositedAt}
                  onChange={(e) => setDepositForm({ ...depositForm, depositedAt: e.target.value })}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
                <p className="text-[10px] text-brand-text-dim mt-1">
                  The banking date, which may differ from when the cash was collected.
                </p>
              </div>
              <button
                type="submit" disabled={busy === 'deposit'}
                className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-3 rounded-md font-bold text-sm transition-colors disabled:opacity-50"
              >
                {busy === 'deposit' ? <Spinner className="h-4 w-4" /> : <Banknote size={16} />} Record deposit
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
