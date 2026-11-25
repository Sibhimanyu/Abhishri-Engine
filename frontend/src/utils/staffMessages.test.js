import { describe, it, expect } from 'vitest';
import { approvalEvent, prettyDate, requestVars, outcomeVars, decidedVars, accessRequestVars, birthdayVars, outcomeKey, decidedKey, templateProblems, buildTemplatePayload, renderMessage, renderStaffMessage, mergeMessages, placeholdersIn, DEFAULT_MESSAGES, EVENTS } from '../../../functions/src/shared/staffMessages.mjs';

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

describe('message values', () => {
  const appUrl = 'https://abhishri-academy.web.app/';

  it('formats report dates', () => {
    expect(prettyDate('2026-09-28')).toBe('Mon, 28 Sep 2026');
    expect(prettyDate('not-a-date')).toBe('not-a-date');
  });

  it('asks admins to review, linking to the right tab', () => {
    const menu = requestVars({ collection: 'weekly_menus', id: 'm1', data: doc(pending()), requesterName: 'Vineetha', appUrl });
    expect(menu).toMatchObject({ itemTitle: 'Weekly menu: 28 Sep – 02 Oct 2026', kind: 'weekly menu', Kind: 'Weekly menu', requester: 'Vineetha', link: 'https://abhishri-academy.web.app/menu-report' });
    expect(requestVars({ collection: 'daily_reports', id: '2026-09-28', data: {}, requesterName: 'V', appUrl }).link).toBe('https://abhishri-academy.web.app/menu-report?tab=report');
    const classReport = requestVars({ collection: 'daily_reports', id: '2026-09-28--wonder-wings', data: { date: '2026-09-28', className: 'Wonder Wings' }, requesterName: 'V', appUrl });
    expect(classReport.itemTitle).toBe('Daily report: Mon, 28 Sep 2026 · Wonder Wings');
    const msg = renderStaffMessage('approvalRequested', menu);
    expect(msg.title).toBe('Approval requested');
    expect(msg.text).toBe('New approval request from Vineetha: Weekly menu: 28 Sep – 02 Oct 2026.\nReview it: https://abhishri-academy.web.app/menu-report');
  });

  it("tells the teacher the outcome, with the admin's note only when there is one", () => {
    const args = { collection: 'daily_reports', id: '2026-09-28', reviewerName: 'Sathya', appUrl };
    const approved = renderStaffMessage(outcomeKey('approved'), outcomeVars({ ...args, data: doc(pending()), event: 'approved' }));
    expect(approved.title).toBe('Your request was approved');
    expect(approved.text).toBe('Good news! Daily report: Mon, 28 Sep 2026 was approved by Sathya.\nYou can export it now: https://abhishri-academy.web.app/menu-report?tab=report');
    const returned = renderStaffMessage(outcomeKey('returned'), outcomeVars({ ...args, data: { approval: { note: ' Fix the Tamil date ' } }, event: 'returned' }));
    expect(returned.text).toBe('Changes requested: Sathya sent back Daily report: Mon, 28 Sep 2026.\nNote: Fix the Tamil date\nEdit it: https://abhishri-academy.web.app/menu-report?tab=report');
    expect(renderStaffMessage('approvalOutcomeReturned', outcomeVars({ ...args, data: {}, event: 'returned' })).text).toContain('\nNo note added.\n');
  });

  it('notes the decision for the admins', () => {
    const args = { collection: 'daily_reports', id: '2026-09-28', reviewerName: 'Sathya', requesterName: 'Vineetha', appUrl };
    const a = renderStaffMessage(decidedKey('approved'), decidedVars({ ...args, data: {}, event: 'approved' }));
    expect(a.title).toBe('Request approved');
    expect(a.text).toBe('Request approved: Daily report: Mon, 28 Sep 2026 from Vineetha was approved by Sathya.\nSee it: https://abhishri-academy.web.app/menu-report?tab=report');
    const r = renderStaffMessage(decidedKey('returned'), decidedVars({ ...args, data: { approval: { note: 'Fix the date' } }, event: 'returned' }));
    expect(r.title).toBe('Request sent back');
    expect(r.text).toBe('Request sent back: Sathya sent back Daily report: Mon, 28 Sep 2026 from Vineetha.\nOpen it to see the note: https://abhishri-academy.web.app/menu-report?tab=report');
    expect(decidedKey('approved')).toBe('approvalDecidedApproved');
    expect(decidedKey('returned')).toBe('approvalDecidedReturned');
    expect(EVENTS.approvalDecided).toBeUndefined();
    expect(decidedVars({ ...args, requesterName: 'Teachers', data: {}, event: 'approved' }).requesterPossessive).toBe("Teachers'");
  });

  it('words access requests and birthdays', () => {
    expect(accessRequestVars({ data: { email: 'a@b.in' }, appUrl }).who).toBe('a@b.in');
    expect(accessRequestVars({ data: { email: 'a@b.in', displayName: 'Asha' }, appUrl }).who).toBe('Asha (a@b.in)');
    expect(birthdayVars({ members: [], appUrl })).toBe(null);
    const v = birthdayVars({ members: [{ name: 'Arun', type: 'student', tamilMonth: 'Purattasi', tamilDay: '19' }], appUrl });
    expect(v.date).toBe('Purattasi 19');
    expect(v.link).toBe('https://abhishri-academy.web.app/students');
    expect(v.names).toBe('Arun');
    expect(renderStaffMessage('birthdays', v).text).toBe("Today's Tamil birthdays: Arun.\nSee the list: https://abhishri-academy.web.app/students");
  });
});

describe('Arattai start/end guard', () => {
  it('refuses a body that starts or ends with a placeholder, allows {link} last', () => {
    expect(templateProblems('approvalOutcomeReturned', { title: 'T', body: '{reviewer} did it. {link}' }).join(' ')).toMatch(/starts with a placeholder \(\{reviewer\}\)/);
    expect(templateProblems('approvalOutcomeReturned', { title: 'T', body: 'Open {itemTitle}' }).join(' ')).toMatch(/ends with a placeholder \(\{itemTitle\}\)/);
    expect(templateProblems('approvalOutcomeReturned', { title: '{reviewer} asked', body: 'Hi {itemTitle}. {link}\n' })).toHaveLength(1);
    expect(templateProblems('approvalOutcomeReturned', { title: '', body: 'Hi {itemTitle}. {link}' })).toEqual([]);
    expect(() => buildTemplatePayload('approvalOutcomeReturned', { title: 'T', body: '{reviewer} x' })).toThrow(/starts with/);
  });

  it('every default passes', () => {
    for (const key of Object.keys(EVENTS)) expect(templateProblems(key, DEFAULT_MESSAGES[key])).toEqual([]);
  });
});

describe('renderMessage', () => {
  it('fills placeholders and leaves unknown ones as written', () => {
    expect(renderMessage('Hi {name}, see {nope}', { name: 'Asha' })).toBe('Hi Asha, see {nope}');
  });

  it('turns missing values into nothing and drops lines left empty', () => {
    expect(renderMessage('Done.\nNote: {note}\nLink: {link}', { note: '', link: 'u' })).toBe('Done.\nLink: u');
    expect(renderMessage('Done.\nNote: {note}', { note: undefined })).toBe('Done.');
    expect(renderMessage('{a} and {b}', { a: 'x', b: null })).toBe('x and');
    expect(renderMessage('A\n\n\n\nB', {})).toBe('A\n\nB');
  });

  it('keeps a line that still has a value, and lines with no placeholders', () => {
    expect(renderMessage('{a} {b}', { a: '', b: 'x' })).toBe(' x'.trim());
    expect(renderMessage('Plain\n\nText', {})).toBe('Plain\n\nText');
  });

  it('lists placeholders and merges saved wording over the defaults', () => {
    expect(placeholdersIn('{a} {b} {a}')).toEqual(['a', 'b']);
    const merged = mergeMessages({ accessRequest: { title: 'Hey', body: '  ' }, test: { title: 'T', body: 'B' }, other: { title: 'x' } });
    expect(merged.accessRequest).toEqual({ title: 'Hey', body: DEFAULT_MESSAGES.accessRequest.body });
    expect(merged.test).toEqual({ title: 'T', body: 'B' });
    expect(merged.approvalRequested).toEqual(DEFAULT_MESSAGES.approvalRequested);
    expect(mergeMessages(null).birthdays).toEqual(DEFAULT_MESSAGES.birthdays);
  });
});

describe('default wording', () => {
  it('has an entry for every event, using only documented placeholders', () => {
    expect(Object.keys(DEFAULT_MESSAGES).sort()).toEqual(Object.keys(EVENTS).sort());
    for (const [key, t] of Object.entries(DEFAULT_MESSAGES)) {
      for (const name of [...placeholdersIn(t.title), ...placeholdersIn(t.body)]) {
        expect(Object.keys(EVENTS[key].placeholders), `${key} {${name}}`).toContain(name);
      }
    }
  });

  it('renders with sample values without leftover placeholders, short and plain', () => {
    for (const [key, ev] of Object.entries(EVENTS)) {
      const { title, text } = renderStaffMessage(key, ev.sample);
      expect(title + text, key).not.toMatch(/\{[A-Za-z]/);
      expect(title.length, key).toBeLessThanOrEqual(60);
      expect(text.length, key).toBeLessThan(250);
      expect(title + text, key).not.toMatch(/\*/);
      expect(text.split('\n').length, key).toBeLessThanOrEqual(4);
    }
  });
});
