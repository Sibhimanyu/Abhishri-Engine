// Zoho Cliq notifications: which change to a menu or report is worth
// a message, and what that message says. Pure, so the frontend test suite covers it;
// functions/src/cliq/triggers.js does the sending. Titles, wording and links come from
// ./notifications.mjs, which the web app's bell uses too.
//
// Admins get approval requests in a shared channel, so they can all see
// what's waiting; the teacher who asked gets the outcome as a direct message.

import { NOTIFICATIONS } from './notifications.mjs';

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
    path: NOTIFICATIONS.approvalPending.path('weekly_menus'),
  },
  daily_reports: {
    noun: 'daily report',
    // Ids are the date, or "<date>--<class>" once reports have a class (staff-only, so it
    // goes in admin and teacher messages but never on the poster).
    title: (id, data) => `Daily report: ${prettyDate(data?.date || id)}${data?.className ? ` · ${data.className}` : ''}`,
    path: NOTIFICATIONS.approvalPending.path('daily_reports'),
  },
};

const trimUrl = (url) => String(url || '').replace(/\/+$/, '');

const openButton = (label, url) => ({ label, type: '+', action: { type: 'open.url', data: { web: url } } });

const card = ({ text, title, buttonLabel, url, buttons = [] }) => ({
  text,
  card: { title, theme: 'modern-inline' },
  buttons: [...buttons, openButton(buttonLabel, url)],
});

// Deciding from Cliq. A request's Approve / Send back buttons call the Cliq functions set
// up in docs/cliq-bot.md, which pass the button's key to the app's cliqAction endpoint:
// "<a|s>|<collection>|<docId>|<requestedAt ms>". The timestamp ties the key to that one
// request, so a button on an old message can't decide a later re-submission.
const ACTIONS = { a: 'approve', s: 'sendback' };

export function actionKey(action, collection, id, requestedAtMs) {
  return [action === 'approve' ? 'a' : 's', collection, id, requestedAtMs].join('|');
}

/** { action, collection, id, requestedAtMs } from a button key, or null if it isn't one of ours. */
export function parseActionKey(key) {
  const parts = String(key || '').split('|');
  if (parts.length !== 4) return null;
  const [a, collection, id, ms] = parts;
  if (!ACTIONS[a] || !KINDS[collection] || !id || !/^\d+$/.test(ms)) return null;
  return { action: ACTIONS[a], collection, id, requestedAtMs: Number(ms) };
}

/**
 * Why a decision from Cliq can't be applied to this document, or null if it can.
 * `approval` is the document's current approval map; `reviewer` is { isAdmin }.
 */
export function decisionProblem({ exists, approval, parsed, reviewer, note }) {
  if (!reviewer?.isAdmin) return 'Only admins can approve or send back. Your Cliq email is not an admin in the app.';
  if (!exists) return 'This was deleted in the app.';
  if (approval?.status !== PENDING) {
    if (approval?.status === APPROVED) return 'This was already approved.';
    if (approval?.status === RETURNED) return 'This was already sent back.';
    return 'This is no longer waiting for approval.';
  }
  if (millis(approval.requestedAt) !== parsed.requestedAtMs) return 'This request was changed and sent again. Use the newest message.';
  if (parsed.action === 'sendback' && !String(note || '').trim()) return 'Add a note saying what needs changing.';
  return null;
}

/** Approve / Send back buttons for a request, when the Cliq functions are configured. */
function decisionButtons({ collection, id, data, cliq }) {
  const ms = millis(data?.approval?.requestedAt);
  if (!cliq?.functionOwner || !cliq?.approveFunction || ms == null) return [];
  const invoke = (label, action) => ({
    label,
    type: action === 'approve' ? '+' : '-',
    key: actionKey(action, collection, id, ms),
    action: { type: 'invoke.function', data: { name: cliq.approveFunction, owner: cliq.functionOwner } },
    arguments: { key: actionKey(action, collection, id, ms) },
  });
  return [invoke('Approve', 'approve'), invoke('Send back', 'sendback')];
}

/** Channel message asking admins to review a menu or report. */
export function requestMessage({ collection, id, data, requesterName, appUrl, cliq }) {
  const kind = KINDS[collection];
  return card({
    title: kind.title(id, data),
    text: `${requesterName} sent the ${kind.noun} for approval. Teachers can export it for parents only after an admin approves it.`,
    buttons: decisionButtons({ collection, id, data, cliq }),
    buttonLabel: 'Review in app',
    url: `${trimUrl(appUrl)}${kind.path}`,
  });
}

// "Vineetha's", but "Teachers'" for a name ending in s.
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** Channel note once a request is decided (in the app or from Cliq), so admins see it's done. */
export function decidedMessage({ collection, id, data, event, reviewerName, requesterName }) {
  const kind = KINDS[collection];
  const note = String(data?.approval?.note || '').trim();
  const text = event === 'approved'
    ? `✅ ${reviewerName} approved ${possessive(requesterName)} ${kind.noun}.`
    : `↩️ ${reviewerName} sent ${possessive(requesterName)} ${kind.noun} back.${note ? ` Note: ${note}` : ''}`;
  return { text: `*${kind.title(id, data)}*\n${text}` };
}

/** Direct message to the teacher who asked, with the admin's note when it was sent back. */
export function outcomeMessage({ collection, id, data, event, reviewerName, appUrl }) {
  const kind = KINDS[collection];
  const note = String(data?.approval?.note || '').trim();
  const text = NOTIFICATIONS.approvalOutcome.summary({ event, noun: kind.noun, reviewerName, note });
  return card({
    title: kind.title(id, data),
    text,
    buttonLabel: event === 'approved' ? 'Open and export' : 'Open and edit',
    url: `${trimUrl(appUrl)}${kind.path}`,
  });
}

/** Channel message for a new access request (someone signed in who isn't set up yet). */
export function accessRequestMessage({ data, appUrl }) {
  const n = NOTIFICATIONS.accessRequest;
  const email = String(data?.email || '').trim();
  return card({
    title: n.title,
    text: n.item({ name: String(data?.displayName || '').trim(), email }),
    buttonLabel: 'Review in app',
    url: `${trimUrl(appUrl)}${n.path}`,
  });
}

/** The morning channel post listing today's Tamil birthdays, or null when there are none. */
export function birthdayDigestMessage({ members, appUrl }) {
  if (!members?.length) return null;
  const n = NOTIFICATIONS.tamilBirthday;
  const { tamilMonth, tamilDay } = members[0];
  const types = [...new Set(members.map(m => m.type))];
  return card({
    title: `🎂 ${n.title} (${tamilMonth} ${tamilDay})`,
    text: members.map(m => `• ${n.item(m)}`).join('\n'),
    buttonLabel: types.length === 1 && types[0] === 'staff' ? 'Open staff' : 'Open students',
    url: `${trimUrl(appUrl)}${n.path(types.length === 1 ? types[0] : 'student')}`,
  });
}
