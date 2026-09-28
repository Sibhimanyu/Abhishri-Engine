import { useState, useEffect, useMemo, useRef, forwardRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { REPORT_PROMPT, parseReportText } from '../utils/reportImport';
import { tamilCalendarFor } from '../utils/tamilCalendar';
import ChatGPTImportDialog from './ChatGPTImportDialog';
import { POSTER, POSTER_WIDTH, DISPLAY_FONT, BODY_FONT, TAMIL_FONT, SCRIPT_FONT, CONTACT, exportPosterPng } from './poster/posterTheme';
import { Flake, ScaledPreview } from './poster/PosterParts';
import { isAdminUser, statusOf, approvalForSave, reviewDocument, APPROVED, PENDING } from './poster/approval';
import { ApprovalActions, ApprovalStatus, ApprovalChip, PendingList } from './poster/ApprovalControls';
import { School, HouseHeart, Plus, Trash2, Save, FolderOpen, X, Loader2, FilePlus2, ClipboardPaste, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

// "Connecting the Dots": the day's classroom highlights for parents, each optionally
// paired with something to try at home. One report per date (the Firestore doc id).

const HOME_PILL = '#FBEAE7';
const TITHI_BOX = '#E4F3F2';

// The Tamil calendar fields staff can correct; everything else comes from the date.
const CAL_FIELDS = [
  { key: 'tamilMonth', label: 'Tamil month' },
  { key: 'tamilDate', label: 'Tamil date' },
  { key: 'yearName', label: 'Year' },
  { key: 'tithi', label: 'Thithi' },
  { key: 'paksha', label: 'Paksha' },
];

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const emptyHighlight = () => ({ activity: '', classroom: '', home: '' });
const hasText = (h) => h.activity?.trim() || h.classroom?.trim() || h.home?.trim();
const prettyDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const safeCalendar = (iso) => {
  try {
    return tamilCalendarFor(iso);
  } catch (err) {
    console.error('Tamil calendar calculation failed:', err);
    return null;
  }
};

// A ringed circle gets a soft shadow. It's a radial gradient behind the circle rather than a
// box-shadow, which the PNG export smeared into a square block beside the circle.
const IconCircle = ({ color, size, border, children }) => {
  const circle = (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: 999, background: color, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: border ? `${border}px solid #ffffff` : undefined }}>
      {children}
    </div>
  );
  if (!border) return circle;
  const halo = 10;
  const edge = Math.round((size / 2 / (size / 2 + halo)) * 100);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', left: -halo, right: -halo, top: -halo + 3, bottom: -halo - 3, background: `radial-gradient(closest-side, rgba(120,90,60,0.16) ${edge - 8}%, rgba(120,90,60,0) 100%)` }} />
      {circle}
    </div>
  );
};

// Dotted rule drawn with a repeating radial gradient (renders the same in the PNG as on screen).
const dots = (color, horizontal) => ({
  backgroundImage: `radial-gradient(circle, ${color} 2.6px, transparent 3.1px)`,
  backgroundSize: horizontal ? '20px 8px' : '8px 11px',
  // 'space' draws only whole dots, spread evenly, so none is clipped at either end.
  backgroundRepeat: horizontal ? 'space no-repeat' : 'no-repeat space',
  backgroundPosition: 'center',
});

const StickFigure = () => (
  <svg width="54" height="68" viewBox="0 0 54 68" aria-hidden="true">
    <g stroke={POSTER.teal} strokeWidth="6" strokeLinecap="round" fill="none">
      <line x1="27" y1="22" x2="27" y2="42" />
      <line x1="27" y1="26" x2="9" y2="8" />
      <line x1="27" y1="26" x2="45" y2="8" />
      <line x1="27" y1="42" x2="15" y2="63" />
      <line x1="27" y1="42" x2="39" y2="63" />
    </g>
    <circle cx="27" cy="12" r="9" fill={POSTER.coral} />
  </svg>
);

function CalendarCard({ cal }) {
  return (
    <div style={{ width: 380, background: '#ffffff', borderRadius: 22, overflow: 'hidden', boxShadow: '0 8px 24px rgba(120,90,60,0.13)' }}>
      <div style={{ position: 'relative', background: POSTER.coral, color: '#ffffff', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, letterSpacing: 4.5 }}>
        {[25, 75].map(x => <span key={x} style={{ position: 'absolute', top: 6, left: `${x}%`, width: 11, height: 11, borderRadius: 999, background: '#ffffff' }} />)}
        <span style={{ marginTop: 6 }}>{cal.monthYear}</span>
      </div>
      <div style={{ padding: '18px 22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 93, lineHeight: 0.9, color: POSTER.coral }}>{cal.day}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 3.5 }}>{cal.weekday}</div>
            <div style={{ fontFamily: TAMIL_FONT, fontWeight: 700, fontSize: 28, color: POSTER.deepTeal, marginTop: 4, lineHeight: 1.3 }}>{cal.tamilMonth} {cal.tamilDate}</div>
            <div style={{ fontFamily: TAMIL_FONT, fontWeight: 500, fontSize: 15, color: POSTER.inkDim, marginTop: 2 }}>{cal.weekdayTa} · {cal.yearName} ஆண்டு</div>
          </div>
        </div>
        <div style={{ marginTop: 14, background: TITHI_BOX, borderRadius: 14, padding: '10px 14px', textAlign: 'center', fontFamily: TAMIL_FONT }}>
          <div style={{ fontWeight: 700, fontSize: 22, color: POSTER.deepTeal }}>திதி: {cal.tithi}</div>
          <div style={{ fontWeight: 500, fontSize: 15, color: POSTER.inkDim, marginTop: 2 }}>{cal.paksha}</div>
        </div>
      </div>
    </div>
  );
}

// The exported poster. Fixed width; the editor scales it down to fit on screen.
const ReportPoster = forwardRef(function ReportPoster({ cal, highlights }, ref) {
  const items = highlights.filter(hasText);
  return (
    <div ref={ref} style={{ width: POSTER_WIDTH, background: POSTER.cream, position: 'relative', overflow: 'hidden', fontFamily: BODY_FONT, color: POSTER.ink }}>
      <Flake size={190} color={POSTER.flake} dots style={{ position: 'absolute', left: -85, top: 560 }} />
      <Flake size={200} color={POSTER.flake} dots style={{ position: 'absolute', right: -90, bottom: 240 }} />
      <Flake size={52} color={POSTER.star} style={{ position: 'absolute', left: 500, top: 196 }} />

      <div style={{ position: 'relative', padding: '44px 44px 0' }}>
        {/* Header */}
        <div style={{ position: 'relative', minHeight: 280 }}>
          <img src="/logo-coral.png" alt="Abhishri Academy" style={{ height: 76, width: 'auto', display: 'block' }} />
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 42, letterSpacing: 3, lineHeight: 1, marginTop: 34 }}>CONNECTING</div>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 88, letterSpacing: 3, lineHeight: 1, color: POSTER.coral, marginTop: 6, whiteSpace: 'nowrap' }}>THE DOTS</div>
          {cal && <div style={{ position: 'absolute', top: 0, right: 0 }}><CalendarCard cal={cal} /></div>}
        </div>

        {/* In the classroom ···•··· At home */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 26 }}>
          <IconCircle color={POSTER.teal} size={72} border={5}><School size={30} /></IconCircle>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 31, color: POSTER.deepTeal, whiteSpace: 'nowrap' }}>In the classroom</div>
          <div style={{ flex: 1, height: 8, ...dots(POSTER.deepTeal, true) }} />
          <StickFigure />
          <div style={{ flex: 1, height: 8, ...dots(POSTER.deepTeal, true) }} />
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 31, color: POSTER.coral, whiteSpace: 'nowrap' }}>At home</div>
          <IconCircle color={POSTER.coral} size={72} border={5}><HouseHeart size={30} /></IconCircle>
        </div>

        {/* Highlights */}
        <div style={{ marginTop: 28, background: '#ffffff', borderRadius: 28, padding: '28px 40px 36px' }}>
          <div style={{ fontFamily: SCRIPT_FONT, fontWeight: 700, fontSize: 50, color: POSTER.deepTeal, textAlign: 'center', lineHeight: 1.1 }}>Today’s highlights</div>
          <div style={{ borderTop: '2px dashed #EADFCC', margin: '18px 0 26px' }} />
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#B8B0A5', fontSize: 20, padding: '20px 0' }}>—</div>
          ) : items.map((h, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', columnGap: 22, rowGap: 18, marginTop: i ? 24 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <IconCircle color={POSTER.teal} size={48}><School size={22} /></IconCircle>
                {h.home?.trim() && <div style={{ flex: 1, width: 8, minHeight: 24, marginTop: 5, marginBottom: -13, ...dots(POSTER.deepTeal, false) }} />}
              </div>
              <div style={{ fontSize: 20, lineHeight: 1.55, paddingTop: 8 }}>
                {h.activity?.trim() && <span style={{ fontWeight: 800 }}>{h.activity.trim()}</span>}
                {h.activity?.trim() && h.classroom?.trim() && ' — '}
                {h.classroom?.trim()}
              </div>
              {h.home?.trim() && (
                <>
                  <IconCircle color={POSTER.coral} size={48}><HouseHeart size={22} /></IconCircle>
                  <div style={{ background: HOME_PILL, borderRadius: 14, padding: '11px 20px', fontSize: 20, lineHeight: 1.45 }}>{h.home.trim()}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', marginTop: 36, background: POSTER.coral, color: '#ffffff', padding: '30px 44px 26px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <svg width="76" height="16" viewBox="0 0 76 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill={POSTER.teal} />
            {[22, 30, 38, 46, 54].map(x => <circle key={x} cx={x} cy="8" r="1.8" fill="#ffffff" />)}
            <circle cx="68" cy="8" r="7" fill="#ffffff" />
          </svg>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 26, whiteSpace: 'nowrap' }}>Connecting classroom learning with meaningful moments at home</div>
        </div>
        <div style={{ fontWeight: 600, fontSize: 15.5, marginTop: 10 }}>{CONTACT.phone} · {CONTACT.email} · {CONTACT.web}</div>
      </div>
    </div>
  );
});

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary';
const buttonClass = 'flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm transition-colors';

// What approval covers: the report as it would print. Compared to tell unsaved edits apart.
const reportSignature = (date, highlights, calendar) => JSON.stringify({ date, highlights: highlights.filter(hasText), calendar });

export default function DailyReport() {
  const { currentUser, userData } = useAuth();
  const email = currentUser?.email;
  const isAdmin = isAdminUser(userData);

  const [date, setDate] = useState(todayIST());
  const [highlights, setHighlights] = useState([emptyHighlight()]);
  const [calOverrides, setCalOverrides] = useState({});
  const [loadedDate, setLoadedDate] = useState(null);
  const [savedReports, setSavedReports] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [savedSignature, setSavedSignature] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    const q = query(collection(firestore, 'daily_reports'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSavedReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingList(false);
    }, (err) => {
      console.error('Failed to load saved reports:', err);
      setLoadingList(false);
    });
    return () => unsub();
  }, []);

  const computedCal = useMemo(() => safeCalendar(date), [date]);
  const cal = computedCal && { ...computedCal, ...calOverrides };

  // A new date means a new calendar; corrections made for the old date don't carry over.
  const changeDate = (value) => {
    if (!value || value === date) return;
    setDate(value);
    setCalOverrides({});
  };

  const updateHighlight = (idx, field, value) => {
    setHighlights(prev => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };
  const moveHighlight = (idx, delta) => {
    setHighlights(prev => {
      const next = [...prev];
      const to = idx + delta;
      if (to < 0 || to >= next.length) return prev;
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };
  const removeHighlight = (idx) => {
    setHighlights(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [emptyHighlight()];
    });
  };

  const setCalField = (key, value) => {
    setCalOverrides(prev => {
      const next = { ...prev };
      if (value === '' || String(value) === String(computedCal?.[key] ?? '')) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  // The saved report this editor is showing: reports are keyed by date, and only one
  // that was loaded (or saved) here counts, never another report that shares the date.
  const savedReport = loadedDate === date ? savedReports.find(r => r.id === date) : null;
  const status = statusOf(savedReport);
  const dirty = !savedReport || reportSignature(date, highlights, calOverrides) !== savedSignature;
  const canExport = isAdmin || (status === APPROVED && !dirty);

  const handleNew = () => {
    setDate(todayIST());
    setHighlights([emptyHighlight()]);
    setCalOverrides({});
    setLoadedDate(null);
    setShowLoadPanel(false);
  };

  const handleLoad = (saved) => {
    const loadedHighlights = saved.highlights?.length ? saved.highlights.map(h => ({ activity: h.activity || '', classroom: h.classroom || '', home: h.home || '' })) : [emptyHighlight()];
    setDate(saved.date);
    setHighlights(loadedHighlights);
    setCalOverrides(saved.calendar || {});
    setLoadedDate(saved.date);
    setSavedSignature(reportSignature(saved.date, loadedHighlights, saved.calendar || {}));
    setShowLoadPanel(false);
  };

  const handleImport = (text) => {
    const parsed = parseReportText(text);
    if (highlights.some(hasText) && !window.confirm('Replace the highlights currently in the editor with the pasted ones?')) return;
    if (parsed.date) changeDate(parsed.date);
    setHighlights(parsed.highlights);
    setShowImport(false);
    setShowLoadPanel(false);
  };

  // `submit` also sends it for approval. A non-admin's plain save leaves it a draft,
  // so saving an approved report with changes puts it back through approval.
  const handleSave = async ({ submit = false } = {}) => {
    // Re-saving an unchanged approved report as a draft would only undo its approval.
    if (!isAdmin && !submit && !dirty) return;
    if (!highlights.some(hasText)) {
      alert('Add at least one highlight before saving.');
      return;
    }
    const existing = savedReports.find(r => r.id === date);
    if (existing && loadedDate !== date && !window.confirm(`A report for ${prettyDate(date)} is already saved. Replace it?`)) return;
    setSaving(true);
    try {
      await setDoc(doc(firestore, 'daily_reports', date), {
        date,
        highlights: highlights.filter(hasText),
        calendar: calOverrides,
        approval: approvalForSave({ isAdmin, email, submit }),
        updatedAt: serverTimestamp(),
        updatedBy: email || 'unknown',
        ...(existing ? {} : { createdAt: serverTimestamp(), createdBy: email || 'unknown' }),
      }, { merge: true });
      setLoadedDate(date);
      setSavedSignature(reportSignature(date, highlights, calOverrides));
      logAudit({ action: existing ? 'DAILY_REPORT_UPDATED' : 'DAILY_REPORT_CREATED', module: 'school_calendar', targetId: date, targetName: prettyDate(date), performedBy: email, details: {} });
      if (submit) logAudit({ action: 'DAILY_REPORT_SENT_FOR_APPROVAL', module: 'school_calendar', targetId: date, targetName: prettyDate(date), performedBy: email, details: {} });
    } catch (err) {
      console.error('Failed to save report:', err);
      alert('Failed to save report.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (saved) => {
    if (!window.confirm(`Delete the report for ${prettyDate(saved.date)}? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(firestore, 'daily_reports', saved.id));
      logAudit({ action: 'DAILY_REPORT_DELETED', module: 'school_calendar', targetId: saved.id, targetName: prettyDate(saved.date), performedBy: email, details: {} });
      if (loadedDate === saved.date) setLoadedDate(null);
    } catch (err) {
      console.error('Failed to delete report:', err);
      alert('Failed to delete report.');
    }
  };

  const handleReview = async (approve) => {
    if (!savedReport) return;
    let note = '';
    if (!approve) {
      note = (window.prompt('What should be changed? This note is shown to whoever sent it.') || '').trim();
      if (!note) return;
    }
    setReviewing(true);
    try {
      await reviewDocument({ collectionName: 'daily_reports', id: savedReport.id, approve, note, email, reviewerName: userData?.displayName, auditPrefix: 'DAILY_REPORT', targetName: prettyDate(savedReport.date) });
    } catch (err) {
      console.error('Failed to review report:', err);
      alert('Could not save your review. Please try again.');
    } finally {
      setReviewing(false);
    }
  };

  const handleExport = async () => {
    if (!previewRef.current || !canExport) return;
    setExporting(true);
    try {
      await exportPosterPng(previewRef.current, `daily-report-${date}.png`);
      logAudit({ action: 'DAILY_REPORT_EXPORTED', module: 'school_calendar', targetId: date, targetName: prettyDate(date), performedBy: email, details: {} });
    } catch (err) {
      console.error('Failed to export report image:', err);
      alert('Failed to export image. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <PendingList
          items={savedReports.filter(r => statusOf(r) === PENDING && r.id !== savedReport?.id)}
          labelOf={r => prettyDate(r.date)}
          onReview={handleLoad}
          what="report"
        />
      )}

      {/* Toolbar */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4 md:p-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="w-full sm:w-auto sm:shrink-0 max-w-full">
          <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="w-full md:w-56 bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>
        <div className="grid grid-cols-2 w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <button onClick={() => setShowLoadPanel(v => !v)} className={buttonClass}><FolderOpen size={16} /> Load</button>
          <button onClick={() => setShowImport(true)} className={buttonClass}><ClipboardPaste size={16} /> Import from ChatGPT</button>
          <button onClick={handleNew} className={buttonClass}><FilePlus2 size={16} /> New</button>
          <button onClick={() => handleSave()} disabled={saving} className={`${buttonClass} disabled:opacity-50`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {loadedDate === date ? 'Save Changes' : 'Save'}
          </button>
          <ApprovalActions
            isAdmin={isAdmin}
            status={status}
            dirty={dirty}
            busy={saving || reviewing}
            exporting={exporting}
            onExport={handleExport}
            onSubmit={() => handleSave({ submit: true })}
            onApprove={() => handleReview(true)}
            onSendBack={() => handleReview(false)}
          />
        </div>
      </div>

      <ApprovalStatus isAdmin={isAdmin} saved={savedReport} dirty={dirty} what="report" />

      {showImport && (
        <ChatGPTImportDialog prompt={REPORT_PROMPT} what="report" fillLabel="Fill Report" onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {/* Load Panel */}
      {showLoadPanel && (
        <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-brand-card-border bg-black/5 dark:bg-white/5 flex justify-between items-center">
            <h3 className="font-bold text-brand-text text-sm">Saved Reports</h3>
            <button onClick={() => setShowLoadPanel(false)} className="text-brand-text-dim hover:text-brand-text"><X size={18} /></button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-brand-card-border">
            {loadingList ? (
              <div className="p-6 text-center text-brand-text-dim text-sm">Loading...</div>
            ) : savedReports.length === 0 ? (
              <div className="p-6 text-center text-brand-text-dim text-sm">No saved reports yet.</div>
            ) : (
              savedReports.map(r => (
                <div key={r.id} className="p-4 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <button onClick={() => handleLoad(r)} className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-brand-text truncate">{prettyDate(r.date)}</span>
                      <ApprovalChip status={statusOf(r)} />
                    </div>
                    <div className="text-xs text-brand-text-dim">{r.highlights?.length || 0} highlights · last updated by {r.updatedBy || 'unknown'}</div>
                  </button>
                  <button onClick={() => handleDelete(r)} className="text-red-500 hover:text-red-600 p-2 shrink-0" title="Delete report">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
        {/* Editor */}
        <div className="space-y-4">
          {/* Tamil calendar: calculated, with optional corrections */}
          <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
            <button onClick={() => setShowCalendar(v => !v)} className="w-full p-4 flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-brand-text-dim">Tamil calendar</div>
                <div className="text-sm text-brand-text truncate" lang="ta">
                  {cal ? `${cal.tamilMonth} ${cal.tamilDate} · திதி: ${cal.tithi}` : 'Could not calculate for this date'}
                </div>
              </div>
              <span className="flex items-center gap-2 shrink-0">
                {Object.keys(calOverrides).length > 0 && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Edited</span>}
                {showCalendar ? <ChevronUp size={16} className="text-brand-text-dim" /> : <ChevronDown size={16} className="text-brand-text-dim" />}
              </span>
            </button>
            {showCalendar && computedCal && (
              <div className="px-4 pb-4 space-y-3 border-t border-brand-card-border pt-4">
                <p className="text-xs text-brand-text-dim">Calculated for Chennai. Change a value only if your panchangam says otherwise.</p>
                <div className="grid grid-cols-2 gap-3">
                  {CAL_FIELDS.map(f => (
                    <label key={f.key} className="block">
                      <span className="block text-xs font-bold text-brand-text-dim mb-1">{f.label}</span>
                      <input
                        lang="ta"
                        value={cal[f.key]}
                        onChange={(e) => setCalField(f.key, e.target.value)}
                        className={`${inputClass} ${calOverrides[f.key] !== undefined ? 'border-amber-500/60' : ''}`}
                      />
                    </label>
                  ))}
                </div>
                {Object.keys(calOverrides).length > 0 && (
                  <button onClick={() => setCalOverrides({})} className="flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-primary-hover">
                    <RotateCcw size={12} /> Use the calculated values
                  </button>
                )}
              </div>
            )}
          </div>

          {highlights.map((h, idx) => (
            <div key={idx} className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: POSTER.teal }}><School size={16} /></span>
                <input value={h.activity} onChange={(e) => updateHighlight(idx, 'activity', e.target.value)} placeholder="Activity, e.g. Circle Time" className={`${inputClass} font-bold`} />
                <button onClick={() => moveHighlight(idx, -1)} disabled={idx === 0} className="text-brand-text-dim hover:text-brand-text p-2 sm:p-1 disabled:opacity-30" title="Move up" aria-label="Move up"><ChevronUp size={16} /></button>
                <button onClick={() => moveHighlight(idx, 1)} disabled={idx === highlights.length - 1} className="text-brand-text-dim hover:text-brand-text p-2 sm:p-1 disabled:opacity-30" title="Move down" aria-label="Move down"><ChevronDown size={16} /></button>
                <button onClick={() => removeHighlight(idx)} className="text-brand-text-dim hover:text-red-500 p-2 sm:p-1" title="Remove highlight" aria-label="Remove highlight"><X size={16} /></button>
              </div>
              <textarea value={h.classroom} onChange={(e) => updateHighlight(idx, 'classroom', e.target.value)} rows={2} placeholder="In the classroom" className={inputClass} />
              <div className="flex items-start gap-2">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: POSTER.coral }}><HouseHeart size={16} /></span>
                <textarea value={h.home} onChange={(e) => updateHighlight(idx, 'home', e.target.value)} rows={2} placeholder="At home (optional)" className={inputClass} />
              </div>
            </div>
          ))}
          <button onClick={() => setHighlights(prev => [...prev, emptyHighlight()])} className="flex items-center gap-1 text-sm font-bold text-brand-primary hover:text-brand-primary-hover py-2.5 sm:py-0">
            <Plus size={14} /> Add highlight
          </button>
        </div>

        {/* Live Preview */}
        <div className="xl:sticky xl:top-6">
          <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4">
            <ScaledPreview posterRef={previewRef}>
              <ReportPoster ref={previewRef} cal={cal} highlights={highlights} />
            </ScaledPreview>
          </div>
        </div>
      </div>
    </div>
  );
}
