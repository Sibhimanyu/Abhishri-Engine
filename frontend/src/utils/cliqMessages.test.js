import { describe, it, expect } from 'vitest';
import { approvalEvent, prettyDate, requestMessage, outcomeMessage, feedbackMessage } from '../../../functions/src/shared/cliqMessages.mjs';

const ts = (ms) => ({ toMillis: () => ms });
const doc = (approval) => (approval ? { weekLabel: '28 Sep – 02 Oct 2026', approval } : { weekLabel: 'x' });
const pending = (at = 1) => ({ status: 'pending', requestedBy: 'teacher@x.in', requestedAt: ts(at), note: '' });

describe('approvalEvent', () => {
  it('fires on a request, and again when it is re-sent', () => {
    expect(approvalEvent(null, doc(pending()))).toBe('requested');
    expect(approvalEvent(doc({ status: 'draft' }), doc(pending()))).toBe('requested');
    expect(approvalEvent(doc({ ...pending(), status: 'changes_requested' }), doc(pending(2)))).toBe('requested');
    expect(approvalEvent(doc(pending(1)), doc(pending(2)))).toBe('requested');
  });

  it('stays quiet when a pending request is saved unchanged', () => {
    expect(approvalEvent(doc(pending(1)), doc(pending(1)))).toBe(null);
  });

  it('reports an admin review of a pending request', () => {
    const reviewed = (status) => doc({ ...pending(), status, reviewedBy: 'admin@x.in', reviewedAt: ts(5) });
    expect(approvalEvent(doc(pending()), reviewed('approved'))).toBe('approved');
    expect(approvalEvent(doc(pending()), reviewed('changes_requested'))).toBe('returned');
  });

  it("ignores drafts, an admin's own save, deletes and documents without approval", () => {
    expect(approvalEvent(null, doc({ status: 'draft' }))).toBe(null);
    expect(approvalEvent(doc({ status: 'draft' }), doc({ status: 'approved', reviewedBy: 'admin@x.in' }))).toBe(null);
    expect(approvalEvent(doc({ status: 'approved' }), doc({ status: 'approved', reviewedBy: 'admin@x.in' }))).toBe(null);
    expect(approvalEvent(doc(pending()), null)).toBe(null);
    expect(approvalEvent(null, doc(null))).toBe(null);
  });
});

describe('messages', () => {
  const appUrl = 'https://abhishri-academy.web.app/';

  it('formats report dates', () => {
    expect(prettyDate('2026-09-28')).toBe('Mon, 28 Sep 2026');
    expect(prettyDate('not-a-date')).toBe('not-a-date');
  });

  it('asks admins to review, linking to the right tab', () => {
    const menu = requestMessage({ collection: 'weekly_menus', id: 'm1', data: doc(pending()), requesterName: 'Vineetha', appUrl });
    expect(menu.card.title).toBe('Weekly menu: 28 Sep – 02 Oct 2026');
    expect(menu.text).toContain('Vineetha sent the weekly menu for approval');
    expect(menu.buttons[0].action).toEqual({ type: 'open.url', data: { web: 'https://abhishri-academy.web.app/menu-report' } });

    const report = requestMessage({ collection: 'daily_reports', id: '2026-09-28', data: {}, requesterName: 'Vineetha', appUrl });
    expect(report.card.title).toBe('Daily report: Mon, 28 Sep 2026');
    expect(report.buttons[0].action.data.web).toBe('https://abhishri-academy.web.app/menu-report?tab=report');
  });

  it("tells the teacher the outcome, with the admin's note when sent back", () => {
    const approved = outcomeMessage({ collection: 'weekly_menus', id: 'm1', data: doc(pending()), event: 'approved', reviewerName: 'Sathya', appUrl });
    expect(approved.text).toBe('Sathya approved your weekly menu. You can export it now.');
    expect(approved.buttons[0].label).toBe('Open and export');

    const returned = outcomeMessage({ collection: 'daily_reports', id: '2026-09-28', data: { approval: { note: ' Fix the Tamil date ' } }, event: 'returned', reviewerName: 'Sathya', appUrl });
    expect(returned.text).toBe('Sathya sent your daily report back for changes.\n\n*Note:* Fix the Tamil date');
    expect(outcomeMessage({ collection: 'daily_reports', id: 'd', data: {}, event: 'returned', reviewerName: 'S', appUrl }).text)
      .toBe('S sent your daily report back for changes.');
  });

  it('posts feedback with its type, sender and page', () => {
    const m = feedbackMessage({ data: { type: 'complaint', message: ' Poster footer not needed ', submittedByName: 'Vineetha', page: '/weekly-menu' }, appUrl });
    expect(m.card.title).toBe('Complaint from Vineetha');
    expect(m.text).toBe('Poster footer not needed\n\n_Sent (from /weekly-menu)_');
    expect(m.buttons[0].action.data.web).toBe('https://abhishri-academy.web.app/settings/feedback');
    expect(feedbackMessage({ data: { message: 'hi', submittedBy: 'a@b.in' }, appUrl }).card.title).toBe('Feedback from a@b.in');
  });
});
