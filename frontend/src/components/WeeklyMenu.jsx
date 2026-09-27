import React, { useState, useEffect, useLayoutEffect, useRef, forwardRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { toPng } from 'html-to-image';
import { saveFile } from '../utils/native';
import { MENU_PROMPT, MENU_SLOTS, parseMenuText } from '../utils/menuImport';
// Self-hosted so html-to-image can embed them in the exported PNG.
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import '@fontsource/caveat/700.css';
import { Coffee, Utensils, Popcorn, Plus, Trash2, Download, Save, FolderOpen, X, Loader2, FilePlus2, ClipboardPaste, Copy, Check } from 'lucide-react';

// Fixed palette for the exported poster: literal hex, not the app's CSS variables,
// so the PNG renders the same regardless of the admin panel's light/dark mode.
const POSTER = {
  cream: '#FBF3E6',
  coral: '#E2665E',
  teal: '#7EC8C6',
  orange: '#E99A3E',
  deepTeal: '#4E7C7A',
  brown: '#AE7F5F',
  ink: '#2E2A26',
  inkDim: '#6F6A64',
  flake: '#F2E4CB',
  star: '#F6E27F',
};
const POSTER_WIDTH = 1000;
const DISPLAY_FONT = "'Fredoka Variable', 'Nunito Variable', system-ui, sans-serif";
const BODY_FONT = "'Nunito Variable', system-ui, sans-serif";

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

// Items are { name, description }. Menus saved before the poster redesign called the
// second field `translation`; it rendered in the same place, so it carries over.
const emptyItem = () => ({ name: '', description: '' });
const normalizeItem = (it) => ({ name: it?.name || '', description: it?.description ?? it?.translation ?? '' });
const hasText = (it) => it.name?.trim() || it.description?.trim();

const emptyDay = (theme) => ({
  day: theme.day,
  morningDrink: [emptyItem()],
  lunch: [emptyItem()],
  eveningSnack: [emptyItem()],
});

const emptyMenu = () => ({
  weekLabel: '',
  days: DAY_THEMES.map(emptyDay),
});

// Six-armed flake: `dots` puts a ball on each arm (the big background shapes); without, it's the small asterisk.
const Flake = ({ size, color, dots, style }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={style} aria-hidden="true">
    {[0, 60, 120].map(a => (
      <line key={a} x1="-36" y1="0" x2="36" y2="0" stroke={color} strokeWidth={dots ? 10 : 9} strokeLinecap="round" transform={`rotate(${a + 90})`} />
    ))}
    {dots && [0, 60, 120, 180, 240, 300].map(a => (
      <circle key={a} cx="38" cy="0" r="10" fill={color} transform={`rotate(${a + 90})`} />
    ))}
  </svg>
);

// The exported poster. Fixed width; the editor scales it down to fit on screen.
const MenuPoster = forwardRef(function MenuPoster({ menu }, ref) {
  return (
    <div ref={ref} style={{ width: POSTER_WIDTH, background: POSTER.cream, position: 'relative', overflow: 'hidden', fontFamily: BODY_FONT, color: POSTER.ink }}>
      <Flake size={240} color={POSTER.flake} dots style={{ position: 'absolute', right: -80, top: 100 }} />
      <Flake size={210} color={POSTER.flake} dots style={{ position: 'absolute', left: -95, bottom: 130 }} />
      <Flake size={60} color={POSTER.star} style={{ position: 'absolute', left: 470, top: 100 }} />

      <div style={{ position: 'relative', padding: '44px 44px 0' }}>
        {/* Header */}
        {/* The right column is absolutely placed so "FOOD MENU" keeps the full width on one line. */}
        <div style={{ position: 'relative' }}>
          <div>
            <img src="/logo-coral.png" alt="Abhishri Academy" style={{ height: 78, width: 'auto', display: 'block' }} />
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, fontSize: 44, letterSpacing: 4, lineHeight: 1, marginTop: 34 }}>OUR WEEKLY</div>
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 400, fontSize: 100, letterSpacing: 3, lineHeight: 1, color: POSTER.coral, marginTop: 8, whiteSpace: 'nowrap' }}>FOOD MENU</div>
          </div>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {menu.weekLabel ? (
              <div style={{ background: POSTER.teal, color: '#ffffff', fontWeight: 800, fontSize: 18, padding: '12px 28px', borderRadius: 999, whiteSpace: 'nowrap' }}>{menu.weekLabel}</div>
            ) : <div />}
            <div style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 38, lineHeight: 1.05, transform: 'rotate(-7deg)', marginBottom: 14 }}>
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
                {SLOTS.map(slot => {
                  const [main, ...sides] = (d[slot.key] || []).filter(hasText);
                  return (
                    <div key={slot.key} style={{ background: '#ffffff', borderRadius: 16, minHeight: 128, padding: '18px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      {!main ? (
                        <span style={{ color: '#B8B0A5', fontSize: 20 }}>—</span>
                      ) : (
                        <>
                          <div style={{ fontWeight: 800, fontSize: 21, lineHeight: 1.2 }}>{main.name}</div>
                          {main.description && <div style={{ fontWeight: 500, fontSize: 15.5, color: POSTER.inkDim, marginTop: 6 }}>{main.description}</div>}
                          {sides.map((it, i) => (
                            <div key={i} style={{ fontWeight: 500, fontSize: 15.5, color: POSTER.inkDim, marginTop: 6 }}>
                              <span style={{ color: POSTER.coral, fontWeight: 800, marginRight: 6 }}>+</span>
                              {it.name}{it.description ? ` · ${it.description}` : ''}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Notes */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 24, fontWeight: 600, fontSize: 16, color: '#5F5A55' }}>
          {[['Freshly prepared in our kitchen every day', POSTER.teal], ['Please tell us about any food allergies', POSTER.coral]].map(([text, dot]) => (
            <span key={text} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: dot }} /> {text}
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', marginTop: 26, background: POSTER.coral, color: '#ffffff', padding: '26px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <img src="/logo-white.png" alt="Abhishri Academy" style={{ height: 60, width: 'auto', display: 'block' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 21 }}>+91 95 004 004 59</div>
          <div style={{ fontWeight: 600, fontSize: 15.5, marginTop: 4 }}>abhishriacademy@zohomail.in · www.abhishriacademy.in</div>
        </div>
      </div>
    </div>
  );
});

export default function WeeklyMenu() {
  const { currentUser } = useAuth();
  const email = currentUser?.email;

  const [savedMenus, setSavedMenus] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menu, setMenu] = useState(emptyMenu());
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState([]);
  const [promptCopied, setPromptCopied] = useState(false);
  const previewRef = useRef(null);
  const previewBoxRef = useRef(null);
  const [previewFit, setPreviewFit] = useState({ scale: 1, height: 0 });
  const promptRef = useRef(null);

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

  useLayoutEffect(() => {
    const box = previewBoxRef.current;
    const poster = previewRef.current;
    if (!box || !poster) return;
    const fit = () => {
      const scale = Math.min(1, box.clientWidth / POSTER_WIDTH);
      setPreviewFit({ scale, height: poster.offsetHeight * scale });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(poster);
    return () => ro.disconnect();
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

  const handleNew = () => {
    setActiveMenuId(null);
    setMenu(emptyMenu());
    setImportWarnings([]);
    setShowLoadPanel(false);
  };

  const handleLoad = (saved) => {
    setActiveMenuId(saved.id);
    setMenu({
      weekLabel: saved.weekLabel || '',
      days: (saved.days && saved.days.length === DAY_THEMES.length)
        ? saved.days.map((d, i) => ({
            day: DAY_THEMES[i].day,
            ...Object.fromEntries(MENU_SLOTS.map(s => [s, d[s]?.length ? d[s].map(normalizeItem) : [emptyItem()]])),
          }))
        : emptyMenu().days
    });
    setImportWarnings([]);
    setShowLoadPanel(false);
  };

  const openImport = () => {
    setImportText('');
    setImportError('');
    setPromptCopied(false);
    setShowImport(true);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MENU_PROMPT);
    } catch {
      // Older WKWebViews lack the async clipboard API; fall back to selecting the text.
      promptRef.current?.select();
      if (!document.execCommand('copy')) {
        alert('Could not copy automatically. Select the instructions and copy them manually.');
        return;
      }
    }
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const handleImport = () => {
    let parsed;
    try {
      parsed = parseMenuText(importText);
    } catch (err) {
      setImportError(err.message);
      return;
    }
    const hasContent = menu.days.some(d => MENU_SLOTS.some(s => d[s].some(hasText)));
    if (hasContent && !window.confirm('Replace the menu currently in the editor with the pasted one?')) return;

    // Imported menus always start as a new, unsaved menu so a loaded one is never overwritten by accident.
    setActiveMenuId(null);
    setMenu({
      weekLabel: parsed.weekLabel || menu.weekLabel,
      days: DAY_THEMES.map(theme => {
        const day = parsed.days[theme.key];
        return {
          day: theme.day,
          ...Object.fromEntries(MENU_SLOTS.map(s => [s, day[s].length ? day[s] : [emptyItem()]])),
        };
      }),
    });
    setImportWarnings(parsed.warnings);
    setShowImport(false);
    setShowLoadPanel(false);
  };

  const handleSave = async () => {
    if (!menu.weekLabel.trim()) {
      alert('Please give this menu a week label (e.g. "Week of 11 Aug 2026") before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        weekLabel: menu.weekLabel.trim(),
        days: menu.days,
        updatedAt: serverTimestamp(),
        updatedBy: email || 'unknown',
      };
      if (activeMenuId) {
        await setDoc(doc(firestore, 'weekly_menus', activeMenuId), payload, { merge: true });
        logAudit({ action: 'WEEKLY_MENU_UPDATED', module: 'school_calendar', targetId: activeMenuId, targetName: payload.weekLabel, performedBy: email, details: {} });
      } else {
        const ref = await addDoc(collection(firestore, 'weekly_menus'), { ...payload, createdAt: serverTimestamp(), createdBy: email || 'unknown' });
        setActiveMenuId(ref.id);
        logAudit({ action: 'WEEKLY_MENU_CREATED', module: 'school_calendar', targetId: ref.id, targetName: payload.weekLabel, performedBy: email, details: {} });
      }
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

  const handleExport = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      // Two passes: html-to-image sometimes misses fonts/images on the very first render.
      const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: POSTER.cream };
      await toPng(previewRef.current, opts);
      const dataUrl = await toPng(previewRef.current, opts);
      const safeName = (menu.weekLabel || 'weekly-menu').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/(^-|-$)/g, '');
      await saveFile(`${safeName || 'weekly-menu'}.png`, dataUrl);

      logAudit({
        action: 'WEEKLY_MENU_EXPORTED',
        module: 'school_calendar',
        targetId: activeMenuId,
        targetName: menu.weekLabel || 'Untitled menu',
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
      {/* Toolbar */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4 md:p-6 flex flex-col md:flex-row gap-4 md:items-center justify-between">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-1.5">Week Label</label>
          <input
            type="text"
            value={menu.weekLabel}
            onChange={(e) => setMenu(prev => ({ ...prev, weekLabel: e.target.value }))}
            placeholder='e.g. "Week of 11 Aug 2026"'
            className="w-full md:w-80 bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowLoadPanel(v => !v)}
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <FolderOpen size={16} /> Load
          </button>
          <button
            onClick={openImport}
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <ClipboardPaste size={16} /> Import from ChatGPT
          </button>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            <FilePlus2 size={16} /> New
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {activeMenuId ? 'Save Changes' : 'Save'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export as PNG
          </button>
        </div>
      </div>

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

      {/* Import from ChatGPT */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-brand-sidebar border border-brand-card-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative">
            <button onClick={() => setShowImport(false)} className="absolute top-4 right-4 text-brand-text-dim hover:text-brand-text">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-brand-text mb-4">Import from ChatGPT</h2>

            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-bold text-brand-text-dim uppercase tracking-wider">1. Give ChatGPT these instructions with your menu</label>
                  <button
                    onClick={copyPrompt}
                    className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-3 py-1.5 rounded-lg font-medium text-xs transition-colors shrink-0"
                  >
                    {promptCopied ? <Check size={14} /> : <Copy size={14} />} {promptCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea
                  ref={promptRef}
                  readOnly
                  value={MENU_PROMPT}
                  rows={6}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 text-xs font-mono text-brand-text-dim focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">2. Paste ChatGPT's reply</label>
                <textarea
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setImportError(''); }}
                  rows={8}
                  placeholder="Paste the whole reply here"
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 text-sm font-mono text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                />
                {importError && <p className="text-sm text-red-500 mt-2">{importError}</p>}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowImport(false)}
                  className="bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
                >
                  Fill Menu
                </button>
              </div>
            </div>
          </div>
        </div>
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
                    <div className="font-bold text-brand-text truncate">{m.weekLabel || 'Untitled menu'}</div>
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
                  <h3 className="font-black tracking-wide text-brand-text">{theme.day}</h3>
                </div>
                <div className="p-4 space-y-4">
                  {SLOTS.map(slot => {
                    const Icon = slot.icon;
                    return (
                      <div key={slot.key}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={14} style={{ color: slot.color }} />
                          <span className="text-xs font-bold uppercase tracking-wider text-brand-text-dim">{slot.label}</span>
                        </div>
                        <div className="space-y-2">
                          {d[slot.key].map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-2">
                              <input
                                value={item.name}
                                onChange={(e) => updateItem(dayIdx, slot.key, itemIdx, 'name', e.target.value)}
                                placeholder={itemIdx === 0 ? 'Main item' : 'Side item (shown as + …)'}
                                className="flex-1 min-w-0 bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                              />
                              <input
                                value={item.description}
                                onChange={(e) => updateItem(dayIdx, slot.key, itemIdx, 'description', e.target.value)}
                                placeholder="Description (optional)"
                                className="flex-1 min-w-0 bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                              />
                              <button
                                onClick={() => removeItem(dayIdx, slot.key, itemIdx)}
                                className="text-brand-text-dim hover:text-red-500 p-1 shrink-0"
                                title="Remove item"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addItem(dayIdx, slot.key)}
                            className="flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-primary-hover"
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
            <div ref={previewBoxRef} className="rounded-lg overflow-hidden" style={{ height: previewFit.height || undefined }}>
              <div style={{ width: POSTER_WIDTH, transform: `scale(${previewFit.scale})`, transformOrigin: 'top left' }}>
                <MenuPoster ref={previewRef} menu={menu} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
