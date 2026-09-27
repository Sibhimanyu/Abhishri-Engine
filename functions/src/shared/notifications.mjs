// Every notification the app raises, in one place, so the web app's bell and Zoho Cliq
// always cover the same things with the same wording and links. The bell (App.jsx) renders
// these; functions/src/cliq sends them. Add a notification here first, then wire both.
//
// `cliq` says how each reaches Cliq:
//   'channel'  posted to the admins' channel as it happens
//   'dm'       sent to the one person it concerns
//   'digest'   one post a day, listing that day's items
//   null       bell only, with the reason in `cliqSkipReason`

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const NOTIFICATIONS = {
  accessRequest: {
    title: 'Access Requests',
    audience: 'admins',
    cliq: 'channel',
    path: '/settings/users',
    summary: (count) => `There ${count === 1 ? 'is' : 'are'} ${plural(count, 'pending request')} awaiting review.`,
    // Cliq, per request as it arrives.
    item: ({ name, email }) => `${name && name !== email ? `${name} (${email})` : email} tried to sign in and isn't set up in the app yet.`,
  },
  approvalPending: {
    title: 'Waiting for Approval',
    audience: 'admins',
    cliq: 'channel',
    path: (collection) => (collection === 'daily_reports' ? '/menu-report?tab=report' : '/menu-report'),
    summary: ({ menus = 0, reports = 0 }) => {
      const parts = [menus && plural(menus, 'weekly menu'), reports && plural(reports, 'daily report')].filter(Boolean);
      return `${parts.join(' and ')} ${menus + reports === 1 ? 'is' : 'are'} waiting for your approval.`;
    },
  },
  approvalOutcome: {
    title: { approved: 'Approved', returned: 'Sent Back' },
    audience: 'the teacher who asked',
    cliq: 'dm',
    path: (collection) => (collection === 'daily_reports' ? '/menu-report?tab=report' : '/menu-report'),
    summary: ({ event, noun, label, reviewerName, note }) => (event === 'approved'
      ? `${reviewerName} approved your ${noun}${label ? ` (${label})` : ''}. You can export it now.`
      : `${reviewerName} sent your ${noun}${label ? ` (${label})` : ''} back for changes.${note ? ` Note: ${note}` : ''}`),
  },
  feedback: {
    title: 'New Feedback',
    audience: 'admins',
    cliq: 'channel',
    path: '/settings/feedback',
    summary: (count) => `${plural(count, 'new suggestion or complaint', 'new suggestions or complaints')} to review.`,
  },
  tamilBirthday: {
    title: 'Tamil Birthday Today!',
    audience: 'anyone who can see the student or staff directory',
    cliq: 'digest',
    path: (type) => (type === 'staff' ? '/staff' : '/students'),
    item: ({ name, type, tamilMonth, tamilDay }) => `It is ${name}'s (${type === 'staff' ? 'Staff' : 'Student'}) Tamil Birthday today (${tamilMonth} ${tamilDay}).`,
  },
  whatsappUnread: {
    title: 'WhatsApp Livechat',
    audience: 'WhatsApp users',
    cliq: null,
    cliqSkipReason: 'Unread counts change with every message, so posting them would flood the channel.',
    path: '/whatsapp',
    summary: (count) => `You have ${plural(count, 'unread message')}.`,
  },
};

// How long an approval stays in the teacher's bell after it's approved; a send-back stays
// until they send it again, since it needs them to act.
export const APPROVED_SHOWS_FOR_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The bell's entries for the teacher who asked, from their menus and reports:
 * each sent back (until re-sent), and each approved within APPROVED_SHOWS_FOR_MS.
 * `docs` are { collection, id, noun, label, approval } with approval.reviewedAt in ms.
 */
export function outcomeEntries(docs, now) {
  return docs
    .filter(d => d.approval?.status === 'changes_requested'
      || (d.approval?.status === 'approved' && d.approval.requestedBy && now - (d.approval.reviewedAtMs || 0) < APPROVED_SHOWS_FOR_MS))
    .map(d => ({ ...d, event: d.approval.status === 'approved' ? 'approved' : 'returned' }))
    .sort((a, b) => (b.approval.reviewedAtMs || 0) - (a.approval.reviewedAtMs || 0));
}
