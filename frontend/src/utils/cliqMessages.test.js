import { describe, it, expect } from 'vitest';
import { approvalEvent, prettyDate, requestMessage, outcomeMessage, decidedMessage, actionKey, parseActionKey, decisionProblem } from '../../../functions/src/shared/cliqMessages.mjs';

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

    const classReport = requestMessage({ collection: 'daily_reports', id: '2026-09-28--wonder-wings', data: { date: '2026-09-28', className: 'Wonder Wings' }, requesterName: 'Vineetha', appUrl });
    expect(classReport.card.title).toBe('Daily report: Mon, 28 Sep 2026 · Wonder Wings');
  });

  it("tells the teacher the outcome, with the admin's note when sent back", () => {
    const approved = outcomeMessage({ collection: 'weekly_menus', id: 'm1', data: doc(pending()), event: 'approved', reviewerName: 'Sathya', appUrl });
    expect(approved.text).toBe('Sathya approved your weekly menu. You can export it now.');
    expect(approved.buttons[0].label).toBe('Open and export');

    const returned = outcomeMessage({ collection: 'daily_reports', id: '2026-09-28', data: { approval: { note: ' Fix the Tamil date ' } }, event: 'returned', reviewerName: 'Sathya', appUrl });
    expect(returned.text).toBe('Sathya sent your daily report back for changes. Note: Fix the Tamil date');
    expect(outcomeMessage({ collection: 'daily_reports', id: 'd', data: {}, event: 'returned', reviewerName: 'S', appUrl }).text)
      .toBe('S sent your daily report back for changes.');
  });
});

describe('deciding from Cliq', () => {
  const cliq = { functionOwner: 'owner@abhishriacademy.in', approveFunction: 'abhishriapproval' };

  it('round-trips button keys and rejects anything else', () => {
    const key = actionKey('approve', 'weekly_menus', 'abc123', 1790486455887);
    expect(key).toBe('a|weekly_menus|abc123|1790486455887');
    expect(parseActionKey(key)).toEqual({ action: 'approve', collection: 'weekly_menus', id: 'abc123', requestedAtMs: 1790486455887 });
    expect(parseActionKey('s|daily_reports|2026-09-28|5')).toEqual({ action: 'sendback', collection: 'daily_reports', id: '2026-09-28', requestedAtMs: 5 });
    for (const bad of ['', 'x|weekly_menus|a|1', 'a|students|a|1', 'a|weekly_menus||1', 'a|weekly_menus|a|soon', 'a|weekly_menus|a|1|extra', null]) {
      expect(parseActionKey(bad)).toBe(null);
    }
  });

  it('adds Approve and Send back to a request only when the Cliq functions are set up', () => {
    const data = doc(pending(42));
    const withButtons = requestMessage({ collection: 'weekly_menus', id: 'm1', data, requesterName: 'V', appUrl: 'https://x', cliq });
    expect(withButtons.buttons.map(b => b.label)).toEqual(['Approve', 'Send back', 'Review in app']);
    expect(withButtons.buttons[0]).toMatchObject({
      key: 'a|weekly_menus|m1|42',
      arguments: { key: 'a|weekly_menus|m1|42' },
      action: { type: 'invoke.function', data: { name: 'abhishriapproval', owner: 'owner@abhishriacademy.in' } },
    });
    expect(withButtons.buttons[1].arguments.key).toBe('s|weekly_menus|m1|42');
    expect(requestMessage({ collection: 'weekly_menus', id: 'm1', data, requesterName: 'V', appUrl: 'https://x', cliq: {} }).buttons.map(b => b.label))
      .toEqual(['Review in app']);
  });

  it('applies a decision only by an admin, to the same pending request', () => {
    const parsed = parseActionKey('a|weekly_menus|m1|1');
    const admin = { isAdmin: true };
    expect(decisionProblem({ exists: true, approval: pending(1), parsed, reviewer: admin })).toBe(null);
    expect(decisionProblem({ exists: true, approval: pending(1), parsed, reviewer: { isAdmin: false } })).toMatch(/Only admins/);
    expect(decisionProblem({ exists: false, approval: null, parsed, reviewer: admin })).toMatch(/deleted/);
    expect(decisionProblem({ exists: true, approval: { ...pending(1), status: 'approved' }, parsed, reviewer: admin })).toMatch(/already approved/);
    expect(decisionProblem({ exists: true, approval: { ...pending(1), status: 'changes_requested' }, parsed, reviewer: admin })).toMatch(/already sent back/);
    expect(decisionProblem({ exists: true, approval: pending(2), parsed, reviewer: admin })).toMatch(/sent again/);
  });

  it('needs a note to send back', () => {
    const parsed = parseActionKey('s|weekly_menus|m1|1');
    expect(decisionProblem({ exists: true, approval: pending(1), parsed, reviewer: { isAdmin: true }, note: '  ' })).toMatch(/Add a note/);
    expect(decisionProblem({ exists: true, approval: pending(1), parsed, reviewer: { isAdmin: true }, note: 'Fix it' })).toBe(null);
  });

  it('notes the decision in the channel', () => {
    const args = { collection: 'daily_reports', id: '2026-09-28', reviewerName: 'Sathya', requesterName: 'Vineetha' };
    expect(decidedMessage({ ...args, data: {}, event: 'approved' }).text).toBe("*Daily report: Mon, 28 Sep 2026*\n✅ Sathya approved Vineetha's daily report.");
    expect(decidedMessage({ ...args, data: { approval: { note: 'Fix the date' } }, event: 'returned' }).text)
      .toBe("*Daily report: Mon, 28 Sep 2026*\n↩️ Sathya sent Vineetha's daily report back. Note: Fix the date");
    expect(decidedMessage({ ...args, requesterName: 'Teachers', data: {}, event: 'approved' }).text).toContain("approved Teachers' daily report.");
  });
});
