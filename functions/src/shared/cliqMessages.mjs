// Zoho Cliq notifications: which change to a menu, report or feedback entry is worth
// a message, and what that message says. Pure, so the frontend test suite covers it;
// functions/src/cliq/triggers.js does the sending.
//
// Admins get approval requests and feedback in a shared channel, so they can all see
// what's waiting; the teacher who asked gets the outcome as a direct message.

const PENDING = 'pending';
const APPROVED = 'approved';
const RETURNED = 'changes_requested';

const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

/**
 * What a write to a menu or report means for Cliq:
 * - 'requested' when it was (re)sent for approval: now pending with a new requestedAt;
 * - 'approved' / 'returned' when an admin reviewed a pending request;
 * - null otherwise (drafts, an admin's own save, deletes, untouched approval).
 */
export function approvalEvent(before, after) {
  const was = before?.approval || {};
  const now = after?.approval;
  if (!now) return null;
  if (now.status === PENDING) {
    return was.status !== PENDING || millis(was.requestedAt) !== millis(now.requestedAt) ? 'requested' : null;
  }
  if (was.status !== PENDING || !now.requestedBy) return null;
  if (now.status === APPROVED) return 'approved';
  if (now.status === RETURNED) return 'returned';
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon, 28 Sep 2026" from a YYYY-MM-DD report id; anything else is returned as is. */
export function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${WEEKDAYS[d.getUTCDay()]}, ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

export const KINDS = {
  weekly_menus: {
    noun: 'weekly menu',
    title: (id, data) => `Weekly menu: ${data?.weekLabel || 'untitled'}`,
    path: '/menu-report',
  },
  daily_reports: {
    noun: 'daily report',
    title: (id) => `Daily report: ${prettyDate(id)}`,
    path: '/menu-report?tab=report',
  },
};

const trimUrl = (url) => String(url || '').replace(/\/+$/, '');

const card = ({ text, title, buttonLabel, url }) => ({
  text,
  card: { title, theme: 'modern-inline' },
  buttons: [{ label: buttonLabel, type: '+', action: { type: 'open.url', data: { web: url } } }],
});

/** Channel message asking admins to review a menu or report. */
export function requestMessage({ collection, id, data, requesterName, appUrl }) {
  const kind = KINDS[collection];
  return card({
    title: kind.title(id, data),
    text: `${requesterName} sent the ${kind.noun} for approval. Teachers can export it for parents only after an admin approves it.`,
    buttonLabel: 'Review in app',
    url: `${trimUrl(appUrl)}${kind.path}`,
  });
}

/** Direct message to the teacher who asked, with the admin's note when it was sent back. */
export function outcomeMessage({ collection, id, data, event, reviewerName, appUrl }) {
  const kind = KINDS[collection];
  const note = String(data?.approval?.note || '').trim();
  const text = event === 'approved'
    ? `${reviewerName} approved your ${kind.noun}. You can export it now.`
    : `${reviewerName} sent your ${kind.noun} back for changes.${note ? `\n\n*Note:* ${note}` : ''}`;
  return card({
    title: kind.title(id, data),
    text,
    buttonLabel: event === 'approved' ? 'Open and export' : 'Open and edit',
    url: `${trimUrl(appUrl)}${kind.path}`,
  });
}

const FEEDBACK_TYPES = { suggestion: 'Suggestion', complaint: 'Complaint', modification: 'Modification request' };

/** Channel message for a new entry from the in-app feedback widget. */
export function feedbackMessage({ data, appUrl }) {
  const type = FEEDBACK_TYPES[data?.type] || 'Feedback';
  const who = data?.submittedByName || data?.submittedBy || 'Someone';
  const page = data?.page ? ` (from ${data.page})` : '';
  return card({
    title: `${type} from ${who}`,
    text: `${String(data?.message || '').trim()}${page ? `\n\n_Sent${page}_` : ''}`,
    buttonLabel: 'Open feedback',
    url: `${trimUrl(appUrl)}/settings/feedback`,
  });
}
