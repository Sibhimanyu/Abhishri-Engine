// The web app bell's entries, from functions/src/shared/notifications.mjs: the same titles,
// wording and links the Cliq bot uses. components/NotificationBell.jsx renders them.
import { NOTIFICATIONS } from '../../../functions/src/shared/notifications.mjs';

/**
 * The bell's entries, in display order, from what App.jsx has loaded. Each is
 * { key, look, title, text, path }.
 */
export function bellEntries({ pendingLogins = 0, pendingApprovals, myOutcomes = [], newFeedback = 0, unreadWhatsApp = 0, birthdays = [] }) {
  const N = NOTIFICATIONS;
  const entries = [];
  if (pendingLogins > 0) {
    entries.push({ key: 'access', look: 'accessRequest', title: N.accessRequest.title, text: N.accessRequest.summary(pendingLogins), path: N.accessRequest.path });
  }
  if (pendingApprovals?.total > 0) {
    // Straight to the tab that has something waiting (the menu tab when both do).
    const path = N.approvalPending.path(pendingApprovals.menus ? 'weekly_menus' : 'daily_reports');
    entries.push({ key: 'approvals', look: 'approvalPending', title: N.approvalPending.title, text: N.approvalPending.summary(pendingApprovals), path });
  }
  myOutcomes.forEach(o => entries.push({
    key: `outcome-${o.collection}-${o.id}`,
    look: o.event,
    title: N.approvalOutcome.title[o.event],
    text: N.approvalOutcome.summary({ event: o.event, noun: o.noun, label: o.label, reviewerName: o.approval.reviewedByName || 'An admin', note: o.approval.note }),
    path: N.approvalOutcome.path(o.collection),
  }));
  if (newFeedback > 0) {
    entries.push({ key: 'feedback', look: 'feedback', title: N.feedback.title, text: N.feedback.summary(newFeedback), path: N.feedback.path });
  }
  if (unreadWhatsApp > 0) {
    entries.push({ key: 'whatsapp', look: 'whatsappUnread', title: N.whatsappUnread.title, text: N.whatsappUnread.summary(unreadWhatsApp), path: N.whatsappUnread.path });
  }
  birthdays.forEach(m => entries.push({
    key: `bday-${m.type}-${m.id}`, look: 'tamilBirthday', title: N.tamilBirthday.title, text: N.tamilBirthday.item(m), path: N.tamilBirthday.path(m.type),
  }));
  return entries;
}

