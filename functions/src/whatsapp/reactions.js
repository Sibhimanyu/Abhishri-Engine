// Reactions on live-chat messages (WhatsApp). A reaction never becomes a chat bubble: it is
// stored on the message it reacts to, as `reactions/<senderKey>` = { emoji, at, from }.
// Pure parts are tested in reactions.test.js (node --test src/whatsapp/reactions.test.js).

const { savePending } = require("../shared/pendingEvents");

const sanitizeKey = (key) => (key ? String(key).replace(/[.#$/[\]]/g, "_") : key);
const BUSINESS = "business";

/** Seconds (Meta) or milliseconds into milliseconds. */
const toMs = (t) => {
  const n = Number(t);
  if (!n) return Date.now();
  return n > 10000000000 ? n : n * 1000;
};

/**
 * A reaction in a webhook message, or null when it isn't one. Understands Meta's shape
 * ({ type: "reaction", reaction: { message_id, emoji } }, also how Fast2SMS forwards it) and the
 * smb_message_echoes copy of one made from the business's own phone (`fromMe`). An empty
 * emoji (or none) means the reaction was removed.
 * -> { targetId, emoji, key, from, conversationId, at }
 */
function extractReaction(msg, { fromMe = false } = {}) {
  if (!msg) return null;
  if ((msg.type || msg.message_type) !== "reaction") return null;
  const r = msg.reaction;
  if (!r || !r.message_id) return null;
  const phone = String(fromMe ? msg.to : msg.from || "").replace(/[^\d]/g, "");
  if (!phone) return null;
  return {
    targetId: String(r.message_id),
    emoji: typeof r.emoji === "string" ? r.emoji.trim().slice(0, 16) : "",
    key: fromMe ? BUSINESS : phone,
    from: fromMe ? BUSINESS : phone,
    conversationId: phone,
    at: toMs(msg.timestamp),
  };
}

/**
 * The reactions map after `change` ({ key, emoji, at, from }). A change older than what is
 * stored for that sender is ignored (webhooks can arrive out of order); an empty emoji removes
 * it. Returns the same object when nothing changes.
 */
function nextReactions(current, change) {
  const map = { ...(current || {}) };
  const cur = map[change.key];
  if (cur && Number(cur.at) > Number(change.at)) return current;
  if (!change.emoji) {
    if (!cur) return current;
    delete map[change.key];
    return Object.keys(map).length ? map : null;
  }
  map[change.key] = { emoji: change.emoji, at: change.at, from: change.from };
  return map;
}

/**
 * Find a conversation message by provider id. `ids` is one id or several (send.js stores the
 * Fast2SMS request id and the wamid): each is tried as the sanitized key, then as the
 * `messageId`, `wamid` or `requestId` field.
 */
async function findMessage(messagesRef, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String))];
  for (const id of list) {
    const byKey = await messagesRef.child(sanitizeKey(id)).once("value");
    if (byKey.exists()) return byKey;
    for (const field of ["messageId", "wamid", "requestId"]) {
      const q = await messagesRef.orderByChild(field).equalTo(id).once("value");
      let found = null;
      q.forEach((c) => { if (!found) found = c; });
      if (found) return found;
    }
  }
  return null;
}

/**
 * Store a reaction on its message. Returns false (and writes nothing) when the message isn't
 * found; with `pending` (a collection name) the reaction is parked there for the send code to
 * replay once the message exists.
 */
async function storeReaction(db, reaction, prefix = "whatsapp_conversations", { pending } = {}) {
  const snap = await findMessage(db.ref(`${prefix}/${reaction.conversationId}/messages`), reaction.targetId);
  if (!snap) {
    if (pending) await savePending(db, pending, [reaction.targetId], "reaction", reaction);
    return false;
  }
  const reactions = snap.val().reactions || null;
  const next = nextReactions(reactions, reaction);
  if (next === reactions) return true;
  await snap.ref.child("reactions").set(next);
  return true;
}

module.exports = { BUSINESS, sanitizeKey, extractReaction, nextReactions, findMessage, storeReaction };
