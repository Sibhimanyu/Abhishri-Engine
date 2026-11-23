import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The tab strip that sits directly under the top bar on tabbed pages.
 * Each tab is a router link (`to`) or, when it has no `to`, a button that calls `onSelect(id)`.
 * Scrolls sideways with an edge fade on phones. `trailing` is an optional node pinned to the far right
 * of the same row (it does not scroll away).
 */
export default function PageTabs({ tabs, activeId, onSelect, ariaLabel = 'Sections', className = '', trailing = null }) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`bg-brand-sidebar shrink-0 border-b border-brand-card-border print:hidden ${className}`}
    >
      <div className="flex items-center pr-2 sm:pr-4 md:pr-8">
      <div className="flex scroll-tabs edge-fade gap-0.5 px-2 sm:px-4 md:px-8 flex-1 min-w-0">
        {tabs.map(tab => {
          const active = activeId === tab.id;
          const cls = `flex items-center gap-2 px-3 py-2.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
            active
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-brand-text-dim hover:text-brand-text hover:border-brand-card-border'
          }`;
          const Icon = tab.icon;
          const body = (<>{Icon && <Icon size={16} />}{tab.label}</>);
          return tab.to ? (
            <Link key={tab.id} to={tab.to} aria-current={active ? 'page' : undefined} className={cls}>{body}</Link>
          ) : (
            <button key={tab.id} type="button" onClick={() => onSelect?.(tab.id)} aria-current={active ? 'page' : undefined} className={cls}>{body}</button>
          );
        })}
      </div>
      {trailing && <div className="shrink-0 pl-2 py-1">{trailing}</div>}
      </div>
    </nav>
  );
}
