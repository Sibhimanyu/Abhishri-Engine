import React, { useState } from 'react';
import { CalendarRange, SlidersHorizontal, Download, Printer, RotateCcw, GitCompareArrows } from 'lucide-react';
import { DATE_PRESETS, GRANULARITIES, GRANULARITY_ADVERB, rangeLabel } from '../utils/reportUtils';
import { Field, Select, SavedViews } from './ReportsUI';

/**
 * The control strip every report sits under: period selection, comparison, bucket size,
 * export/print, saved views — plus a collapsible tray holding whatever report-specific
 * filters the caller passes as children.
 */
export default function ReportToolbar({
  preset, onPreset,
  custom, onCustom,
  range,
  compare, onCompare,
  granularity, onGranularity, resolvedGranularity,
  showGranularity = true,
  showCompare = true,
  onExport, exportDisabled,
  onReset, activeFilterCount = 0,
  savedKey, savedFilters, onApplySaved,
  resultLabel,
  children
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const presetOptions = DATE_PRESETS.map(p => ({ id: p.id, label: p.label }));
  const grainOptions = GRANULARITIES.map(g => ({
    id: g.id,
    label: g.id === 'auto' && resolvedGranularity ? `Auto (${resolvedGranularity})` : g.label
  }));

  // A finer bucket than the range can carry gets coarsened; say so rather than letting the
  // chart quietly disagree with the dropdown.
  const coarsened = showGranularity && granularity !== 'auto' && resolvedGranularity && resolvedGranularity !== granularity;

  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden print:border-0 print:shadow-none">
      {/* Period row */}
      <div className="p-4 md:p-5 flex flex-wrap items-end gap-3">
        <Field label="Period">
          <div className="flex items-center gap-2">
            <CalendarRange size={15} className="text-brand-primary shrink-0" />
            <Select value={preset} onChange={onPreset} options={presetOptions} className="w-48" />
          </div>
        </Field>

        {preset === 'custom' && (
          <>
            <Field label="From">
              <input
                type="date" value={custom.from || ''}
                onChange={(e) => onCustom({ ...custom, from: e.target.value })}
                className="bg-brand-bg border border-brand-card-border rounded-lg px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
              />
            </Field>
            <Field label="To">
              <input
                type="date" value={custom.to || ''}
                onChange={(e) => onCustom({ ...custom, to: e.target.value })}
                className="bg-brand-bg border border-brand-card-border rounded-lg px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
              />
            </Field>
          </>
        )}

        {showGranularity && (
          <Field label="Group by">
            <Select value={granularity} onChange={onGranularity} options={grainOptions} className="w-40" />
          </Field>
        )}

        {showCompare && (
          <Field label="Compare">
            <button
              type="button" onClick={() => onCompare(!compare)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                compare
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-brand-card-border text-brand-text-dim hover:text-brand-text'
              }`}
            >
              <GitCompareArrows size={14} /> Previous period
            </button>
          </Field>
        )}

        <div className="flex-1 min-w-[1rem]" />

        <div className="flex items-end gap-2 print:hidden">
          {children && (
            <button
              type="button" onClick={() => setFiltersOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                filtersOpen || activeFilterCount
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-brand-card-border text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <SlidersHorizontal size={13} /> Filters
              {activeFilterCount > 0 && (
                <span className="bg-brand-primary text-white rounded-full min-w-[16px] h-4 px-1 text-[10px] flex items-center justify-center">{activeFilterCount}</span>
              )}
            </button>
          )}
          {savedKey && <SavedViews storageKey={savedKey} current={savedFilters} onApply={onApplySaved} />}
          <button
            type="button" onClick={onExport} disabled={exportDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-card-border text-xs font-bold text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={13} /> CSV
          </button>
          <button
            type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-card-border text-xs font-bold text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* Report-specific filters */}
      {children && filtersOpen && (
        <div className="px-4 md:px-5 pb-5 pt-4 border-t border-brand-card-border bg-black/[0.02] dark:bg-white/[0.02] print:hidden">
          {children}
          <div className="flex justify-end mt-4 pt-3 border-t border-brand-card-border">
            <button
              type="button" onClick={onReset}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-text-dim hover:text-brand-primary transition-colors"
            >
              <RotateCcw size={12} /> Reset all filters
            </button>
          </div>
        </div>
      )}

      {/* Resolved context line — the one place that states exactly what is on screen */}
      <div className="px-4 md:px-5 py-2.5 border-t border-brand-card-border bg-black/[0.03] dark:bg-white/[0.03] flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-text-dim">
          Showing <span className="font-bold text-brand-text">{rangeLabel(range)}</span>
          {compare && <span> · compared to the previous period</span>}
          {coarsened && <span> · grouped <span className="font-bold text-brand-text">{(GRANULARITY_ADVERB[resolvedGranularity] || resolvedGranularity).toLowerCase()}</span> — the range is too long for that bucket size</span>}
        </p>
        {resultLabel && <p className="text-xs font-bold text-brand-text">{resultLabel}</p>}
      </div>
    </div>
  );
}
