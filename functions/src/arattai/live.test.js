// node --test src/arattai/live.test.js
// The live Arattai adapter against a fake Arattai (fetch stubbed) and a fake RTDB.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const path = require("path");

// --- fakes ---------------------------------------------------------------
const rtdb = {};
const ref = (p) => ({
  once: async () => ({ val: () => rtdb[p] ?? null }),
  set: async (v) => { rtdb[p] = v; },
  update: async (v) => { rtdb[p] = { ...(rtdb[p] || {}), ...v }; Object.entries(v).forEach(([k, x]) => { rtdb[`${p}/${k}`] = x; }); },
});
const admin = require("firebase-admin");
Object.defineProperty(admin, "database", { value: () => ({ ref }), configurable: true });

const calls = [];
let routes = {};
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const key = `${opts.method || "GET"} ${u.pathname}`;
  calls.push({ key, url: u, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null });
  const handler = routes[key];
  const [status, body] = handler ? handler(u, opts) : [404, { code: "not_found" }];
  return { ok: status < 300, status, json: async () => body };
};

const { live, verifySignature, renumber, arattaiPhone, parseArattai } = require(path.join(__dirname, "live.js"));

const config = {
  mode: "live", clientId: "cid", clientSecret: "sec", refreshToken: "rt",
  companyId: "C1", businessId: "B1", businessNumberId: "N1",
};

test.beforeEach(() => {
  calls.length = 0;
  Object.keys(rtdb).forEach((k) => delete rtdb[k]);
  routes = {
    "POST /oauth/v2/token": () => [200, { access_token: "tok1", expires_in: 3600 }],
  };
});

test("renumber turns named placeholders into {{1}}, {{2}} in first-use order", () => {
  const r = renumber("Hi {{parent}}, {{student}} was absent. {{parent}}", [{ name: "parent" }, { name: "student" }, { name: "extra" }]);
  assert.strictEqual(r.body, "Hi {{1}}, {{2}} was absent. {{1}}");
  assert.deepStrictEqual(r.names, ["parent", "student", "extra"]);
});

test("arattaiPhone adds the hyphen Arattai requires", () => {
  assert.strictEqual(arattaiPhone("919876543210"), "91-9876543210");
  assert.strictEqual(arattaiPhone("9876543210"), "91-9876543210");
  assert.strictEqual(arattaiPhone("14155550100"), "1-4155550100");
});

test("verifySignature accepts Arattai's Base64 HMAC and rejects anything else", () => {
  const raw = Buffer.from('{"event":"chat.message.sent"}');
  const sig = crypto.createHmac("sha256", "k").update(raw).digest("base64");
  assert.ok(verifySignature({ webhookSecret: "k" }, raw, `sha256=${sig}`));
  assert.ok(!verifySignature({ webhookSecret: "k" }, raw, `sha256=${sig.slice(1)}x`));
  assert.ok(!verifySignature({ webhookSecret: "k" }, raw, undefined));
  assert.ok(verifySignature({}, raw, undefined), "no key saved: not checked");
});

test("sendTemplate: one call per parent, named variables, user ID remembered", async () => {
  routes["POST /api/v1/transactions"] = (u, opts) => {
    const b = JSON.parse(opts.body);
    if (b.phone_number === "91-9000000000") return [400, { code: "invalid_recipient", message: "x" }];
    return [201, { data: { user_id: "777", ack_key: b.ack_key } }];
  };
  const template = { name: "fee", arattai: { id: "T1", type: "transaction", language: "en", placeholders: ["amount", "due"] } };
  const res = await live(config).sendTemplate({
    template, variables: ["500", "Monday"],
    recipients: [{ phone: "919876543210", name: "Asha" }, { phone: "919000000000", name: "Ravi" }],
  });
  assert.ok(res[0].messageId);
  assert.strictEqual(res[1].error, "This number isn't on Arattai.");
  const sent = calls.filter((c) => c.key === "POST /api/v1/transactions");
  assert.deepStrictEqual(sent[0].body.variables, { amount: "500", due: "Monday" });
  assert.strictEqual(sent[0].body.id, "T1");
  assert.strictEqual(sent[0].headers["Arattai-CompanyId"], "C1");
  assert.strictEqual(sent[0].headers["Arattai-BusinessNumberId"], "N1");
  assert.strictEqual(sent[0].headers.Authorization, "Bearer tok1");
  assert.strictEqual(rtdb["arattai_phone_users/919876543210"], "777");
  assert.strictEqual(rtdb["arattai_users/777"].phone, "919876543210");
  assert.strictEqual(calls.filter((c) => c.key === "POST /oauth/v2/token").length, 1, "token reused");
});

test("sendText needs a known user ID and uses the display message API", async () => {
  await assert.rejects(live(config).sendText({ to: "919111111111", text: "hi" }), /no conversation/i);
  rtdb["arattai_phone_users/919111111111"] = "555";
  routes["POST /api/v1/messages"] = (u, opts) => [201, { data: { ack_key: JSON.parse(opts.body).ack_key } }];
  const { messageId } = await live(config).sendText({ to: "919111111111", text: "hello" });
  const body = calls.find((c) => c.key === "POST /api/v1/messages").body;
  assert.deepStrictEqual({ ...body, ack_key: "-" }, { category: "display", type: "text", user_id: "555", content: { body: "hello" }, ack_key: "-" });
  assert.strictEqual(messageId, body.ack_key);
  // A chat keyed by user ID (number not shared) goes straight to that ID.
  await live(config).sendText({ to: "u42", text: "hey" });
  assert.strictEqual(calls.filter((c) => c.key === "POST /api/v1/messages")[1].body.user_id, "42");
});

test("sendText explains the 48-hour window", async () => {
  routes["POST /api/v1/messages"] = () => [400, { code: "business_message_window_expired", message: "x" }];
  await assert.rejects(live(config).sendText({ to: "u42", text: "hey" }), /48 hours/);
});

test("an expired access token is refreshed once and the call retried", async () => {
  let n = 0;
  routes["POST /oauth/v2/token"] = () => [200, { access_token: `tok${++n}`, expires_in: 3600 }];
  routes["GET /api/v1/businessnumbers/N1"] = (u, opts) => (opts.headers.Authorization === "Bearer tok2"
    ? [200, { data: { display_name: { published_name: "Abhishri Academy" }, full_phonenumber: "+919800000000" } }]
    : [401, { code: "invalid_oauthtoken" }]);
  const cfg = { ...config, refreshToken: "rt-other" };
  const acct = await live(cfg).getAccount();
  assert.deepStrictEqual(acct, { connected: true, label: "Abhishri Academy (+919800000000)" });
});

test("listTemplates keeps approved ones and renumbers their placeholders", async () => {
  routes["GET /api/v1/businesses/B1/messagetemplates"] = () => [200, { data: [{ id: "T1" }, { id: "T2" }] }];
  routes["GET /api/v1/messagetemplates/T1"] = () => [200, { data: {
    id: "T1", name: "Fee reminder notice", type: "transaction", status: "enabled", language: "en",
    translations: [{ language: "en", status: "approved", published: { message: { body: "Fee of {{amount}} due {{date}}" }, place_holders: [{ name: "amount" }, { name: "date" }] } }],
  } }];
  routes["GET /api/v1/messagetemplates/T2"] = () => [200, { data: {
    id: "T2", name: "Pending one here", type: "promotion", status: "enabled", language: "en",
    translations: [{ language: "en", status: "under_review", draft: { message: { body: "x" } } }],
  } }];
  const list = await live(config).listTemplates();
  assert.deepStrictEqual(list, [{
    name: "Fee reminder notice", category: "UTILITY", status: "APPROVED", body: "Fee of {{1}} due {{2}}",
    arattai: { id: "T1", type: "transaction", language: "en", placeholders: ["amount", "date"] },
  }]);
});

test("missing settings are named instead of calling Arattai", async () => {
  await assert.rejects(live({ mode: "live", clientId: "x" }).listTemplates(), /clientSecret, refreshToken, companyId, businessId, businessNumberId/);
  assert.strictEqual(calls.length, 0);
});

test("parseArattai: receipts by ack_key, incoming by user ID", async () => {
  const r1 = await parseArattai({ event: "chat.message.read", event_time: 1700000000000, entity: { ack_key: "ab1", id: "x" } });
  assert.deepStrictEqual(r1.statuses, [{ messageId: "ab1", status: "read", error: null, timestamp: 1700000000000 }]);

  // Unknown sender: chat keyed "u<id>".
  const r2 = await parseArattai({ event: "chat.message.received", event_time: 5, entity: { content: "Hello", user: { name: "Asha", id: "970" }, type: "text", ack_key: "k", id: "m1" } });
  assert.deepStrictEqual(r2.incoming, [{ messageId: "m1", from: "u970", name: "Asha", type: "text", text: "Hello", mediaUrl: null, mimeType: null, timestamp: 5 }]);

  // Known sender (we messaged them by phone before): their phone.
  rtdb["arattai_users/971/phone"] = "919876543210";
  const r3 = await parseArattai({ event: "chat.message.received", entity: { content: { url: "https://f", type: "image/jpeg", comment: "see" }, user: { id: "971" }, type: "file", id: "m2" } });
  assert.strictEqual(r3.incoming[0].from, "919876543210");
  assert.strictEqual(r3.incoming[0].type, "image");
  assert.strictEqual(r3.incoming[0].text, "see");

  const r4 = await parseArattai({ events: [{ kind: "status", messageId: "a", status: "delivered" }] });
  assert.strictEqual(r4.statuses[0].status, "delivered", "neutral shape still works");
});

test("sendNotification sends the event's template with named values and refuses groups", async () => {
  routes["POST /api/v1/transactions"] = (u, opts) => [201, { data: { user_id: "9", ack_key: JSON.parse(opts.body).ack_key } }];
  const template = { name: "T9", arattai: { id: "T9", type: "transaction", language: "en" } };
  const p = live(config);
  await assert.rejects(p.sendNotification({ to: { groupId: "g" }, message: {}, template }), /groups/);
  await assert.rejects(p.sendNotification({ to: { phone: "919800000001" }, message: {} }), /no approved Arattai template/);
  await p.sendNotification({ to: { phone: "919800000001" }, template, message: { values: { requester: "Lakshmi", link: "https://a" } } });
  const body = calls.find((c) => c.key === "POST /api/v1/transactions").body;
  assert.strictEqual(body.phone_number, "91-9800000001");
  assert.strictEqual(body.id, "T9");
  assert.deepStrictEqual(body.variables, { requester: "Lakshmi", link: "https://a" });
});

test("template management calls", async () => {
  routes["POST /api/v1/businesses/B1/messagetemplates"] = () => [201, { data: { id: "NT1", status: "enabled", translations: [] } }];
  routes["POST /api/v1/messagetemplates/NT1/submit"] = () => [200, {}];
  routes["PATCH /api/v1/messagetemplates/NT1"] = () => [200, {}];
  routes["DELETE /api/v1/messagetemplates/NT1"] = () => [200, {}];
  routes["GET /api/v1/messagetemplates/NT1"] = () => [200, { data: { id: "NT1", status: "enabled", translations: [{ language: "en", status: "rejected", rejection_reason: "Too vague" }] } }];
  const { createTemplate, submitTemplate, updateTemplate, deleteTemplate, getTemplate, SCOPES } = require(path.join(__dirname, "live.js"));
  const made = await createTemplate(config, { name: "abhishri_staff_test" });
  assert.deepStrictEqual([made.id, made.status], ["NT1", "draft"]);
  await submitTemplate(config, "NT1");
  assert.deepStrictEqual(calls.find((c) => c.key === "POST /api/v1/messagetemplates/NT1/submit").body, { languages: ["en"] });
  await updateTemplate(config, "NT1", { description: "x" });
  const t = await getTemplate(config, "NT1");
  assert.deepStrictEqual([t.status, t.reason], ["rejected", "Too vague"]);
  await deleteTemplate(config, "NT1");
  for (const s of ["CREATE", "UPDATE", "DELETE"]) assert.ok(SCOPES.includes(`ArattaiBusiness.messagetemplates.${s}`));
});

test("parseArattai: real sent, delivered (entity.messages[]) and failed payloads become receipts", async () => {
  const sent = await parseArattai({ event: "chat.message.sent", entity: { ack_key: "abd9ae", user: { id: "20032121615" } } });
  assert.deepStrictEqual(sent.statuses.map((s) => [s.messageId, s.status]), [["abd9ae", "sent"]]);

  const delivered = await parseArattai({ event: "chat.message.delivered", entity: { messages: [{ ack_key: "abd9ae" }], user: { id: "20032121615" } } });
  assert.deepStrictEqual(delivered.statuses.map((s) => [s.messageId, s.status]), [["abd9ae", "delivered"]]);

  const many = await parseArattai({ event: "chat.message.delivered", entity: { messages: [{ ack_key: "a1" }, { ack_key: "a2" }] } });
  assert.deepStrictEqual(many.statuses.map((s) => s.messageId), ["a1", "a2"]);

  const failed = await parseArattai({ event: "chat.message.failed", entity: { messages: [{ ack_key: "f1" }], reason: "blocked" } });
  assert.strictEqual(failed.statuses[0].status, "failed");
  assert.strictEqual(failed.statuses[0].error, "blocked");

  const received = await parseArattai({ event: "chat.message.received", entity: { ack_key: "258666117_1", content: "Hello", type: "text", user: { id: "970", name: "Asha", language: "en" } } });
  assert.strictEqual(received.statuses.length, 0);
  assert.strictEqual(received.incoming[0].text, "Hello");
});

test("parseArattai: every incoming media type maps to the shared message shape", async () => {
  const recv = async (entity) => (await parseArattai({ event: "chat.message.received", event_time: 9, entity: { ack_key: "k1", user: { id: "2694197", name: "Adish" }, ...entity } })).incoming[0];
  const gif = await recv({ type: "gif", content: { gif: { height: "576", url: "https://static.klipy.com/a.gif", width: "1024" }, url: "https://static.klipy.com/a.gif" } });
  assert.strictEqual(gif.type, "image");
  assert.strictEqual(gif.isGif, true);
  assert.strictEqual(gif.mediaUrl, "https://static.klipy.com/a.gif");
  const file = await recv({ type: "file", content: { file_name: "fees.pdf", size: 2048, type: "application/pdf", url: "https://f/x" } });
  assert.deepStrictEqual([file.type, file.mediaUrl, file.fileName, file.size], ["document", "https://f/x", "fees.pdf", 2048]);
  const img = await recv({ type: "file", content: { file_name: "a.jpg", type: "image/jpeg", url: "https://f/i", comment: "look" } });
  assert.deepStrictEqual([img.type, img.text], ["image", "look"]);
  const loc = await recv({ type: "location", content: { location: "School", latitude: 12.9, longitude: 80.2, name: "School", loc_type: "pinned" } });
  assert.strictEqual(loc.type, "location");
  assert.deepStrictEqual(loc.location, { lat: 12.9, lng: 80.2, name: "School", url: "https://www.google.com/maps?q=12.9%2C80.2" });
  const contact = await recv({ type: "contact", content: { name: "Asha", phones: [{ type: "mobile", number: "99999" }] } });
  assert.deepStrictEqual(contact.contact, { name: "Asha", phones: ["99999"] });
  const odd = await recv({ type: "mystery", content: { x: 1 } });
  assert.strictEqual(odd.text, "[unsupported message type: mystery]");
});

test("parseReceived: a photo arrives as type file with content.download_url", () => {
  const { parseReceived } = require("./live");
  const e = { ack_key: "1795155245377_1800", type: "file",
    content: { dimensions: { height: 1600, width: 788 }, download_url: "https://files.arattai.in/public?x-service=ArattaiBusiness&event-id=abc",
      file_name: "image_5827c.PNG", size: 83621, type: "image/jpeg" },
    user: { id: "3307860", name: "Sibhi" } };
  const m = parseReceived(e, { userId: "3307860", phone: null, name: "Sibhi", ts: 1 });
  assert.equal(m.type, "image");
  assert.equal(m.mediaUrl, "https://files.arattai.in/public?x-service=ArattaiBusiness&event-id=abc");
  assert.equal(m.text, "");
  assert.equal(m.fileName, "image_5827c.PNG");
});

test("parseArattai: chat.message.reacted (real shape) targets ack_key, keyed by the sender's chat", async () => {
  rtdb["arattai_users/3307860/phone"] = "918825622360";
  const r = await parseArattai({ event: "chat.message.reacted", event_time: 1795451272532, entity: { ack_key: "1795451123935_6742", content: { emoji: "👍" }, id: "1795451123992_64579303704", sender: { id: "3307860", name: "S" } } });
  assert.deepStrictEqual(r.reactions, [{ conversationId: "918825622360", targetId: "1795451123935_6742", key: "918825622360", from: "918825622360", emoji: "👍", at: 1795451272532 }]);
  // Unknown sender: "u<id>" chat; no emoji is a removal.
  const gone = await parseArattai({ event: "chat.message.reacted", event_time: 2, entity: { ack_key: "k9", content: {}, sender: { id: "555" } } });
  assert.deepStrictEqual(gone.reactions[0], { conversationId: "u555", targetId: "k9", key: "u555", from: "u555", emoji: "", at: 2 });
  assert.deepStrictEqual(gone.incoming, []);
});
