import { describe, it, expect } from 'vitest';
import { plainFromCliq, plainText } from '../../../functions/src/shared/plainMessage.mjs';
import { requestMessage, decidedMessage, outcomeMessage, accessRequestMessage, birthdayDigestMessage } from '../../../functions/src/shared/cliqMessages.mjs';

const appUrl = 'https://abhishri-academy.web.app';
const ts = (ms) => ({ toMillis: () => ms });

// Arattai sends the same staff notifications as Cliq, so its plain form must keep the
// title, the words and every link.
describe('plain form of Cliq messages', () => {
  it('keeps a request’s title, text and link, and its Approve / Send back as actions', () => {
    const data = { weekLabel: 'Week 41', approval: { status: 'pending', requestedAt: ts(42) } };
    const cliq = { functionOwner: 'v@a.in', approveFunction: 'abhishriapproval' };
    const p = plainFromCliq(requestMessage({ collection: 'weekly_menus', id: 'w41', data, requesterName: 'Lakshmi', appUrl, cliq }));
    expect(p.title).toBe('Weekly menu: Week 41');
    expect(p.text).toBe('Lakshmi sent the weekly menu for approval. Teachers can export it for parents only after an admin approves it.');
    expect(p.links).toEqual([{ label: 'Review in app', url: `${appUrl}/menu-report` }]);
    expect(p.actions.map(a => a.label)).toEqual(['Approve', 'Send back']);
    expect(p.actions[0].key).toBe('a|weekly_menus|w41|42');
  });

  it('takes the title from the bold first line when there is no card', () => {
    const data = { date: '2026-10-05', approval: { status: 'changes_requested', note: 'Add photos' } };
    const p = plainFromCliq(decidedMessage({ collection: 'daily_reports', id: '2026-10-05', data, event: 'returned', reviewerName: 'Vineetha', requesterName: 'Lakshmi' }));
    expect(p.title).toBe('Daily report: Mon, 5 Oct 2026');
    expect(p.text).toBe("↩️ Vineetha sent Lakshmi's daily report back. Note: Add photos");
    expect(p.links).toEqual([]);
  });

  it('turns outcome, access request and birthday messages into one block of text', () => {
    const outcome = plainFromCliq(outcomeMessage({ collection: 'daily_reports', id: '2026-10-05', data: { date: '2026-10-05', approval: {} }, event: 'approved', reviewerName: 'Vineetha', appUrl }));
    expect(plainText(outcome)).toBe(`*Daily report: Mon, 5 Oct 2026*\nVineetha approved your daily report. You can export it now.\nOpen and export: ${appUrl}/menu-report?tab=report`);
    expect(plainFromCliq(accessRequestMessage({ data: { email: 'a@b.in' }, appUrl })).links[0].url).toBe(`${appUrl}/settings/users`);
    const bday = plainFromCliq(birthdayDigestMessage({ members: [{ name: 'Arun', type: 'student', tamilMonth: 'Purattasi', tamilDay: '19' }], appUrl }));
    expect(bday.text).toBe("• It is Arun's (Student) Tamil Birthday today (Purattasi 19).");
  });
});
