import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { collection, onSnapshot, getDocs, collectionGroup } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, TrendingDown, Scale, AlertCircle, ShieldAlert } from 'lucide-react';
import { toDate, classifyIncomeTx } from '../utils/reportUtils';
import ReportCollections from './ReportCollections';
import ReportExpenses from './ReportExpenses';
import ReportCashFlow from './ReportCashFlow';
import ReportDues from './ReportDues';

/**
 * Reports shell.
 *
 * Every report reads the SAME normalised record sets, so the money in "Collections"
 * always reconciles with the money in "Cash Flow". Loading and normalisation therefore
 * live here once, and the individual reports are pure functions of (records, filters).
 *
 * Reads are gated on the same fees_accounting permissions the underlying collections
 * are gated on in firestore.rules — a listener the caller isn't allowed to open would
 * otherwise just fail silently and render a report that looks like "no activity".
 */
export default function Reports() {
  const { currentUser, userData } = useAuth();
  const location = useLocation();
  const activeView = location.pathname.split('/')[2] || 'collections';

  const isAdmin = userData?.isAdmin;
  const perms = userData?.permissions?.fees_accounting || {};
  const isMaster = isAdmin || perms === true;

  // Mirrors firestore.rules: {path=**}/transactions readable with view_dashboard|view|ledger,
  // /expenses readable in full only with exp_all.
  const canViewIncome = isMaster || perms?.view === true || perms?.ledger === true || perms?.view_dashboard === true;
  const canViewExpenses = isMaster || perms?.exp_all === true;

  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  // Seeded from the permission check: a caller who may read nothing has nothing to wait
  // for, and starting at `true` would strand them on a spinner until an effect cleared it.
  const [loading, setLoading] = useState(canViewIncome || canViewExpenses);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!currentUser || (!canViewIncome && !canViewExpenses)) return;

    let unsubIncome = null;
    let unsubExpenses = null;
    let unsubStudents = null;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        // Staff is a one-shot read: it only supplies display names for wallet/expense
        // attribution, and re-rendering every report on a staff edit isn't worth a listener.
        const staffMap = {};
        const staffByEmail = {};
        const staffList = [];
        try {
          const staffSnap = await getDocs(collection(firestore, 'staff'));
          staffSnap.forEach(d => {
            const s = d.data();
            const name = s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || (s.email ? s.email.split('@')[0] : 'Staff');
            staffMap[d.id] = { id: d.id, name, email: (s.email || '').toLowerCase() };
            if (s.email) staffByEmail[s.email.toLowerCase()] = name;
            staffList.push({ id: d.id, name, email: (s.email || '').toLowerCase() });
          });
        } catch (err) {
          // A reports-only user may not hold staff_directory.view. Names then fall back to
          // the email on the record itself, which is enough to keep the report usable.
          console.warn('Reports: staff directory unreadable, falling back to emails', err);
        }
        if (cancelled) return;
        staffList.sort((a, b) => a.name.localeCompare(b.name));
        setStaff(staffList);

        const applyStudents = (snap) => {
          const list = [];
          snap.forEach(d => {
            const s = d.data();
            const name = s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
            const wing = s.programType || s.studentType || 'preschool';
            const grade = s.admissionForClass || s.className || s.grade || '';
            list.push({
              id: d.id,
              name,
              wing,
              grade,
              status: s.status || 'active',
              enrollmentDate: s.enrollmentDate || null,
              financialSummary: s.financialSummary || null
            });
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          setStudents(list);
        };

        // Students carry the wing/class dimension AND the receivables snapshot, so they are
        // needed by every report — but only readable by roles that can see student data.
        try {
          const first = await getDocs(collection(firestore, 'students'));
          if (cancelled) return;
          applyStudents(first);
          unsubStudents = onSnapshot(collection(firestore, 'students'), applyStudents, (err) => {
            console.warn('Reports: students listener error', err);
          });
        } catch (err) {
          console.warn('Reports: students unreadable', err);
        }

        if (canViewIncome) {
          unsubIncome = onSnapshot(collectionGroup(firestore, 'transactions'), (snap) => {
            const rows = [];
            snap.forEach(d => {
              // serverTimestamps: 'estimate' — a payment just recorded on THIS device
              // arrives in the latency-compensated snapshot with a null timestamp, which
              // toDate() would park in 1970 and drop out of every date window until the
              // server ack. The estimate keeps it in "today" from the first render.
              const t = d.data({ serverTimestamps: 'estimate' });
              rows.push({
                id: d.id,
                kind: 'income',
                date: toDate(t.timestamp || t.date),
                amount: Number(t.amount) || 0,
                method: t.method || 'Cash',
                category: t.category || 'General Fees',
                description: t.description || '',
                studentId: t.studentId || '',
                studentName: t.studentName || '',
                recordedBy: (t.addedBy || t.createdBy || '').toLowerCase(),
                // Concessions never moved cash; classifyIncomeTx mirrors the dues engine
                // so this report can never disagree with the ledger over what counts.
                txType: classifyIncomeTx(t),
                isVoided: t.isVoided === true
              });
            });
            setIncome(rows);
            setLoading(false);
          }, (err) => {
            console.error('Reports: transactions listener error', err);
            setLoadError('Collections could not be loaded. Your access may have changed.');
            setLoading(false);
          });
        }

        if (canViewExpenses) {
          unsubExpenses = onSnapshot(collection(firestore, 'expenses'), (snap) => {
            const rows = [];
            snap.forEach(d => {
              const e = d.data({ serverTimestamps: 'estimate' });
              if (!['spend', 'expense', 'funding'].includes(e.type)) return;
              const byId = e.staffId ? staffMap[e.staffId] : null;
              const email = (e.staffEmail || e.createdBy || '').toLowerCase();
              const staffName = byId?.name || staffByEmail[email] || (email ? email.split('@')[0] : 'Unattributed');
              rows.push({
                id: d.id,
                kind: 'expense',
                date: toDate(e.timestamp || e.date),
                amount: Math.abs(Number(e.amount) || 0),
                category: e.category || 'Uncategorised',
                description: e.details || e.description || '',
                source: e.source === 'staff_wallet' ? 'staff_wallet' : 'office',
                txType: e.type,
                staffId: e.staffId || '',
                staffName,
                staffEmail: email,
                recordedBy: (e.createdBy || '').toLowerCase(),
                attachmentUrl: e.attachmentUrl || e.fileUrl || '',
                hasBill: !!(e.attachmentUrl || e.fileUrl)
              });
            });
            setExpenses(rows);
            setLoading(false);
          }, (err) => {
            console.error('Reports: expenses listener error', err);
            setLoadError('Expenses could not be loaded. Your access may have changed.');
            setLoading(false);
          });
        }
      } catch (err) {
        console.error('Reports: initialisation failed', err);
        setLoadError('Reports could not be initialised.');
        setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unsubIncome) unsubIncome();
      if (unsubExpenses) unsubExpenses();
      if (unsubStudents) unsubStudents();
    };
  }, [currentUser, canViewIncome, canViewExpenses]);

  // Wing/grade/name are resolved HERE, from the live students state, rather than inside
  // the transactions listener. A lookup map captured at listener setup goes stale: a
  // student who loads after the first transactions snapshot (new admission, slow listener)
  // stayed "Unassigned" in every wing/class breakdown until an unrelated transaction
  // happened to re-fire the listener.
  // The students listener fires on EVERY student write — including the financialSummary
  // rewrite the reconciliation function performs after each payment — but enrichment only
  // reads id/name/wing/grade. Keying the map on a fingerprint of those fields stops the
  // full income remap (and the downstream report memo cascade) when unrelated fields churn.
  const metaFingerprint = students.map(s => `${s.id}|${s.name}|${s.wing}|${s.grade}`).join('\n');
  const metaById = useMemo(
    () => new Map(students.map(s => [s.id, s])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint stands in for students
    [metaFingerprint]
  );
  const enrichedIncome = useMemo(() => {
    return income.map(r => {
      const m = metaById.get(r.studentId);
      return {
        ...r,
        studentName: r.studentName || m?.name || 'Unknown student',
        wing: m?.wing || 'unassigned',
        grade: m?.grade || ''
      };
    });
  }, [income, metaById]);

  const data = useMemo(
    () => ({ income: enrichedIncome, expenses, students, staff, canViewIncome, canViewExpenses }),
    [enrichedIncome, expenses, students, staff, canViewIncome, canViewExpenses]
  );

  const tabs = [
    { id: 'collections', label: 'Collections', icon: TrendingUp, show: canViewIncome },
    { id: 'expenses', label: 'Expenses', icon: TrendingDown, show: canViewExpenses },
    { id: 'cash-flow', label: 'Cash Flow', icon: Scale, show: canViewIncome || canViewExpenses },
    { id: 'dues', label: 'Outstanding Dues', icon: AlertCircle, show: canViewIncome }
  ];
  const visibleTabs = tabs.filter(t => t.show);

  if (!canViewIncome && !canViewExpenses) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-8 rounded-xl text-center flex flex-col items-center m-6">
        <ShieldAlert className="text-red-500 mb-4" size={44} />
        <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
        <p className="text-brand-text-dim max-w-md">
          Financial reports need at least fee-ledger visibility or full expense access. Ask an administrator for the
          relevant Fees &amp; Accounting permission.
        </p>
      </div>
    );
  }

  const defaultTab = visibleTabs[0]?.id || 'collections';

  return (
    <div className="h-full flex flex-col -mx-4 md:-mx-8 bg-brand-bg relative">
      <div className="bg-brand-sidebar pt-2 shrink-0 print:hidden">
        <div className="flex overflow-x-auto hide-scrollbar gap-1 border-b border-brand-card-border px-4 md:px-8">
          {visibleTabs.map(tab => (
            <Link
              key={tab.id}
              to={`/reports/${tab.id}`}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeView === tab.id
                  ? 'border-brand-primary text-brand-primary bg-brand-primary/5'
                  : 'border-transparent text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {loadError && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
            <p className="text-sm text-brand-text-dim">Crunching the books…</p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to={defaultTab} replace />} />
            {canViewIncome && <Route path="collections" element={<ReportCollections data={data} />} />}
            {canViewExpenses && <Route path="expenses" element={<ReportExpenses data={data} />} />}
            <Route path="cash-flow" element={<ReportCashFlow data={data} />} />
            {canViewIncome && <Route path="dues" element={<ReportDues data={data} />} />}
            <Route path="*" element={<Navigate to={defaultTab} replace />} />
          </Routes>
        )}
      </div>
    </div>
  );
}
