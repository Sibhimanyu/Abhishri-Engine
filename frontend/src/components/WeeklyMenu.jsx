import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { toPng } from 'html-to-image';
import { Coffee, UtensilsCrossed, Apple, Plus, Trash2, Download, Save, FolderOpen, X, Loader2, FilePlus2 } from 'lucide-react';

// Fixed brand palette for the exported image — literal hex, not the app's CSS variables,
// so the PNG always renders the same regardless of the admin panel's light/dark mode.
const BRAND = {
  primary: '#F1615B',   // coral — Morning Drink header (matches --color-brand-primary)
  secondary: '#66C8C8', // teal — Lunch header (matches --color-brand-secondary)
  accent: '#9B7FD4',    // purple — Evening Snack header (new, third column to complete the trio)
  ink: '#1F2937',
  inkDim: '#6B7280',
  border: '#E7E2D8',
};

const DAY_THEMES = [
  { key: 'monday', day: 'MONDAY', emoji: '⭐', tint: '#FDEEEC' },
  { key: 'tuesday', day: 'TUESDAY', emoji: '🍉', tint: '#FDF3E3' },
  { key: 'wednesday', day: 'WEDNESDAY', emoji: '🌸', tint: '#FCE9F3' },
  { key: 'thursday', day: 'THURSDAY', emoji: '🌿', tint: '#EAF6EA' },
  { key: 'friday', day: 'FRIDAY', emoji: '🌴', tint: '#E9F5F5' },
];

const SLOTS = [
  { key: 'morningDrink', label: 'Morning Drink', icon: Coffee, color: BRAND.primary },
  { key: 'lunch', label: 'Lunch', icon: UtensilsCrossed, color: BRAND.secondary },
  { key: 'eveningSnack', label: 'Evening Snack', icon: Apple, color: BRAND.accent },
];

const emptyItem = () => ({ name: '', translation: '' });

const emptyDay = (theme) => ({
  day: theme.day,
  emoji: theme.emoji,
  morningDrink: [emptyItem()],
  lunch: [emptyItem()],
  eveningSnack: [emptyItem()],
});

const emptyMenu = () => ({
  weekLabel: '',
  days: DAY_THEMES.map(emptyDay),
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

  const updateEmoji = (dayIdx, value) => {
    setMenu(prev => {
      const days = [...prev.days];
      days[dayIdx] = { ...days[dayIdx], emoji: value };
      return { ...prev, days };
    });
  };

  const handleNew = () => {
    setActiveMenuId(null);
    setMenu(emptyMenu());
    setShowLoadPanel(false);
  };

  const handleLoad = (saved) => {
    setActiveMenuId(saved.id);
    setMenu({
      weekLabel: saved.weekLabel || '',
      days: (saved.days && saved.days.length === DAY_THEMES.length) ? saved.days : emptyMenu().days
    });
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
      // Two passes: html-to-image sometimes misses fonts/images on the very first render.
      await toPng(previewRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
      const dataUrl = await toPng(previewRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      const safeName = (menu.weekLabel || 'weekly-menu').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/(^-|-$)/g, '');
      link.download = `${safeName || 'weekly-menu'}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

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
                <div className="p-4 flex items-center gap-3 border-b border-brand-card-border" style={{ background: theme.tint }}>
                  <input
                    value={d.emoji}
                    onChange={(e) => updateEmoji(dayIdx, e.target.value)}
                    maxLength={2}
                    className="w-10 h-10 text-center text-xl bg-white/70 border border-brand-card-border rounded-lg focus:outline-none focus:border-brand-primary"
                    title="Day icon (emoji)"
                  />
                  <h3 className="font-black tracking-wide" style={{ color: BRAND.ink }}>{d.day}</h3>
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
                                placeholder="Item name"
                                className="flex-1 min-w-0 bg-brand-bg border border-brand-card-border rounded-lg py-1.5 px-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                              />
                              <input
                                value={item.translation}
                                onChange={(e) => updateItem(dayIdx, slot.key, itemIdx, 'translation', e.target.value)}
                                placeholder="Translation (optional)"
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

        {/* Live Preview (this exact node is exported to PNG) */}
        <div className="xl:sticky xl:top-6">
          <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-4 overflow-x-auto">
            <div
              ref={previewRef}
              style={{ background: '#ffffff', minWidth: 640, fontFamily: "'Inter', system-ui, sans-serif" }}
              className="rounded-2xl overflow-hidden border"
            >
              {/* Header: logo + week label */}
              <div style={{ background: '#ffffff', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${BRAND.border}` }}>
                <img src="/logo-coral.png" alt="Abhishri Academy" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: BRAND.ink, letterSpacing: 0.3 }}>Weekly Food Menu</div>
                  {menu.weekLabel && <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkDim }}>{menu.weekLabel}</div>}
                </div>
              </div>

              {/* Column Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)' }}>
                <div style={{ background: '#ffffff' }} />
                {SLOTS.map(slot => {
                  const Icon = slot.icon;
                  return (
                    <div key={slot.key} style={{ background: slot.color, color: '#ffffff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, fontSize: 13, letterSpacing: 0.5 }}>
                      <Icon size={16} /> {slot.label.toUpperCase()}
                    </div>
                  );
                })}
              </div>

              {/* Day Rows */}
              {menu.days.map((d, dayIdx) => {
                const theme = DAY_THEMES[dayIdx];
                return (
                  <div
                    key={theme.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px repeat(3, 1fr)',
                      borderTop: `1px solid ${BRAND.border}`,
                    }}
                  >
                    {/* Day label */}
                    <div style={{ background: theme.tint, padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRight: `1px solid ${BRAND.border}` }}>
                      <div style={{ fontSize: 22, lineHeight: 1 }}>{d.emoji}</div>
                      <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 0.5, color: BRAND.ink, textAlign: 'center' }}>{d.day}</div>
                    </div>

                    {/* Three meal columns */}
                    {SLOTS.map(slot => {
                      const items = (d[slot.key] || []).filter(it => it.name?.trim() || it.translation?.trim());
                      const isSingle = items.length <= 1;
                      return (
                        <div key={slot.key} style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${BRAND.border}` }}>
                          {items.length === 0 ? (
                            <span style={{ color: BRAND.inkDim, fontSize: 12, fontStyle: 'italic' }}>—</span>
                          ) : isSingle ? (
                            <div style={{ textAlign: 'center', width: '100%' }}>
                              <div style={{ fontWeight: 800, fontSize: 14, color: BRAND.ink }}>{items[0].name}</div>
                              {items[0].translation && <div style={{ fontSize: 12, color: BRAND.inkDim, marginTop: 2 }}>{items[0].translation}</div>}
                            </div>
                          ) : (
                            <ul style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}>
                              {items.map((it, i) => (
                                <li key={i} style={{ marginBottom: i < items.length - 1 ? 8 : 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                  <span style={{ color: slot.color, fontWeight: 900, lineHeight: '18px' }}>•</span>
                                  <span>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: BRAND.ink }}>{it.name}</div>
                                    {it.translation && <div style={{ fontSize: 11.5, color: BRAND.inkDim }}>{it.translation}</div>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{ padding: '10px 24px', textAlign: 'center', fontSize: 10.5, color: BRAND.inkDim, borderTop: `1px solid ${BRAND.border}` }}>
                Abhishri Academy • Weekly Food Menu
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
