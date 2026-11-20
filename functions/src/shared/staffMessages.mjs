// Staff notifications over Arattai: which change to a menu or report is worth a message,
// and what that message says. Pure, so the frontend test suite covers it;
// functions/src/notify/triggers.js does the sending. Titles, wording and links come from
// ./notifications.mjs where the web app's bell shares them.
//
// Admins get approval requests so they can all see what's waiting; the teacher who asked
// gets the outcome. Approvals are reviewed in the app, through the {link}.
//
// WORDING. Every event has a { title, body } template in DEFAULT_MESSAGES. An admin can
// override either in Settings > Staff Notifications; overrides are stored in
// configs/staff_messages as { [eventKey]: { title, body } } and win over the defaults.
//
// Templates use {name} placeholders, listed per event in EVENTS. renderMessage fills them:
//   - an unknown placeholder ({typo}) is left as written, so mistakes are visible;
//   - a known placeholder with no value becomes empty;
//   - a line whose placeholders all came out empty is dropped, so "Note: {note}" on its
//     own line disappears when there is no note; extra blank lines are collapsed.

import { NOTIFICATIONS } from './notifications.mjs';

const PENDING = 'pending';
const APPROVED = 'approved';
const RETURNED = 'changes_requested';

const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

/**
 * What a write to a menu or report means for staff notifications:
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

// ---------------------------------------------------------------------------------------
// Wording

export const DEFAULT_APP_URL = 'https://abhishri-academy.web.app';

/** The events, in the order Settings lists them, with what each placeholder means. */
export const EVENTS = {
  approvalRequested: {
    label: 'Approval requested',
    description: 'A teacher sends a weekly menu or daily report for approval.',
    audience: 'Admins',
    placeholders: {
      itemTitle: 'What it is, e.g. "Daily report: Fri, 20 Nov 2026 · Sunflowers"',
      kind: '"weekly menu" or "daily report"',
      Kind: 'Same, with a capital for the start of a title: "Weekly menu"',
      requester: 'Who sent it',
      link: 'Link to the approval screen in the app',
    },
    sample: { itemTitle: 'Daily report: Fri, 20 Nov 2026 · Sunflowers', kind: 'daily report', Kind: 'Daily report', requester: 'Lakshmi', link: `${DEFAULT_APP_URL}/menu-report?tab=report` },
  },
  approvalDecided: {
    label: 'Approval decided',
    description: 'An admin approved a request or sent it back. Tells the admins it is handled.',
    audience: 'Admins',
    placeholders: {
      itemTitle: 'What it is, e.g. "Weekly menu: 23 Nov – 27 Nov 2026"',
      kind: '"weekly menu" or "daily report"',
      requester: 'Who asked',
      requesterPossessive: 'Who asked, with \'s, e.g. "Lakshmi\'s" ("Teachers\'")',
      reviewer: 'Who decided',
      decision: '"approved" or "sent back"',
      Decision: 'Same, with a capital for the start of a title: "Approved" or "Sent back"',
      note: 'The reviewer\'s note (empty when there is none)',
      link: 'Link to the approval screen in the app',
    },
    sample: { itemTitle: 'Weekly menu: 23 Nov – 27 Nov 2026', kind: 'weekly menu', requester: 'Lakshmi', requesterPossessive: "Lakshmi's", reviewer: 'Vineetha', decision: 'sent back', Decision: 'Sent back', note: 'Add the Friday snack', link: `${DEFAULT_APP_URL}/menu-report` },
  },
  approvalOutcomeApproved: {
    label: 'Your request was approved',
    description: 'An admin approved a request. Goes to the teacher who asked.',
    audience: 'The teacher who asked',
    placeholders: {
      itemTitle: 'What it is, e.g. "Daily report: Fri, 20 Nov 2026"',
      kind: '"weekly menu" or "daily report"',
      Kind: 'Same, with a capital for the start of a title',
      reviewer: 'Who approved it',
      link: 'Link to open and export it in the app',
    },
    sample: { itemTitle: 'Daily report: Fri, 20 Nov 2026', kind: 'daily report', reviewer: 'Vineetha', link: `${DEFAULT_APP_URL}/menu-report?tab=report` },
  },
  approvalOutcomeReturned: {
    label: 'Your request was sent back',
    description: 'An admin sent a request back for changes. Goes to the teacher who asked.',
    audience: 'The teacher who asked',
    placeholders: {
      itemTitle: 'What it is, e.g. "Daily report: Fri, 20 Nov 2026"',
      kind: '"weekly menu" or "daily report"',
      Kind: 'Same, with a capital for the start of a title',
      reviewer: 'Who sent it back',
      note: 'The reviewer\'s note (empty when there is none)',
      link: 'Link to open and edit it in the app',
    },
    sample: { itemTitle: 'Daily report: Fri, 20 Nov 2026', kind: 'daily report', reviewer: 'Vineetha', note: 'Add photos', link: `${DEFAULT_APP_URL}/menu-report?tab=report` },
  },
  accessRequest: {
    label: 'Access request',
    description: 'Someone signed in who is not set up in the app yet.',
    audience: 'Admins',
    placeholders: {
      who: 'Name and email, or just the email when there is no name',
      name: 'Their name (empty when unknown)',
      email: 'Their email',
      link: 'Link to Settings > User Permissions in the app',
    },
    sample: { who: 'Meena (meena@gmail.com)', name: 'Meena', email: 'meena@gmail.com', link: `${DEFAULT_APP_URL}/settings/users` },
  },
  birthdays: {
    label: 'Tamil birthdays',
    description: 'One message each morning at 7:30 listing today\'s Tamil birthdays. Not sent on days without any.',
    audience: 'Admins',
    placeholders: {
      people: 'One line per birthday',
      date: 'Today\'s Tamil month and day, e.g. "Purattasi 11"',
      link: 'Link to the students (or staff) list in the app',
    },
    sample: {
      people: "• It is Arun's (Student) Tamil Birthday today (Purattasi 11).\n• It is Meena's (Staff) Tamil Birthday today (Purattasi 11).",
      date: 'Purattasi 11',
      link: `${DEFAULT_APP_URL}/students`,
    },
  },
  test: {
    label: 'Test message',
    description: '"Send a test" in Settings. Goes to the admins and to you.',
    audience: 'Admins and you',
    placeholders: {
      where: 'Where it arrived, e.g. "as a direct message"',
      link: 'Link to the app',
    },
    sample: { where: 'as a direct message', link: DEFAULT_APP_URL },
  },
};

// Defaults are plain text for Arattai (no markdown): a title of 60 characters or fewer that
// says what needs attention, then a body of one to three short lines, the link last.
export const DEFAULT_MESSAGES = {
  approvalRequested: {
    title: '{Kind} waiting for approval',
    body: '{requester} sent {itemTitle} for approval.\nReview it: {link}',
  },
  approvalDecided: {
    title: '{Decision}: {itemTitle}',
    body: '{reviewer} {decision} {requesterPossessive} {kind}.\nNote: {note}',
  },
  approvalOutcomeApproved: {
    title: 'Your {kind} is approved',
    body: '{reviewer} approved {itemTitle}. You can export it now.\n{link}',
  },
  approvalOutcomeReturned: {
    title: 'Your {kind} needs changes',
    body: '{reviewer} sent back {itemTitle}.\nNote: {note}\nEdit it: {link}',
  },
  accessRequest: {
    title: 'New access request',
    body: '{who} signed in and is waiting for access.\nSet them up: {link}',
  },
  birthdays: {
    title: '🎂 Tamil birthdays today',
    body: '{people}\n{link}',
  },
  test: {
    title: 'Test from Abhishri Engine',
    body: 'Staff notifications are working.',
  },
};

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** The placeholder names a template uses, in order, without repeats. */
export function placeholdersIn(template) {
  return [...new Set([...String(template || '').matchAll(PLACEHOLDER)].map(m => m[1]))];
}

/**
 * Fill a template's {placeholders} from `vars` (see the notes at the top of this file).
 * Unknown names stay as written, empty or missing values become '', and lines left with
 * nothing in them are removed.
 */
export function renderMessage(template, vars = {}) {
  const known = (name) => Object.prototype.hasOwnProperty.call(vars, name);
  const value = (name) => (vars[name] == null ? '' : String(vars[name]).trim());
  const lines = String(template ?? '').split('\n').flatMap((line) => {
    const names = [...line.matchAll(PLACEHOLDER)].map(m => m[1]).filter(known);
    if (names.length && names.every(n => value(n) === '')) return [];
    return [line.replace(PLACEHOLDER, (whole, name) => (known(name) ? value(name) : whole))];
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The defaults with any saved { [eventKey]: { title, body } } laid over them. */
export function mergeMessages(overrides) {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_MESSAGES)) {
    const o = overrides && typeof overrides === 'object' ? overrides[key] : null;
    out[key] = {
      title: typeof o?.title === 'string' ? o.title : def.title,
      // An empty body can't be sent, so a blank one means "use the default".
      body: typeof o?.body === 'string' && o.body.trim() ? o.body : def.body,
    };
  }
  return out;
}

/** { title, text } for one event: its template (default or saved) filled with `vars`. */
export function renderStaffMessage(eventKey, vars, overrides) {
  const t = mergeMessages(overrides)[eventKey];
  return { title: renderMessage(t.title, vars), text: renderMessage(t.body, vars) };
}

// ---------------------------------------------------------------------------------------
// Values for each event's placeholders, from the document that triggered it

const trimUrl = (url) => String(url || '').replace(/\/+$/, '');

// "Vineetha's", but "Teachers'" for a name ending in s.
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const note = (data) => String(data?.approval?.note || '').trim();

/** approvalRequested */
export function requestVars({ collection, id, data, requesterName, appUrl }) {
  const kind = KINDS[collection];
  return { itemTitle: kind.title(id, data), kind: kind.noun, Kind: cap(kind.noun), requester: requesterName, link: `${trimUrl(appUrl)}${kind.path}` };
}

/** approvalDecided; `event` is 'approved' or 'returned'. */
export function decidedVars({ collection, id, data, event, reviewerName, requesterName, appUrl }) {
  const kind = KINDS[collection];
  return {
    itemTitle: kind.title(id, data),
    kind: kind.noun,
    Kind: cap(kind.noun),
    requester: requesterName,
    requesterPossessive: possessive(requesterName),
    reviewer: reviewerName,
    decision: event === 'approved' ? 'approved' : 'sent back',
    Decision: event === 'approved' ? 'Approved' : 'Sent back',
    note: event === 'approved' ? '' : note(data),
    link: `${trimUrl(appUrl)}${kind.path}`,
  };
}

/** approvalOutcomeApproved / approvalOutcomeReturned (the key follows `event`). */
export function outcomeVars({ collection, id, data, event, reviewerName, appUrl }) {
  const kind = KINDS[collection];
  return {
    itemTitle: kind.title(id, data),
    kind: kind.noun,
    Kind: cap(kind.noun),
    reviewer: reviewerName,
    note: event === 'approved' ? '' : note(data),
    link: `${trimUrl(appUrl)}${kind.path}`,
  };
}

export const outcomeKey = (event) => (event === 'approved' ? 'approvalOutcomeApproved' : 'approvalOutcomeReturned');

/** accessRequest */
export function accessRequestVars({ data, appUrl }) {
  const n = NOTIFICATIONS.accessRequest;
  const email = String(data?.email || '').trim();
  const name = String(data?.displayName || '').trim();
  return {
    who: name && name !== email ? `${name} (${email})` : email,
    name,
    email,
    link: `${trimUrl(appUrl)}${n.path}`,
  };
}

/** birthdays, or null when nobody has one today. */
export function birthdayVars({ members, appUrl }) {
  if (!members?.length) return null;
  const n = NOTIFICATIONS.tamilBirthday;
  const { tamilMonth, tamilDay } = members[0];
  const types = [...new Set(members.map(m => m.type))];
  return {
    people: members.map(m => `• ${n.item(m)}`).join('\n'),
    date: `${tamilMonth} ${tamilDay}`,
    link: `${trimUrl(appUrl)}${n.path(types.length === 1 ? types[0] : 'student')}`,
  };
}
