import { describe, it, expect } from 'vitest';
import { reactionChips, emojiToSend } from './reactions';

describe('reactionChips', () => {
  it('is empty without reactions', () => {
    expect(reactionChips(undefined)).toEqual([]);
    expect(reactionChips({ a: { emoji: '' } })).toEqual([]);
  });
  it('groups by emoji with counts, most used first, and flags ours', () => {
    const chips = reactionChips({
      p1: { emoji: '❤️', at: 3 },
      p2: { emoji: '👍', at: 1 },
      business: { emoji: '❤️', at: 2 },
    });
    expect(chips).toEqual([
      { emoji: '❤️', count: 2, mine: true },
      { emoji: '👍', count: 1, mine: false },
    ]);
  });
});

describe('emojiToSend', () => {
  it('toggles our own reaction off', () => {
    expect(emojiToSend({ business: { emoji: '👍' } }, '👍')).toBe('');
    expect(emojiToSend({ business: { emoji: '👍' } }, '❤️')).toBe('❤️');
    expect(emojiToSend(undefined, '🙏')).toBe('🙏');
  });
});
