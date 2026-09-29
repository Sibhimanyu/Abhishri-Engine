import { describe, it, expect } from 'vitest';
import { NOTIFICATIONS, outcomeEntries, APPROVED_SHOWS_FOR_MS } from '../../../functions/src/shared/notifications.mjs';
import { outcomeMessage, accessRequestMessage, birthdayDigestMessage, requestMessage } from '../../../functions/src/shared/cliqMessages.mjs';
import { tamilSolarDate, TAMIL_MONTHS } from '../../../functions/src/shared/tamilSolarDate.mjs';
import { bellEntries } from './bellEntries';

const appUrl = 'https://abhishri-academy.web.app';
const linkOf = (message) => message.buttons.at(-1).action.data.web.replace(appUrl, '');

describe('notification list', () => {
  it('says where every notification goes in Cliq, or why it stays in the bell', () => {
    for (const [key, n] of Object.entries(NOTIFICATIONS)) {
      expect(['channel', 'dm', 'digest', null], key).toContain(n.cliq);
      if (n.cliq === null) expect(n.cliqSkipReason, key).toBeTruthy();
      expect(n.title, key).toBeTruthy();
    }
  });

  it('words the summaries for one and many', () => {
    expect(NOTIFICATIONS.accessRequest.summary(1)).toBe('There is 1 pending request awaiting review.');
    expect(NOTIFICATIONS.accessRequest.summary(3)).toBe('There are 3 pending requests awaiting review.');
    expect(NOTIFICATIONS.approvalPending.summary({ menus: 1, reports: 0 })).toBe('1 weekly menu is waiting for your approval.');
    expect(NOTIFICATIONS.approvalPending.summary({ menus: 2, reports: 1 })).toBe('2 weekly menus and 1 daily report are waiting for your approval.');
    expect(NOTIFICATIONS.whatsappUnread.summary(2)).toBe('You have 2 unread messages.');
  });
});

describe('bell and Cliq match', () => {
  it('tells the teacher the same thing, linking to the same place', () => {
    const approval = { status: 'changes_requested', requestedBy: 't@x.in', reviewedByName: 'Sathya', note: 'Fix the date', reviewedAtMs: 5 };
    const [bell] = bellEntries({ myOutcomes: outcomeEntries([{ collection: 'daily_reports', id: '2026-09-28', noun: 'daily report', label: '', approval }], 10) });
    const cliq = outcomeMessage({ collection: 'daily_reports', id: '2026-09-28', data: { approval }, event: 'returned', reviewerName: 'Sathya', appUrl });
    expect(bell.text).toBe(cliq.text);
    expect(bell.path).toBe(linkOf(cliq));
    expect(bell.title).toBe('Sent Back');
  });

  it('links requests and access requests to the same screens', () => {
    const bell = bellEntries({ pendingLogins: 1, pendingApprovals: { menus: 0, reports: 1, total: 1 } });
    const byKey = Object.fromEntries(bell.map(e => [e.key, e]));
    expect(byKey.approvals.path).toBe(linkOf(requestMessage({ collection: 'daily_reports', id: '2026-09-28', data: {}, requesterName: 'V', appUrl })));
    expect(byKey.access.path).toBe(linkOf(accessRequestMessage({ data: { email: 'a@b.in' }, appUrl })));
    expect(bell.map(e => e.key)).toEqual(['access', 'approvals']);
  });

  it('lists the same birthdays, in the same words', () => {
    const members = [
      { id: 's1', name: 'Arun', type: 'student', tamilMonth: 'Purattasi', tamilDay: '11' },
      { id: 't1', name: 'Meena', type: 'staff', tamilMonth: 'Purattasi', tamilDay: '11' },
    ];
    const bell = bellEntries({ birthdays: members });
    const digest = birthdayDigestMessage({ members, appUrl });
    expect(digest.card.title).toBe('🎂 Tamil Birthday Today! (Purattasi 11)');
    expect(digest.text).toBe(bell.map(e => `• ${e.text}`).join('\n'));
    expect(bell[0].text).toBe("It is Arun's (Student) Tamil Birthday today (Purattasi 11).");
    expect(birthdayDigestMessage({ members: [], appUrl })).toBe(null);
  });
});

describe('outcomeEntries', () => {
  const at = (status, reviewedAtMs, extra = {}) => ({ collection: 'weekly_menus', id: `${status}-${reviewedAtMs}`, approval: { status, requestedBy: 't@x.in', reviewedAtMs, ...extra } });

  it('keeps send-backs until re-sent, and approvals for a few days, newest first', () => {
    const now = 10 * APPROVED_SHOWS_FOR_MS;
    const got = outcomeEntries([
      at('changes_requested', 1),
      at('approved', now - 1000),
      at('approved', now - APPROVED_SHOWS_FOR_MS - 1),
      at('pending', now),
      at('draft', now),
    ], now);
    expect(got.map(e => [e.event, e.approval.reviewedAtMs])).toEqual([['approved', now - 1000], ['returned', 1]]);
  });
});

describe('tamilSolarDate', () => {
  it('turns the Sun longitude into the Tamil month and day', () => {
    const date = new Date(Date.UTC(2026, 8, 28));
    const ayanamsa = 24.1 + (2026 + 8 / 12 - 2000) * 0.0139694;
    // 5 degrees into Kanni (the sixth sign, Purattasi).
    expect(tamilSolarDate(150 + 5 + ayanamsa, date)).toEqual({ tamilMonth: 'Purattasi', tamilDay: '6' });
    expect(tamilSolarDate(0.1 + ayanamsa, date)).toEqual({ tamilMonth: TAMIL_MONTHS[0], tamilDay: '1' });
  });
});
