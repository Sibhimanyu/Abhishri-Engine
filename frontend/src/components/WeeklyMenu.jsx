import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { MENU_PROMPT, MENU_SLOTS, parseMenuText, isMenuDate, addDays, weekRangeLabel } from '../utils/menuImport';
import ChatGPTImportDialog from './ChatGPTImportDialog';
import { POSTER, POSTER_WIDTH, DISPLAY_FONT, BODY_FONT, TAMIL_FONT, SCRIPT_FONT, exportPosterPng, fileSlug } from './poster/posterTheme';
import { Flake, ScaledPreview } from './poster/PosterParts';
import { isAdminUser, statusOf, approvalForSave, reviewDocument, APPROVED, PENDING } from './poster/approval';
import { ApprovalActions, ApprovalStatus, ApprovalChip, PendingList } from './poster/ApprovalControls';
import { Coffee, Utensils, Popcorn, Plus, Trash2, Save, FolderOpen, X, Loader2, FilePlus2, ClipboardPaste } from 'lucide-react';

const DAY_THEMES = [
  { key: 'monday', day: 'MONDAY', short: 'MON', color: POSTER.coral },
  { key: 'tuesday', day: 'TUESDAY', short: 'TUE', color: POSTER.teal },
  { key: 'wednesday', day: 'WEDNESDAY', short: 'WED', color: POSTER.orange },
  { key: 'thursday', day: 'THURSDAY', short: 'THU', color: POSTER.deepTeal },
  { key: 'friday', day: 'FRIDAY', short: 'FRI', color: POSTER.brown },
];

const SLOTS = [
  { key: 'morningDrink', label: 'Morning Drink', icon: Coffee, color: POSTER.teal },
  { key: 'lunch', label: 'Lunch', icon: Utensils, color: POSTER.coral },
  { key: 'eveningSnack', label: 'Evening Snack', icon: Popcorn, color: POSTER.orange },
];

// Items are { name, description, translation }: the English name, a short line under it,
// and the Tamil name. The poster lists the English items, then their translations in the same order.
const emptyItem = () => ({ name: '', description: '', translation: '' });
// Briefly (the first poster release) saved menus loaded their Tamil into `description`;
// Tamil found there with no translation set is moved back.
const TAMIL = /[\u0B80-\u0BFF]/;
const normalizeItem = (it) => {
  const item = { name: it?.name || '', description: it?.description || '', translation: it?.translation || '' };
  if (!item.translation && TAMIL.test(item.description)) return { ...item, description: '', translation: item.description };
  return item;
};
const hasText = (it) => it.name?.trim() || it.description?.trim() || it.translation?.trim();

const emptyDay = (theme) => ({
  day: theme.day,
  holiday: false,
  holidayNote: '',
  morningDrink: [emptyItem()],
  lunch: [emptyItem()],
  eveningSnack: [emptyItem()],
});

// startDate/endDate (YYYY-MM-DD) say which days the menu is for: the parent portal
// shows the menu covering today, and the poster's date pill is built from them.
const emptyMenu = () => ({
  startDate: '',
  endDate: '',
  days: DAY_THEMES.map(emptyDay),
});

// The exported poster. Fixed width; the editor scales it down to fit on screen.
const MenuPoster = forwardRef(function MenuPoster({ menu }, ref) {
  const dates = weekRangeLabel(menu.startDate, menu.endDate);
  return (
    <div ref={ref} style={{ width: POSTER_WIDTH, background: POSTER.cream, position: 'relative', overflow: 'hidden', fontFamily: BODY_FONT, color: POSTER.ink }}>
      <Flake size={240} color={POSTER.flake} dots style={{ position: 'absolute', right: -80, top: 100 }} />
      <Flake size={210} color={POSTER.flake} dots style={{ position: 'absolute', left: -95, bottom: 130 }} />
      <Flake size={60} color={POSTER.star} style={{ position: 'absolute', left: 470, top: 100 }} />

      <div style={{ position: 'relative', padding: 44 }}>
        {/* Header */}
        {/* The right column is absolutely placed so "FOOD MENU" keeps the full width on one line. */}
        <div style={{ position: 'relative' }}>
          <div>
            <img src="/logo-coral.png" alt="Abhishri Academy" style={{ height: 78, width: 'auto', display: 'block' }} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 44, letterSpacing: 4, lineHeight: 1, marginTop: 34 }}>OUR WEEKLY</div>
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 400, fontSize: 100, letterSpacing: 3, lineHeight: 1, color: POSTER.coral, marginTop: 8, whiteSpace: 'nowrap' }}>FOOD MENU</div>
          </div>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {dates ? (
              <div style={{ background: POSTER.teal, color: '#ffffff', fontWeight: 800, fontSize: 18, padding: '12px 28px', borderRadius: 999, whiteSpace: 'nowrap' }}>{dates}</div>
            ) : <div />}
            <div style={{ fontFamily: SCRIPT_FONT, fontWeight: 700, fontSize: 38, lineHeight: 1.05, transform: 'rotate(-7deg)', marginBottom: 14 }}>
              <div style={{ color: POSTER.deepTeal }}>Healthy tummies,</div>
              <div style={{ color: POSTER.orange, paddingLeft: 40 }}>happy minds!</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)', gap: 14, marginTop: 34 }}>
          <div />
          {SLOTS.map(slot => {
            const Icon = slot.icon;
            return (
              <div key={slot.key} style={{ background: slot.color, color: '#ffffff', borderRadius: 14, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 24 }}>
                <Icon size={24} strokeWidth={2} /> {slot.label}
              </div>
            );
          })}

          {menu.days.map((d, dayIdx) => {
            const theme = DAY_THEMES[dayIdx];
            return (
              <React.Fragment key={theme.key}>
                <div style={{ background: theme.color, color: '#ffffff', borderRadius: 16, minHeight: 128, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 46, letterSpacing: 2, lineHeight: 1 }}>{theme.short}</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: 3, marginTop: 8 }}>{theme.day}</div>
                </div>
                {d.holiday ? (
                  <div style={{ gridColumn: 'span 3', background: '#ffffff', border: `2px dashed ${theme.color}`, borderRadius: 16, minHeight: 128, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '18px 22px' }}>
                    <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 34, lineHeight: 1, color: theme.color }}>Holiday</div>
                    {d.holidayNote && <div style={{ fontWeight: 600, fontSize: 17, color: POSTER.inkDim, marginTop: 8 }}>{d.holidayNote}</div>}
                  </div>
                ) : SLOTS.map(slot => {
                  // Every item in a cell is equal: English names on one comma-separated line,
                  // any descriptions under them, then the Tamil names in the same order.
                  const items = (d[slot.key] || []).filter(hasText);
                  const join = (field) => items.map(it => it[field]?.trim()).filter(Boolean).join(', ');
                  const [names, descriptions, tamil] = [join('name'), join('description'), join('translation')];
                  return (
                    <div key={slot.key} style={{ background: '#ffffff', borderRadius: 16, minHeight: 128, padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      {!items.length ? (
                        <span style={{ color: '#B8B0A5', fontSize: 20 }}>—</span>
                      ) : (
                        <>
                          {names && <div style={{ fontWeight: 800, fontSize: 23, lineHeight: 1.25 }}>{names}</div>}
                          {descriptions && <div style={{ fontWeight: 500, fontSize: 17.5, color: POSTER.inkDim, marginTop: 6 }}>{descriptions}</div>}
                          {tamil && <div style={{ fontFamily: TAMIL_FONT, fontWeight: 600, fontSize: 17, lineHeight: 1.45, color: POSTER.deepTeal, marginTop: names || descriptions ? 8 : 0 }}>{tamil}</div>}
                        </>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// What approval covers: the menu as it would print. Compared to tell unsaved edits apart.
const menuSignature = (m) => JSON.stringify({ startDate: m.startDate, endDate: m.endDate, days: m.days });

export default function WeeklyMenu() {
  const { currentUser, userData } = useAuth();
  const email = currentUser?.email;
  const isAdmin = isAdminUser(userData);

  const [savedMenus, setSavedMenus] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menu, setMenu] = useState(emptyMenu());
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importWarnings, setImportWarnings] = useState([]);
  const [savedSignature, setSavedSignature] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    const q = query(collection(firestore, 'weekly_menus'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSavedMenus(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingList(false);
    }, (err) => {
      console.error('Failed to load saved menus:', err);
      setLoadingList(false);
    });
    return () => unsub();
  }, []);

  const updateItem = (dayIdx, slot, itemIdx, field, value) => {
    setMenu(prev => {
      const days = [...prev.days];
      const items = [...days[dayIdx][slot]];
      items[itemIdx] = { ...items[itemIdx], [field]: value };
      days[dayIdx] = { ...days[dayIdx], [slot]: items };
      return { ...prev, days };
    });
  };

  const updateDay = (dayIdx, patch) => {
    setMenu(prev => {
      const days = [...prev.days];
      days[dayIdx] = { ...days[dayIdx], ...patch };
      return { ...prev, days };
    });
  };

  const addItem = (dayIdx, slot) => {
    setMenu(prev => {
      const days = [...prev.days];
      days[dayIdx] = { ...days[dayIdx], [slot]: [...days[dayIdx][slot], emptyItem()] };
      return { ...prev, days };
    });
  };

  const removeItem = (dayIdx, slot, itemIdx) => {
    setMenu(prev => {
      const days = [...prev.days];
      const items = days[dayIdx][slot].filter((_, i) => i !== itemIdx);
      days[dayIdx] = { ...days[dayIdx], [slot]: items.length ? items : [emptyItem()] };
      return { ...prev, days };
    });
  };

  const savedMenu = activeMenuId ? savedMenus.find(m => m.id === activeMenuId) : null;
  const status = statusOf(savedMenu);
  const dirty = !savedMenu || menuSignature(menu) !== savedSignature;
  const canExport = isAdmin || (status === APPROVED && !dirty);

  const handleNew = () => {
    setActiveMenuId(null);
    setSavedSignature(null);
    setMenu(emptyMenu());
    setImportWarnings([]);
    setShowLoadPanel(false);
  };

  const handleLoad = (saved) => {
    const loaded = {
      // Menus saved before dates existed load without them; they must be set before saving again.
      startDate: isMenuDate(saved.startDate) ? saved.startDate : '',
      endDate: isMenuDate(saved.endDate) ? saved.endDate : '',
      days: (saved.days && saved.days.length === DAY_THEMES.length)
        ? saved.days.map((d, i) => ({
            day: DAY_THEMES[i].day,
            holiday: !!d.holiday,
            holidayNote: d.holidayNote || '',
            ...Object.fromEntries(MENU_SLOTS.map(s => [s, d[s]?.length ? d[s].map(normalizeItem) : [emptyItem()]])),
          }))
        : emptyMenu().days
    };
    setActiveMenuId(saved.id);
    setMenu(loaded);
    setSavedSignature(menuSignature(loaded));
    setImportWarnings([]);
    setShowLoadPanel(false);
  };

  const handleImport = (text) => {
    const parsed = parseMenuText(text);
    const hasContent = menu.days.some(d => d.holiday || MENU_SLOTS.some(s => d[s].some(hasText)));
    if (hasContent && !window.confirm('Replace the menu currently in the editor with the pasted one?')) return;

    // Imported menus always start as a new, unsaved menu so a loaded one is never overwritten by accident.
    setActiveMenuId(null);
    setMenu({
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      days: DAY_THEMES.map(theme => {
        const day = parsed.days[theme.key];
        return {
          day: theme.day,
          holiday: day.holiday,
          holidayNote: day.holidayNote,
          ...Object.fromEntries(MENU_SLOTS.map(s => [s, day[s].length ? day[s] : [emptyItem()]])),
        };
      }),
    });
    setImportWarnings(parsed.warnings);
    setShowImport(false);
    setShowLoadPanel(false);
  };

  // `submit` also sends it for approval. A non-admin's plain save leaves it a draft,
  // so saving an approved menu with changes puts it back through approval.
  const handleSave = async ({ submit = false } = {}) => {
    // Re-saving an unchanged approved menu as a draft would only undo its approval.
    if (!isAdmin && !submit && !dirty) return;
    if (!isMenuDate(menu.startDate) || !isMenuDate(menu.endDate)) {
      alert('Please set the dates this menu is for before saving.');
      return;
    }
    if (menu.endDate < menu.startDate) {
      alert('The "To" date is before the "From" date.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        startDate: menu.startDate,
        endDate: menu.endDate,
        // Kept for the saved-menus list and audit names; always built from the dates.
        weekLabel: weekRangeLabel(menu.startDate, menu.endDate),
        days: menu.days,
        approval: approvalForSave({ isAdmin, email, submit }),
        updatedAt: serverTimestamp(),
        updatedBy: email || 'unknown',
      };
      let id = activeMenuId;
      if (activeMenuId) {
        await setDoc(doc(firestore, 'weekly_menus', activeMenuId), payload, { merge: true });
        logAudit({ action: 'WEEKLY_MENU_UPDATED', module: 'school_calendar', targetId: activeMenuId, targetName: payload.weekLabel, performedBy: email, details: {} });
      } else {
        const ref = await addDoc(collection(firestore, 'weekly_menus'), { ...payload, createdAt: serverTimestamp(), createdBy: email || 'unknown' });
        id = ref.id;
        setActiveMenuId(ref.id);
        logAudit({ action: 'WEEKLY_MENU_CREATED', module: 'school_calendar', targetId: ref.id, targetName: payload.weekLabel, performedBy: email, details: {} });
      }
      setSavedSignature(menuSignature(menu));
      if (submit) logAudit({ action: 'WEEKLY_MENU_SENT_FOR_APPROVAL', module: 'school_calendar', targetId: id, targetName: payload.weekLabel, performedBy: email, details: {} });
    } catch (err) {
      console.error('Failed to save menu:', err);
      alert('Failed to save menu.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (saved) => {
    if (!window.confirm(`Delete the menu "${saved.weekLabel}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(firestore, 'weekly_menus', saved.id));
      logAudit({ action: 'WEEKLY_MENU_DELETED', module: 'school_calendar', targetId: saved.id, targetName: saved.weekLabel, performedBy: email, details: {} });
      if (activeMenuId === saved.id) handleNew();
    } catch (err) {
      console.error('Failed to delete menu:', err);
      alert('Failed to delete menu.');
    }
  };

  const handleReview = async (approve) => {
    if (!savedMenu) return;
    let note = '';
    if (!approve) {
      note = (window.prompt('What should be changed? This note is shown to whoever sent it.') || '').trim();
      if (!note) return;
    }
    setReviewing(true);
    try {
      await reviewDocument({ collectionName: 'weekly_menus', id: savedMenu.id, approve, note, email, reviewerName: userData?.displayName, auditPrefix: 'WEEKLY_MENU', targetName: savedMenu.weekLabel });
    } catch (err) {
      console.error('Failed to review menu:', err);
      alert('Could not save your review. Please try again.');
    } finally {
      setReviewing(false);
    }
  };

  const handleExport = async () => {
    if (!previewRef.current || !canExport) return;
    setExporting(true);
    try {
      await exportPosterPng(previewRef.current, `${fileSlug(weekRangeLabel(menu.startDate, menu.endDate), 'weekly-menu')}.png`);

      logAudit({
        action: 'WEEKLY_MENU_EXPORTED',
        module: 'school_calendar',
        targetId: activeMenuId,
        targetName: weekRangeLabel(menu.startDate, menu.endDate) || 'Untitled menu',
        performedBy: email,
        details: {}
      });
    } catch (err) {
      console.error('Failed to export menu image:', err);
      alert('Failed to export image. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <PendingList
          items={savedMenus.filter(m => statusOf(m) === PENDING && m.id !== activeMenuId)}
          labelOf={m => m.weekLabel || 'Untitled menu'}
          onReview={handleLoad}
          what="menu"
        />
      )}

      {/* Toolbar */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4 md:p-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="w-full sm:w-auto sm:shrink-0 max-w-full">
          <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-1.5">Menu Dates</label>
          <div className="grid grid-cols-[1fr_auto_1fr] sm:flex sm:flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="From"
              value={menu.startDate}
              onChange={(e) => {
                const startDate = e.target.value;
                // Picking a start fills in that week's Friday when no end is set yet.
                setMenu(prev => ({ ...prev, startDate, endDate: prev.endDate || (isMenuDate(startDate) ? addDays(startDate, 4) : '') }));
              }}
              className="min-w-0 w-full sm:w-auto bg-brand-bg border border-brand-card-border rounded-lg py-2 px-2 sm:px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
            <span className="text-brand-text-dim text-sm">to</span>
            <input
              type="date"
              aria-label="To"
              value={menu.endDate}
              min={menu.startDate || undefined}
              onChange={(e) => setMenu(prev => ({ ...prev, endDate: e.target.value }))}
              className="min-w-0 w-full sm:w-auto bg-brand-bg border border-brand-card-border rounded-lg py-2 px-2 sm:px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          <p className="text-xs text-brand-text-dim mt-1.5">Filled in by Import from ChatGPT. Parents see the menu on these dates.</p>
        </div>
        <div className="grid grid-cols-2 w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <button
            onClick={() => setShowLoadPanel(v => !v)}
            className="flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <FolderOpen size={16} /> Load
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <ClipboardPaste size={16} /> Import from ChatGPT
          </button>
          <button
            onClick={handleNew}
            className="flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <FilePlus2 size={16} /> New
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {activeMenuId ? 'Save Changes' : 'Save'}
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

      <ApprovalStatus isAdmin={isAdmin} saved={savedMenu} dirty={dirty} what="menu" />

      {importWarnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
          <div className="text-sm text-brand-text">
            <div className="font-bold mb-1">Menu imported. Some parts were missing from the pasted text:</div>
            <ul className="list-disc pl-5 text-brand-text-dim">
              {importWarnings.map(w => <li key={w}>{w}</li>)}
            </ul>
          </div>
          <button onClick={() => setImportWarnings([])} className="text-brand-text-dim hover:text-brand-text shrink-0"><X size={18} /></button>
        </div>
      )}

      {showImport && (
        <ChatGPTImportDialog prompt={MENU_PROMPT} what="menu" fillLabel="Fill Menu" onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {/* Load Panel */}
      {showLoadPanel && (
        <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-brand-card-border bg-black/5 dark:bg-white/5 flex justify-between items-center">
            <h3 className="font-bold text-brand-text text-sm">Saved Menus</h3>
            <button onClick={() => setShowLoadPanel(false)} className="text-brand-text-dim hover:text-brand-text"><X size={18} /></button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-brand-card-border">
            {loadingList ? (
              <div className="p-6 text-center text-brand-text-dim text-sm">Loading...</div>
            ) : savedMenus.length === 0 ? (
              <div className="p-6 text-center text-brand-text-dim text-sm">No saved menus yet.</div>
            ) : (
              savedMenus.map(m => (
                <div key={m.id} className="p-4 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <button onClick={() => handleLoad(m)} className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-brand-text truncate">{m.weekLabel || 'Untitled menu'}</span>
                      <ApprovalChip status={statusOf(m)} />
                    </div>
                    <div className="text-xs text-brand-text-dim">Last updated by {m.updatedBy || 'unknown'}</div>
                  </button>
                  <button onClick={() => handleDelete(m)} className="text-red-500 hover:text-red-600 p-2 shrink-0" title="Delete menu">
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
          {menu.days.map((d, dayIdx) => {
            const theme = DAY_THEMES[dayIdx];
            return (
              <div key={theme.key} className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
                {/* Translucent day colour reads on both the light and dark panel. */}
                <div className="p-4 flex items-center gap-3 border-b border-brand-card-border" style={{ background: `${theme.color}1F` }}>
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center text-white text-sm font-black tracking-wide" style={{ background: theme.color }}>
                    {theme.short}
                  </div>
                  <h3 className="font-black tracking-wide text-brand-text flex-1">{theme.day}</h3>
                  <label className="flex items-center gap-2 text-xs font-bold text-brand-text-dim cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!d.holiday}
                      onChange={(e) => updateDay(dayIdx, { holiday: e.target.checked })}
                      className="accent-brand-primary"
                    />
                    Holiday
                  </label>
                </div>
                <div className="p-4 space-y-4">
                  {d.holiday ? (
                    <div>
                      <input
                        value={d.holidayNote || ''}
                        onChange={(e) => updateDay(dayIdx, { holidayNote: e.target.value })}
                        placeholder="Holiday name (optional), e.g. Gandhi Jayanti"
                        className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                      />
                      <p className="text-xs text-brand-text-dim mt-2">The whole day shows as a holiday on the menu. Untick to bring its meals back.</p>
                    </div>
                  ) : SLOTS.map(slot => {
                    const Icon = slot.icon;
                    return (
                      <div key={slot.key}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={14} style={{ color: slot.color }} />
                          <span className="text-xs font-bold uppercase tracking-wider text-brand-text-dim">{slot.label}</span>
                        </div>
                        <div className="space-y-2">
                          {d[slot.key].map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-start gap-2">
                              <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                              <input
                                value={item.name}
                                onChange={(e) => updateItem(dayIdx, slot.key, itemIdx, 'name', e.target.value)}
                                placeholder="Item name"
                                className="min-w-0 bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                              />
                              <input
                                value={item.description}
                                onChange={(e) => updateItem(dayIdx, slot.key, itemIdx, 'description', e.target.value)}
                                placeholder="Description (optional)"
                                className="min-w-0 bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                              />
                              <input
                                value={item.translation}
                                onChange={(e) => updateItem(dayIdx, slot.key, itemIdx, 'translation', e.target.value)}
                                placeholder="Tamil (optional)"
                                lang="ta"
                                className="col-span-2 min-w-0 bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                              />
                              </div>
                              <button
                                onClick={() => removeItem(dayIdx, slot.key, itemIdx)}
                                className="text-brand-text-dim hover:text-red-500 p-2.5 -m-1.5 sm:p-1 sm:m-0 sm:mt-1 shrink-0"
                                title="Remove item"
                                aria-label="Remove item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addItem(dayIdx, slot.key)}
                            className="flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-primary-hover py-2.5 -my-1.5 sm:py-0 sm:my-0"
                          >
                            <Plus size={12} /> Add item
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Preview (the poster node is exported to PNG at full size; only its wrapper is scaled) */}
        <div className="xl:sticky xl:top-6">
          <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4">
            <ScaledPreview posterRef={previewRef}>
              <MenuPoster ref={previewRef} menu={menu} />
            </ScaledPreview>
          </div>
        </div>
      </div>
    </div>
  );
}
