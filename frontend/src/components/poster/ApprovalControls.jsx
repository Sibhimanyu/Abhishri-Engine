// Toolbar buttons, status line and pending list for admin approval (see approval.js).
import { DRAFT, PENDING, APPROVED, RETURNED, statusOf } from './approval';
import { Download, Loader2, Send, Check, Undo2, Clock } from 'lucide-react';

const CHIP = {
  [DRAFT]: { label: 'Draft', cls: 'bg-black/5 dark:bg-white/10 text-brand-text-dim' },
  [PENDING]: { label: 'Waiting for approval', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  [APPROVED]: { label: 'Approved', cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  [RETURNED]: { label: 'Sent back', cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

export function ApprovalChip({ status }) {
  const chip = CHIP[status] || CHIP[DRAFT];
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.label}</span>;
}

const primaryClass = 'flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50';

/**
 * The toolbar's last buttons. Admins export directly and, on a pending document, can
 * approve or send it back. Everyone else sends for approval, waits, then exports.
 */
export function ApprovalActions({ isAdmin, status, dirty, busy, exporting, onExport, onSubmit, onApprove, onSendBack }) {
  const exportButton = (
    <button onClick={onExport} disabled={exporting || busy} className={primaryClass}>
      {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export as PNG
    </button>
  );

  if (isAdmin) {
    return (
      <>
        {status === PENDING && !dirty && (
          <>
            <button onClick={onSendBack} disabled={busy} className="flex items-center gap-2 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 px-4 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50">
              <Undo2 size={16} /> Send back
            </button>
            <button onClick={onApprove} disabled={busy} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve
            </button>
          </>
        )}
        {exportButton}
      </>
    );
  }

  if (status === APPROVED && !dirty) return exportButton;
  if (status === PENDING && !dirty) {
    return (
      <span className="flex items-center gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-lg font-bold text-sm">
        <Clock size={16} /> Waiting for approval
      </span>
    );
  }
  return (
    <button onClick={onSubmit} disabled={busy} className={primaryClass}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send for approval
    </button>
  );
}

const who = (email) => (email && email !== 'unknown' ? email : 'someone');

/** One line under the toolbar saying where the open document stands. */
export function ApprovalStatus({ isAdmin, saved, dirty, what }) {
  if (!saved) {
    return isAdmin ? null : (
      <Banner tone="neutral">Not saved yet. When it's ready, choose <b>Send for approval</b>. An admin approves it before it can be exported.</Banner>
    );
  }
  const a = saved.approval || {};
  const status = statusOf(saved);
  const unsaved = dirty ? ' You have unsaved changes.' : '';

  if (status === PENDING) {
    return isAdmin
      ? <Banner tone="amber"><b>{who(a.requestedBy)}</b> sent this {what} for approval. Check it, then approve it or send it back.{unsaved}</Banner>
      : <Banner tone="amber">Sent for approval by {who(a.requestedBy)}. You can export it once an admin approves it.{dirty ? ' Saving your changes withdraws it until you send it again.' : ''}</Banner>;
  }
  if (status === APPROVED) {
    if (isAdmin) return a.reviewedBy ? <Banner tone="green">Approved by {who(a.reviewedBy)}.{unsaved}</Banner> : null;
    return dirty
      ? <Banner tone="amber">Approved by {who(a.reviewedBy)}, but you've changed it since. Send it for approval again to export the new version.</Banner>
      : <Banner tone="green">Approved by {who(a.reviewedBy)}. Ready to export.</Banner>;
  }
  if (a.note) {
    return <Banner tone="red"><b>Sent back by {who(a.reviewedBy)}:</b> {a.note}{/[.!?]$/.test(a.note) ? '' : '.'}{isAdmin ? '' : ' Make the changes, then send it for approval again.'}</Banner>;
  }
  return isAdmin ? null : <Banner tone="neutral">Saved as a draft. Choose <b>Send for approval</b> when it's ready.</Banner>;
}

const TONES = {
  neutral: 'bg-black/5 dark:bg-white/5 border-brand-card-border text-brand-text-dim',
  amber: 'bg-amber-500/10 border-amber-500/30 text-brand-text',
  green: 'bg-green-500/10 border-green-500/30 text-brand-text',
  red: 'bg-red-500/10 border-red-500/30 text-brand-text',
};

function Banner({ tone, children }) {
  return <div role="status" className={`border rounded-xl px-4 py-3 text-sm ${TONES[tone]}`}>{children}</div>;
}

/** Admin-only list of what's waiting, at the top of each editor. */
export function PendingList({ items, labelOf, onReview, what }) {
  if (!items.length) return null;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <div className="text-sm font-bold text-brand-text mb-2">{items.length} {what}{items.length > 1 ? 's' : ''} waiting for your approval</div>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-brand-text"><b>{labelOf(item)}</b> <span className="text-brand-text-dim">from {who(item.approval?.requestedBy)}</span></span>
            <button onClick={() => onReview(item)} className="shrink-0 text-xs font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 px-3 py-1.5 rounded-lg">Review</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
