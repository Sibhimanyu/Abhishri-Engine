const test = require("node:test");
const assert = require("node:assert");
const { extractReaction, nextReactions } = require("./reactions");

test("Meta inbound reaction", () => {
  const r = extractReaction({ from: "919876543210", id: "wamid.R", timestamp: "1795157661", type: "reaction", reaction: { message_id: "wamid.T", emoji: "👍" } });
  assert.deepStrictEqual(r, { targetId: "wamid.T", emoji: "👍", key: "919876543210", from: "919876543210", conversationId: "919876543210", at: 1795157661000 });
});

test("business-phone echo is filed under the recipient as 'business'", () => {
  const r = extractReaction({ from: "919500400459", to: "917418101718", timestamp: "1795323296", type: "reaction", reaction: { message_id: "wamid.T", emoji: "🙏🏽" } }, { fromMe: true });
  assert.strictEqual(r.key, "business");
  assert.strictEqual(r.conversationId, "917418101718");
});

test("missing emoji means removed; non-reactions and malformed ones are null", () => {
  assert.strictEqual(extractReaction({ from: "91 98765", type: "reaction", reaction: { message_id: "w" } }).emoji, "");
  assert.strictEqual(extractReaction({ from: "1", type: "text" }), null);
  assert.strictEqual(extractReaction({ from: "1", type: "reaction", reaction: {} }), null);
  assert.strictEqual(extractReaction(null), null);
});

test("nextReactions adds, replaces, removes and ignores stale changes", () => {
  let m = nextReactions(null, { key: "p", emoji: "👍", at: 10, from: "p" });
  assert.deepStrictEqual(m, { p: { emoji: "👍", at: 10, from: "p" } });
  m = nextReactions(m, { key: "p", emoji: "❤️", at: 20, from: "p" });
  assert.strictEqual(m.p.emoji, "❤️");
  assert.strictEqual(nextReactions(m, { key: "p", emoji: "😂", at: 5, from: "p" }), m);
  m = nextReactions(m, { key: "business", emoji: "🙏", at: 30, from: "business" });
  assert.strictEqual(Object.keys(m).length, 2);
  m = nextReactions(m, { key: "p", emoji: "", at: 40, from: "p" });
  assert.deepStrictEqual(Object.keys(m), ["business"]);
  assert.strictEqual(nextReactions(m, { key: "business", emoji: "", at: 50, from: "business" }), null);
  assert.strictEqual(nextReactions(null, { key: "p", emoji: "", at: 1, from: "p" }), null);
});
