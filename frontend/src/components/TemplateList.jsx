import { useState } from 'react';
import { Plus, RefreshCw, Search, Pencil, Copy, Trash2, Tag } from 'lucide-react';
import { CATEGORIES, LANGUAGES } from '../../../functions/src/shared/templateRules.mjs';
import { EVENTS } from '../../../functions/src/shared/staffMessages.mjs';
import { StatusBadge } from './StaffMessageWording';
import { statusInfo, filterTemplates, categoryLabel, STATUS_FILTERS, formatModified } from '../utils/templateUi';

// The list half of Settings > Templates: search, category and status filters, and a row per
// Arattai template with Edit, Duplicate and Delete. AdminTemplates.jsx owns the data.

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text';
const ghostBtn = 'flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-3 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50';

function Chips({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {[['', 'All'], ...options].map(([v, l]) => (
        <button key={v || 'all'} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${value === v ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-bg border-brand-card-border text-brand-text-dim hover:text-brand-text'}`}>{l}</button>
      ))}
    </div>
  );
}

export default function TemplateList({ data, loading, error, flash, busyId, onNew, onRefresh, onEdit, onDuplicate, onDelete }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const all = data?.templates || [];
  const shown = filterTemplates(all, { q, category, status });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" />
          <input type="search" aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or wording" className={inputClass} />
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className={ghostBtn}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        <button type="button" onClick={onNew} className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-bold text-sm transition-colors"><Plus size={14} /> New template</button>
      </div>

      <div className="flex flex-col gap-2">
        <Chips label="Category" value={category} onChange={setCategory} options={Object.entries(CATEGORIES).map(([k, c]) => [k, c.label])} />
        <Chips label="Status" value={status} onChange={setStatus} options={STATUS_FILTERS.map((s) => [s, statusInfo(s).label])} />
      </div>

      {data?.mode === 'sandbox' && <p className="text-[11px] text-brand-text-dim">Sandbox mode: these templates are kept in the app only, and submitting approves them straight away.</p>}
      {flash && <div className={`p-3 rounded-md text-sm font-medium border ${flash.ok ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>{flash.text}</div>}
      {error && <div className="p-3 rounded-md text-sm font-medium border bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">Couldn't load templates: {error}</div>}

      {!data && loading && <p className="text-sm text-brand-text-dim">Loading…</p>}
      {data && shown.length === 0 && (
        <p className="text-sm text-brand-text-dim">{all.length === 0 ? 'No templates yet. Create the first one with New template.' : 'No templates match.'}</p>
      )}

      {shown.length > 0 && (
        <ul className="divide-y divide-brand-card-border border border-brand-card-border rounded-lg">
          {shown.map((t) => (
            <li key={t.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onEdit(t)} className="text-sm font-semibold text-brand-text hover:text-brand-primary truncate max-w-full text-left font-mono">{t.name}</button>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary text-[11px] font-bold"><Tag size={10} /> {categoryLabel(t.type)}</span>
                  <span className="text-[11px] text-brand-text-dim">{LANGUAGES[t.language] || t.language}</span>
                  <StatusBadge status={statusInfo(t.status)} />
                  {t.staffEvent && <span className="px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 text-brand-text-dim text-[11px] font-medium">Staff: {EVENTS[t.staffEvent]?.label || t.staffEvent}</span>}
                </div>
                {t.status === 'rejected' && t.reason && <p className="text-xs text-red-600 dark:text-red-400">Arattai rejected it: {t.reason}</p>}
                <p className="text-xs text-brand-text-dim truncate">{t.title ? `${t.title}. ` : ''}{t.body.replace(/\s*\n\s*/g, ' ')}</p>
                {t.modifiedAt && <p className="text-[11px] text-brand-text-dim">Modified {formatModified(t.modifiedAt)}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={() => onEdit(t)} className={ghostBtn}><Pencil size={13} /> Edit</button>
                <button type="button" onClick={() => onDuplicate(t)} className={ghostBtn}><Copy size={13} /> Duplicate</button>
                <button type="button" onClick={() => onDelete(t)} disabled={busyId === t.id} className="flex items-center gap-2 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 px-3 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50"><Trash2 size={13} /> Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
