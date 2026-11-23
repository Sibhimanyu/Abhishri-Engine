import React, { useState } from 'react';
import { CalendarRange, SlidersHorizontal, Download, Printer, RotateCcw, GitCompareArrows } from 'lucide-react';
import { DATE_PRESETS, GRANULARITIES, GRANULARITY_ADVERB, rangeLabel } from '../utils/reportUtils';
import { Select, SavedViews } from './ReportsUI';
import { printPage } from '../utils/native';

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

  const ICON_BTN = 'inline-flex items-center justify-center gap-1 h-8 min-w-8 px-2 rounded-lg border text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const IDLE = 'border-brand-card-border text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5';
  const ON = 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary';
  const bare = 'bg-transparent border border-brand-card-border rounded-lg h-8 py-0 pl-2 pr-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <CalendarRange size={15} className="text-brand-primary shrink-0" aria-hidden="true" />
          <Select value={preset} onChange={onPreset} options={presetOptions} className={`${bare} w-40 sm:w-44`} aria-label="Period" />
        </div>

        {preset === 'custom' && (
          <>
            <input
              type="date" aria-label="From" value={custom.from || ''}
              onChange={(e) => onCustom({ ...custom, from: e.target.value })}
              className={bare}
            />
            <input
              type="date" aria-label="To" value={custom.to || ''}
              onChange={(e) => onCustom({ ...custom, to: e.target.value })}
              className={bare}
            />
          </>
        )}

        {showGranularity && (
          <label className="flex items-center gap-1.5 text-sm text-brand-text-dim">
            Group:
            <Select value={granularity} onChange={onGranularity} options={grainOptions} className={`${bare} w-32`} aria-label="Group by" />
          </label>
        )}

        {showCompare && (
          <button
            type="button" onClick={() => onCompare(!compare)} aria-pressed={compare}
            title="Compare with the previous period"
            className={`${ICON_BTN} font-medium ${compare ? ON : IDLE}`}
          >
            <GitCompareArrows size={14} /> Compare
          </button>
        )}

        <div className="flex-1 min-w-[0.5rem]" />

        <div className="flex items-center gap-1.5 print:hidden">
          {children && (
            <button
              type="button" onClick={() => setFiltersOpen(o => !o)}
              title="Filters" aria-label="Filters" aria-expanded={filtersOpen}
              className={`${ICON_BTN} ${filtersOpen || activeFilterCount ? ON : IDLE}`}
            >
              <SlidersHorizontal size={15} />
              {activeFilterCount > 0 && (
                <span className="bg-brand-primary text-white rounded-full min-w-[16px] h-4 px-1 text-[10px] flex items-center justify-center">{activeFilterCount}</span>
              )}
            </button>
          )}
          {savedKey && <SavedViews storageKey={savedKey} current={savedFilters} onApply={onApplySaved} />}
          <button
            type="button" onClick={onExport} disabled={exportDisabled}
            title="Download CSV" aria-label="Download CSV"
            className={`${ICON_BTN} ${IDLE}`}
          >
            <Download size={15} />
          </button>
          <button
            type="button" onClick={printPage}
            title="Print" aria-label="Print"
            className={`${ICON_BTN} ${IDLE}`}
          >
            <Printer size={15} />
          </button>
        </div>
      </div>

      {/* Report-specific filters */}
      {children && filtersOpen && (
        <div className="p-4 rounded-xl border border-brand-card-border bg-black/[0.02] dark:bg-white/[0.02] print:hidden">
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

      {/* Resolved context line: the one place that states exactly what is on screen */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <p className="text-xs text-brand-text-dim">
          Showing <span className="font-semibold text-brand-text">{rangeLabel(range)}</span>
          {compare && <span> · compared to the previous period</span>}
          {coarsened && <span> · grouped <span className="font-semibold text-brand-text">{(GRANULARITY_ADVERB[resolvedGranularity] || resolvedGranularity).toLowerCase()}</span>, the range is too long for that bucket size</span>}
        </p>
        {resultLabel && <p className="text-xs text-brand-text-dim">{resultLabel}</p>}
      </div>
    </div>
  );
}
