import { EVENTS, editedSinceSubmission } from '../../../functions/src/shared/staffMessages.mjs';

// Shared bits for staff notification templates: the status of an event's template and its badge.
// The editor itself is the Templates page builder (TemplateBuilder.jsx, in staff mode).
// Each message is an Arattai template. Wording edits are saved to configs/staff_messages as
// { [eventKey]: { title, body } }; the template's state is written by the server under
// `arattai` (functions/src/arattai/staffTemplates.js) and only read here.

const TONES = {
  green: { badge: 'bg-green-500/10 text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  amber: { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  red: { badge: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  gray: { badge: 'bg-black/5 dark:bg-white/5 text-brand-text-dim', dot: 'bg-brand-text-dim/40' },
};

/** Short recipient for the event list: "Admins" or "Teacher". */
export const recipientOf = (eventKey) => (/teacher/i.test(EVENTS[eventKey].audience) ? 'Teacher' : 'Admins');

/**
 * { label, tone, edited, reason } for an event's template: its saved wording against the
 * state the server recorded (undefined when nothing was submitted).
 */
export function templateStatus(wording, state) {
  if (!state?.templateId && !state?.status) return { label: 'Not submitted', tone: 'gray', edited: false };
  const edited = editedSinceSubmission(wording, state.submittedText);
  switch (state.status) {
    case 'approved': return edited ? { label: 'Edited since approval', tone: 'amber', edited } : { label: 'Approved', tone: 'green', edited };
    case 'under_review': return { label: 'Under review', tone: 'amber', edited };
    case 'rejected': return { label: 'Rejected', tone: 'red', edited, reason: state.rejectedReason };
    case 'update_required': return { label: 'Needs update', tone: 'amber', edited };
    default: return { label: 'Draft', tone: 'gray', edited };
  }
}

export const StatusDot = ({ tone }) => <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${TONES[tone].dot}`} />;

export const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${TONES[status.tone].badge}`}>
    <StatusDot tone={status.tone} /> {status.label}
  </span>
);

export const formatWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : '');
