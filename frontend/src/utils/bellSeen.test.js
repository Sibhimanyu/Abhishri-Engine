import { describe, it, expect } from 'vitest';
import { fingerprint, unseenEntries, markAllSeen, loadSeen, saveSeen } from './bellSeen';

const chats = (n) => ({ key: 'whatsapp', text: `${n} unread chats` });
const access = { key: 'access', text: '1 person waiting' };

const memoryStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('bellSeen', () => {
  it('treats everything as unseen at first', () => {
    expect(unseenEntries([chats(2), access], new Set())).toHaveLength(2);
  });

  it('stops calling for what was showing when the bell was opened', () => {
    const seen = markAllSeen([chats(2), access]);
    expect(unseenEntries([chats(2), access], seen)).toEqual([]);
  });

  it('calls again when a seen notification changes', () => {
    const seen = markAllSeen([chats(2), access]);
    expect(unseenEntries([chats(3), access], seen)).toEqual([chats(3)]);
  });

  it('calls for a new kind of notification', () => {
    const seen = markAllSeen([access]);
    expect(unseenEntries([access, chats(1)], seen)).toEqual([chats(1)]);
  });

  it('forgets notifications that are gone, so they call if they come back', () => {
    const seen = markAllSeen([access]);
    expect(seen.has(fingerprint(chats(2)))).toBe(false);
  });

  it('remembers across reloads and survives bad storage', () => {
    const storage = memoryStorage();
    saveSeen(markAllSeen([access]), storage);
    expect(unseenEntries([access], loadSeen(storage))).toEqual([]);
    storage.setItem('bell-seen-v1', 'not json');
    expect(loadSeen(storage).size).toBe(0);
  });
});
