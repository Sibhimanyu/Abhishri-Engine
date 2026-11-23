// Reactions on chat messages: message.reactions = { [senderKey]: { emoji, at, from } }.
// "business" is the school's own side; any other key is the parent.
export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏'];
export const BUSINESS_KEY = 'business';

/** The chips to show under a bubble: one per emoji with a count, most used first. */
export function reactionChips(reactions) {
  const byEmoji = new Map();
  for (const [key, r] of Object.entries(reactions || {})) {
    if (!r?.emoji) continue;
    const chip = byEmoji.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, first: Infinity };
    chip.count += 1;
    chip.mine = chip.mine || key === BUSINESS_KEY;
    chip.first = Math.min(chip.first, Number(r.at) || 0);
    byEmoji.set(r.emoji, chip);
  }
  return [...byEmoji.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map(({ emoji, count, mine }) => ({ emoji, count, mine }));
}

/** What to send when staff tap `emoji`: tapping the one they already gave removes it (''). */
export function emojiToSend(reactions, emoji) {
  return reactions?.[BUSINESS_KEY]?.emoji === emoji ? '' : emoji;
}
