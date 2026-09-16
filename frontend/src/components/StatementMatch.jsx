import { Spinner } from './Spinner';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { functions, firestore } from '../firebase';
import {
  Upload, Link2, Link2Off, EyeOff, CheckCircle2, AlertTriangle,
  FileSpreadsheet, Wand2, X, ArrowRight
} from 'lucide-react';
import { INR } from '../utils/reportUtils';
import { detectColumns, buildLines } from '../utils/statementParse';

/**
 * Bank statement import and review.
 *
 * The matching engine (functions/src/shared/matchStatement.mjs) deliberately refuses to
 * guess: where two payments could equally explain a line it leaves the line unmatched
 * with its candidates. That design only pays off if this screen makes resolving those
 * lines easy, so the ambiguous ones are surfaced first with their candidates inline
 * rather than buried in a list of greens.
 */

const rupees = (minor) => INR((Number(minor) || 0) / 100);
const DATE_ORDERS = [
  { id: 'DMY', label: 'DD/MM/YYYY (Indian banks)' },
  { id: 'MDY', label: 'MM/DD/YYYY' },
  { id: 'YMD', label: 'YYYY-MM-DD' },
];

const STATUS_STYLE = {
  matched: 'bg-green-500/10 text-green-600 dark:text-green-400',
  unmatched: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ignored: 'bg-black/5 dark:bg-white/5 text-brand-text-dim',
};

export default function StatementMatch({ periodKey }) {
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // import wizard
  const [parsed, setParsed] = useState(null);      // { headers, rows, fileName }
  const [mapping, setMapping] = useState(null);
  const [dateOrder, setDateOrder] = useState('DMY');
  const [bankLabel, setBankLabel] = useState('');

  const loadRun = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(query(
        collection(firestore, 'reconciliations'),
        where('periodKey', '==', periodKey),
        orderBy('importedAt', 'desc')
      ));
      const latest = snap.docs[0];
      if (!latest) { setRun(null); setLines([]); return; }
      setRun({ id: latest.id, ...latest.data() });
      const ls = await getDocs(collection(firestore, 'reconciliations', latest.id, 'lines'));
      setLines(ls.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Statement load failed', e);
      setError(e?.message || 'Could not load the statement for this month.');
    } finally { setLoading(false); }
  }, [periodKey]);

  useEffect(() => { loadRun(); setParsed(null); }, [loadRun]);

  const onFile = (file) => {
    if (!file) return;
    setError('');
    Papa.parse(file, {
      header: true, skipEmptyLines: 'greedy',
      complete: (res) => {
        const headers = res.meta?.fields || [];
        if (!headers.length) { setError('That file has no header row this parser can read.'); return; }
        setParsed({ headers, rows: res.data, fileName: file.name });
        setMapping(detectColumns(headers));
      },
      error: (e) => setError(e?.message || 'Could not read that file.'),
    });
  };

  // Built live so the operator sees the effect of the mapping before importing anything.
  const preview = useMemo(
    () => (parsed && mapping ? buildLines(parsed.rows, mapping, dateOrder) : null),
    [parsed, mapping, dateOrder]
  );

  const runImport = async () => {
    if (!preview?.lines.length) return alert('No usable rows with the current mapping.');
    setBusy('import');
    try {
      const res = await httpsCallable(functions, 'importStatement')({
        periodKey, bankLabel: bankLabel.trim(), lines: preview.lines,
      });
      await httpsCallable(functions, 'autoMatchStatement')({ runId: res.data.runId });
      setParsed(null);
      await loadRun();
    } catch (e) {
      alert(e?.message || 'Import failed.');
    } finally { setBusy(''); }
  };

  const rematch = async () => {
    setBusy('match');
    try {
      await httpsCallable(functions, 'autoMatchStatement')({ runId: run.id });
      await loadRun();
    } catch (e) { alert(e?.message || 'Matching failed.'); }
    finally { setBusy(''); }
  };

  const act = async (lineId, action, paymentPath) => {
    setBusy(lineId);
    try {
      await httpsCallable(functions, 'setStatementLineMatch')({ runId: run.id, lineId, action, paymentPath });
      await loadRun();
    } catch (e) { alert(e?.message || 'Could not update that line.'); }
    finally { setBusy(''); }
  };

  if (loading) return <div className="py-10 flex justify-center"><Spinner /></div>;

  // ---------------------------------------------------------------- import wizard
  if (parsed) {
    const set = (k, v) => setMapping(m => ({ ...m, [k]: v }));
    const Col = ({ label, field, hint }) => (
      <div>
        <label className="block text-xs font-medium text-brand-text-dim mb-1">{label}</label>
        <select
          value={mapping[field] || ''}
          onChange={(e) => set(field, e.target.value)}
          className="w-full bg-brand-bg border border-brand-card-border rounded-md px-2 py-1.5 text-sm text-brand-text"
        >
          <option value="">— none —</option>
          {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        {hint && <p className="text-[10px] text-brand-text-dim mt-1">{hint}</p>}
      </div>
    );

    return (
      <div className="bg-brand-card border border-brand-card-border rounded-xl overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-brand-card-border flex items-center justify-between bg-black/5 dark:bg-white/5">
          <h3 className="font-bold text-brand-text flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-brand-primary" /> {parsed.fileName}
          </h3>
          <button onClick={() => setParsed(null)} className="text-brand-text-dim hover:text-brand-text"><X size={18} /></button>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Col label="Value date" field="valueDate" />
            <Col label="Description" field="description" />
            <Col label="Reference" field="reference" hint="UTR / cheque no — what matching relies on" />
            {mapping.splitColumns ? (
              <>
                <Col label="Credit (money in)" field="credit" />
                <Col label="Debit (money out)" field="debit" />
              </>
            ) : (
              <Col label="Amount" field="amount" hint="Negative or (brackets) for debits" />
            )}
            <div>
              <label className="block text-xs font-medium text-brand-text-dim mb-1">Date format</label>
              <select
                value={dateOrder} onChange={(e) => setDateOrder(e.target.value)}
                className="w-full bg-brand-bg border border-brand-card-border rounded-md px-2 py-1.5 text-sm text-brand-text"
              >
                {DATE_ORDERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <p className="text-[10px] text-brand-text-dim mt-1">Check this: 03/09 is 3 Sept or 9 March depending on it.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-brand-text-dim mb-1">Bank / account label (optional)</label>
            <input
              value={bankLabel} onChange={(e) => setBankLabel(e.target.value)}
              placeholder="e.g. Current a/c ...4821"
              className="w-full md:w-80 bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 text-sm text-brand-text"
            />
          </div>

          {/* Live preview: the mapping's effect is visible before anything is written. */}
          <div className="bg-brand-bg border border-brand-card-border rounded-lg p-4">
            <p className="text-sm font-bold text-brand-text mb-2">
              {preview.lines.length} usable row{preview.lines.length === 1 ? '' : 's'}
              {preview.errors.length ? ` · ${preview.errors.length} problem${preview.errors.length === 1 ? '' : 's'}` : ''}
            </p>
            {preview.errors.length > 0 && (
              <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 mb-3">
                {preview.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                {preview.errors.length > 5 && <li>• …and {preview.errors.length - 5} more</li>}
              </ul>
            )}
            {preview.lines.slice(0, 3).map((l, i) => (
              <div key={i} className="text-xs text-brand-text-dim flex gap-3 py-1 border-t border-brand-card-border first:border-0">
                <span className="font-mono">{new Date(l.valueDate).toLocaleDateString('en-IN')}</span>
                <span className="flex-1 truncate">{l.description || '—'}</span>
                <span className="font-mono">{l.reference || '—'}</span>
                <span className={`font-bold tabular-nums ${l.amount < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {INR(l.amount)}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={runImport} disabled={busy === 'import' || !preview.lines.length}
            className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
          >
            {busy === 'import' ? <Spinner className="h-4 w-4" /> : <Wand2 size={16} />}
            Import and match {preview.lines.length} rows
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- empty state
  if (!run) {
    return (
      <div className="bg-brand-card border border-brand-card-border rounded-xl p-8 text-center">
        <Upload className="mx-auto text-brand-text-dim mb-3" size={28} />
        <h3 className="font-bold text-brand-text mb-1">No bank statement imported for this month</h3>
        <p className="text-sm text-brand-text-dim max-w-md mx-auto mb-4">
          Upload the bank's CSV export. Lines are matched against recorded payments by reference first,
          then deposit slips, then amount and date — and anything ambiguous is left for you rather than guessed.
        </p>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <label className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2.5 rounded-lg font-bold text-sm cursor-pointer transition-colors">
          <Upload size={16} /> Choose CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
    );
  }

  // ---------------------------------------------------------------- results
  const credits = lines.filter(l => l.direction === 'credit');
  const unmatched = credits.filter(l => l.status === 'unmatched');
  const matched = credits.filter(l => l.status === 'matched');
  const ignored = credits.filter(l => l.status === 'ignored');
  const stats = run.stats || {};

  const LineRow = ({ l }) => (
    <div className="px-4 md:px-6 py-3 border-b border-brand-card-border last:border-0">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-xs font-mono text-brand-text-dim whitespace-nowrap pt-1">
          {l.valueDate?.toDate ? l.valueDate.toDate().toLocaleDateString('en-IN') : new Date(l.valueDate).toLocaleDateString('en-IN')}
        </span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm text-brand-text truncate">{l.description || '—'}</p>
          {l.reference && <p className="text-[11px] font-mono text-brand-text-dim">{l.reference}</p>}
          {l.matchNote && <p className="text-[11px] text-brand-text-dim mt-0.5">{l.matchNote}</p>}
        </div>
        <span className="font-bold tabular-nums text-brand-text whitespace-nowrap">{rupees(l.amountMinor)}</span>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[l.status]}`}>
          {l.status}{l.confidence ? ` · ${l.confidence}` : ''}
        </span>
        <div className="flex gap-1">
          {l.status === 'matched' && (
            <button onClick={() => act(l.id, 'unmatch')} disabled={!!busy} title="Clear this match"
              className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-brand-text-dim disabled:opacity-40">
              {busy === l.id ? <Spinner className="h-3.5 w-3.5" /> : <Link2Off size={14} />}
            </button>
          )}
          {l.status === 'unmatched' && (
            <button onClick={() => act(l.id, 'ignore')} disabled={!!busy} title="Not a fee payment — ignore"
              className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-brand-text-dim disabled:opacity-40">
              {busy === l.id ? <Spinner className="h-3.5 w-3.5" /> : <EyeOff size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* The candidates the engine refused to choose between — resolving these is the job. */}
      {l.status === 'unmatched' && l.candidates?.length > 0 && (
        <div className="mt-2 ml-0 md:ml-20 space-y-1">
          {l.candidates.map(path => (
            <button key={path} onClick={() => act(l.id, 'match', path)} disabled={!!busy}
              className="w-full flex items-center gap-2 text-left text-xs bg-brand-bg border border-brand-card-border rounded-md px-3 py-2 hover:border-brand-primary transition-colors disabled:opacity-50">
              <Link2 size={12} className="text-brand-primary shrink-0" />
              <span className="font-mono truncate flex-1">{path.split('/').slice(-1)[0]}</span>
              <ArrowRight size={12} className="text-brand-text-dim" />
              <span className="font-medium">match this line</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-brand-card border border-brand-card-border rounded-xl p-4 md:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-brand-text flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-brand-primary" />
            {run.bankLabel || 'Bank statement'}
          </h3>
          <p className="text-xs text-brand-text-dim mt-0.5">
            {stats.lineCount} lines · {stats.creditCount} credits · imported by {run.importedBy || 'unknown'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={rematch} disabled={!!busy}
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {busy === 'match' ? <Spinner className="h-4 w-4" /> : <Wand2 size={14} />} Re-match
          </button>
          <label className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-3 py-2 rounded-lg text-sm font-bold cursor-pointer">
            <Upload size={14} /> Replace
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Matched</p>
          <p className="text-xl font-black text-green-600 dark:text-green-400">{matched.length}</p>
        </div>
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Needs a decision</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400">{unmatched.length}</p>
        </div>
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Payments bank didn't show</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400">{stats.unmatchedPaymentCount ?? 0}</p>
        </div>
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-dim">Credits total</p>
          <p className="text-xl font-black text-brand-text tabular-nums">{rupees(stats.creditMinor)}</p>
        </div>
      </div>

      {/* Ambiguous first: these are the only lines that need a human. */}
      {unmatched.length > 0 && (
        <div className="bg-brand-card border border-brand-card-border rounded-xl overflow-hidden">
          <div className="px-4 md:px-6 py-3 border-b border-brand-card-border bg-amber-50 dark:bg-amber-900/20 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
            <h4 className="font-bold text-sm text-amber-800 dark:text-amber-200">Needs a decision ({unmatched.length})</h4>
          </div>
          {unmatched.map(l => <LineRow key={l.id} l={l} />)}
        </div>
      )}

      {/* The other direction: money the ledger has that the bank never showed. */}
      {run.unmatchedPayments?.length > 0 && (
        <div className="bg-brand-card border border-brand-card-border rounded-xl overflow-hidden">
          <div className="px-4 md:px-6 py-3 border-b border-brand-card-border bg-black/5 dark:bg-white/5">
            <h4 className="font-bold text-sm text-brand-text">Recorded payments with no statement line ({run.unmatchedPayments.length})</h4>
            <p className="text-xs text-brand-text-dim mt-0.5">Either the bank hasn't shown them yet, or they never arrived.</p>
          </div>
          {run.unmatchedPayments.slice(0, 40).map(p => (
            <div key={p.paymentPath} className="px-4 md:px-6 py-2.5 border-b border-brand-card-border last:border-0 flex items-center gap-3 text-sm">
              <span className="text-xs text-brand-text-dim font-mono whitespace-nowrap">
                {p.receivedAt ? new Date(p.receivedAt).toLocaleDateString('en-IN') : '—'}
              </span>
              <span className="flex-1 truncate text-brand-text">{p.studentName || '—'}</span>
              {!p.hasReference && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">no reference</span>
              )}
              <span className="font-bold tabular-nums text-brand-text">{rupees(p.amountMinor)}</span>
            </div>
          ))}
        </div>
      )}

      {matched.length > 0 && (
        <details className="bg-brand-card border border-brand-card-border rounded-xl overflow-hidden">
          <summary className="px-4 md:px-6 py-3 cursor-pointer bg-black/5 dark:bg-white/5 font-bold text-sm text-brand-text flex items-center gap-2">
            <CheckCircle2 size={15} className="text-green-500" /> Matched ({matched.length})
          </summary>
          {matched.map(l => <LineRow key={l.id} l={l} />)}
        </details>
      )}

      {ignored.length > 0 && (
        <details className="bg-brand-card border border-brand-card-border rounded-xl overflow-hidden">
          <summary className="px-4 md:px-6 py-3 cursor-pointer bg-black/5 dark:bg-white/5 font-bold text-sm text-brand-text-dim">
            Ignored ({ignored.length})
          </summary>
          {ignored.map(l => <LineRow key={l.id} l={l} />)}
        </details>
      )}
    </div>
  );
}
