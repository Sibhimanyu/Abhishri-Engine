const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

/**
 * Where Arattai data lives, and the writes shared by the callables and the webhook.
 * The shapes match the WhatsApp module's, so the same screens render both:
 *
 * RTDB
 *   arattai_conversations/{phone}/metadata      { lastMessage, timestamp, unreadCount, displayName, phoneNumber }
 *   arattai_conversations/{phone}/messages/{k}  { messageId, from, to, message, type, timestamp, direction, status, imageData?, broadcastId?, statusHistory? }
 *   arattai_broadcast_logs/{broadcastId}/{phone} { broadcastId, recipientId, name, status, timestamp, sentAt?, deliveredAt?, readAt?, messageId?, error? }
 *   arattai_message_map/{messageId}             { phone, messageKey, broadcastId? }  (server only: receipt -> where to apply it)
 *   arattai_debug_webhooks/{k}                  { timestamp, payload }               (admin read, pruned after 30 days)
 *   arattai_users/{userId}                      { phone?, name?, updatedAt }         (server only: Arattai user ID -> parent)
 *   arattai_phone_users/{phone}                 userId                               (server only: the other way)
 *   arattai_private/oauth                       { key, token, expiresAt }            (server only: cached access token)
 * Firestore
 *   configs/arattai_main                        { mode: sandbox|live, clientId, clientSecret, refreshToken, companyId,
 *                                                 businessId, businessNumberId, webhookToken, webhookSecret? }
 *   configs/arattai_main/templates/{name}       { name, category, status, components: [{ type: 'BODY', text }], arattai?, lastSynced }
 *   arattai_lists/{id}, arattai_lists/{id}/members/{id}, arattai_history/{broadcastId}
 */
const P = {
  conversations: "arattai_conversations",
  logs: "arattai_broadcast_logs",
  map: "arattai_message_map",
  debug: "arattai_debug_webhooks",
  history: "arattai_history",
  config: "arattai_main",
  users: "arattai_users",
  phoneUsers: "arattai_phone_users",
};

const safeKey = (key) => String(key).replace(/[.#$/[\]]/g, "_");

const STATUS_RANK = { queued: 1, processing: 2, sent: 3, delivered: 4, read: 5, failed: 6, error: 6 };
const rank = (s) => STATUS_RANK[String(s || "").toLowerCase()] || 0;

/**
 * History counter changes when a recipient moves from `from` to `to`. The counts are
 * buckets of where each recipient is now (the History screen adds sent + delivered +
 * read for "sent"), so a move takes one out of the old bucket and puts it in the new one.
 */
const BUCKET = { sent: "sentCount", delivered: "deliveredCount", read: "readCount", failed: "failedCount", error: "failedCount" };
function counterDeltas(from, to) {
  const inc = FieldValue.increment;
  const out = {};
  const was = BUCKET[String(from || "").toLowerCase()];
  const now = BUCKET[String(to || "").toLowerCase()];
  if (was === now) return out;
  if (was) out[was] = inc(-1);
  if (now) out[now] = inc(1);
  return out;
}

/**
 * Apply a delivery receipt. Receipts only ever move a message forward (a late "sent"
 * after "read" is recorded in statusHistory but doesn't change the status).
 */
async function applyStatus(st) {
  const db = admin.database();
  const mapSnap = await db.ref(`${P.map}/${safeKey(st.messageId)}`).once("value");
  if (!mapSnap.exists()) return false;
  const { phone, messageKey, broadcastId } = mapSnap.val();
  const entry = { status: st.status, timestamp: st.timestamp, serverTime: Date.now() };
  if (st.error) entry.error = st.error;

  const msgRef = db.ref(`${P.conversations}/${phone}/messages/${messageKey}`);
  const writes = [msgRef.child("statusHistory").push(entry)];

  if (broadcastId) {
    const logRef = db.ref(`${P.logs}/${broadcastId}/${phone}`);
    const current = (await logRef.child("status").once("value")).val();
    writes.push(logRef.child("statusHistory").push(entry));
    if (rank(st.status) > rank(current)) {
      const upd = { status: st.status, timestamp: st.timestamp };
      if (st.status === "sent") upd.sentAt = st.timestamp;
      if (st.status === "delivered") upd.deliveredAt = st.timestamp;
      if (st.status === "read") upd.readAt = st.timestamp;
      if (st.error) upd.error = st.error;
      writes.push(logRef.update(upd));
      writes.push(msgRef.update({ status: st.status, error: st.error || null }));
      const deltas = counterDeltas(current, st.status);
      if (Object.keys(deltas).length) {
        writes.push(admin.firestore().collection(P.history).doc(broadcastId).update(deltas).catch(() => {}));
      }
    }
  } else {
    const current = (await msgRef.child("status").once("value")).val();
    if (rank(st.status) > rank(current)) writes.push(msgRef.update({ status: st.status, error: st.error || null }));
  }
  await Promise.all(writes);
  return true;
}

/** File an incoming message under its sender's conversation and bump the unread count. */
async function applyIncoming(inc) {
  const db = admin.database();
  const convo = db.ref(`${P.conversations}/${inc.from}`);
  const dupe = await convo.child("messages").orderByChild("messageId").equalTo(inc.messageId).once("value");
  if (dupe.exists()) return false;

  let preview = inc.text;
  const msg = {
    messageId: inc.messageId, from: inc.from, to: "business", message: inc.text || "",
    type: inc.type, timestamp: inc.timestamp, direction: "inbound", status: "received",
  };
  if (inc.mediaUrl) {
    msg.imageData = { url: inc.mediaUrl, mimeType: inc.mimeType || "" };
    preview = inc.type === "image" ? (inc.text ? `📷 ${inc.text}` : "📷 Photo")
      : inc.type === "audio" ? "🎤 Voice Message" : "📎 Attachment";
  }
  await convo.child("messages").push(msg);
  await convo.child("metadata").transaction((cur) => {
    const name = inc.name || inc.from;
    if (!cur) return { lastMessage: preview, timestamp: inc.timestamp, unreadCount: 1, displayName: name, phoneNumber: inc.from };
    const keepName = cur.displayName && cur.displayName !== cur.phoneNumber;
    return { ...cur, lastMessage: preview, timestamp: inc.timestamp, displayName: keepName ? cur.displayName : name, unreadCount: (cur.unreadCount || 0) + 1 };
  });
  return true;
}

/**
 * Sandbox only: pretend Arattai reported back on messages just sent, through the same
 * applyStatus path a real receipt takes. Everyone gets "delivered"; numbers ending in
 * an even digit also get "read".
 */
async function simulateReceipts(sent) {
  for (const { messageId, phone } of sent) {
    const ts = Date.now();
    await applyStatus({ messageId, phone, status: "delivered", timestamp: ts });
    if (Number(String(phone).slice(-1)) % 2 === 0) {
      await applyStatus({ messageId, phone, status: "read", timestamp: ts + 1 });
    }
  }
}

/**
 * Arattai addresses people by user ID; the app by phone. Sending a template to a phone
 * tells us the ID, and incoming messages carry only the ID, so both directions are kept.
 */
async function rememberUser(userId, { phone, name } = {}) {
  const id = safeKey(String(userId || ""));
  if (!id) return;
  const db = admin.database();
  const upd = { updatedAt: Date.now() };
  if (phone) upd.phone = String(phone);
  if (name) upd.name = String(name).slice(0, 100);
  const writes = [db.ref(`${P.users}/${id}`).update(upd)];
  if (phone) writes.push(db.ref(`${P.phoneUsers}/${safeKey(phone)}`).set(id));
  await Promise.all(writes);
}

async function userIdForPhone(phone) {
  if (!phone) return null;
  return (await admin.database().ref(`${P.phoneUsers}/${safeKey(phone)}`).once("value")).val() || null;
}

async function phoneForUser(userId) {
  if (!userId) return null;
  return (await admin.database().ref(`${P.users}/${safeKey(String(userId))}/phone`).once("value")).val() || null;
}

module.exports = { P, safeKey, applyStatus, applyIncoming, simulateReceipts, counterDeltas, rememberUser, userIdForPhone, phoneForUser };
