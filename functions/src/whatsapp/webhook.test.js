// node --test src/whatsapp/webhook.test.js
// Delivery receipts reaching live-chat replies, against a tiny fake RTDB.
const test = require("node:test");
const assert = require("node:assert");

const admin = require("firebase-admin");
const { shouldApplyStatus, updateConversationMessage, processStatus, processIncoming } = require("./webhook");

// Fake RTDB over a flat map of path -> record (only messages/ children are modelled).
function fakeDb(data) {
  const refAt = (path) => ({
    toString: () => path,
    child: (k) => refAt(`${path}/${k}`),
    push: async (v) => { data[`${path}/${Math.random()}`] = v; },
    update: async (v) => { Object.assign(data[path] ||= {}, v); },
    set: async (v) => { data[path] = v; },
    transaction: async () => {},
    orderByChild: (field) => ({
      equalTo: (val) => ({
        once: async () => snapOf(Object.keys(data).filter((k) => k.startsWith(`${path}/`) && k.split("/").length === path.split("/").length + 1 && data[k][field] === val)),
      }),
    }),
    once: async () => snapOf([path], true),
  });
  const snapOf = (keys, single) => {
    const ks = keys.filter((k) => data[k] && typeof data[k] === "object" && "messageId" in data[k] || single && data[k]);
    return {
      exists: () => ks.length > 0,
      val: () => (single ? data[ks[0]] ?? null : null),
      ref: single ? refAt(keys[0]) : undefined,
      forEach: (fn) => ks.forEach((k) => fn({ ref: refAt(k), val: () => data[k], key: k.split("/").pop() })),
    };
  };
  return { ref: refAt, data };
}

const WAMID = "wamid.HBgMABC=";
const KEY = "wamid_HBgMABC=";
const base = () => ({
  [`whatsapp_conversations/918825622360/messages/${KEY}`]: { messageId: WAMID, direction: "outbound", status: "processing", message: "working" },
});

test("shouldApplyStatus only moves forward, failed always applies", () => {
  assert.ok(shouldApplyStatus("processing", "sent"));
  assert.ok(shouldApplyStatus("sent", "delivered"));
  assert.ok(!shouldApplyStatus("read", "delivered"));
  assert.ok(!shouldApplyStatus("delivered", "sent"));
  assert.ok(shouldApplyStatus("read", "failed"));
});

test("a Meta status item updates the live-chat reply found by sanitized key", async () => {
  const db = fakeDb(base());
  const ok = await updateConversationMessage(db, { wamid: WAMID, recipient: "918825622360", status: "delivered", timestamp: 1795152132000 });
  assert.ok(ok);
  assert.strictEqual(db.data[`whatsapp_conversations/918825622360/messages/${KEY}`].status, "delivered");
  // a late "sent" is recorded in history but does not move the status back
  await updateConversationMessage(db, { wamid: WAMID, recipient: "918825622360", status: "sent", timestamp: 1 });
  assert.strictEqual(db.data[`whatsapp_conversations/918825622360/messages/${KEY}`].status, "delivered");
});

test("falls back to the messageId field when the key is not the wamid", async () => {
  const db = fakeDb({ "whatsapp_conversations/918825622360/messages/-Pabc": { messageId: WAMID, status: "sent" } });
  assert.ok(await updateConversationMessage(db, { wamid: WAMID, recipient: "918825622360", status: "read", timestamp: 2 }));
  assert.strictEqual(db.data["whatsapp_conversations/918825622360/messages/-Pabc"].status, "read");
});

test("processStatus with no broadcast still updates the conversation message (wamid = report.id)", async () => {
  const db = fakeDb(base());
  await processStatus(db, null, { id: WAMID, status: "read", timestamp: "1795152132", recipient_id: "918825622360" });
  assert.strictEqual(db.data[`whatsapp_conversations/918825622360/messages/${KEY}`].status, "read");
});

test("failed receipts record the error", async () => {
  const db = fakeDb(base());
  await processStatus(db, null, { id: WAMID, status: "failed", timestamp: "1", recipient_id: "918825622360", errors: [{ title: "Re-engagement message" }] });
  const m = db.data[`whatsapp_conversations/918825622360/messages/${KEY}`];
  assert.strictEqual(m.status, "failed");
  assert.strictEqual(m.error, "Re-engagement message");
});

test("a business echo is never filed as a customer message", async () => {
  const db = fakeDb(base());
  const before = Object.keys(db.data).length;
  await processIncoming(db, { id: WAMID, from: "918825622360", from_me: true, timestamp: 1, type: "text", text: { body: "working" } });
  assert.strictEqual(Object.keys(db.data).length, before);
});
