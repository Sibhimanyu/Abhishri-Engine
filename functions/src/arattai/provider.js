const { HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");

/**
 * Everything that talks to Arattai goes through a provider, so the rest of the module
 * (chats, broadcasts, history, the webhook) never depends on how Arattai's API looks.
 *
 *   - "sandbox" (the default) fakes Arattai: sends succeed with made-up message IDs, a
 *     few sample templates are offered, and delivery receipts are simulated, so every
 *     screen can be used end to end without messaging anyone.
 *   - "live" (./live.js) is the Arattai Business Platform API.
 *
 * Provider contract (all phone numbers are digits only, e.g. "919876543210"; in live mode a
 * parent whose number Arattai hasn't shared is "u<userId>" instead):
 *   sendText({ to, text })                       -> { messageId }
 *   sendTemplate({ template, recipients, variables, headerImageUrl })
 *                                                -> [{ phone, messageId?, error? }] (one per recipient)
 *   listTemplates()                              -> [{ name, category, status, body, headerFormat? }]
 *   getAccount()                                 -> { connected, label, balance? }
 *   sendNotification({ to, message, template? })  -> { messageId }
 *       Staff notifications (see ./notify.js). `to` is { phone } or { groupId }; `message`
 *       is { title, text, links, actions } from shared/plainMessage.mjs. Send buttons for
 *       links (and actions, if Arattai can run them) or fall back to plainText(message).
 *   parseWebhook(body)                           -> { incoming, statuses } (or a promise of it)
 *   simulatesReceipts                            -> true when the caller should fake receipts
 *
 *   Incoming: { messageId, from, name?, type, text?, mediaUrl?, mimeType?, timestamp }
 *   Status:   { messageId, phone?, status: sent|delivered|read|failed, error?, timestamp }
 */

// The webhook always accepts this provider-neutral shape, in both modes, so anything that
// can POST JSON (a Zoho Flow, a test script, the eventual Arattai webhook via a small
// mapping) can feed the inbox before the official payload format is known:
//   { events: [ { kind: "message", ...Incoming } | { kind: "status", ...Status } ] }
function parseNeutral(body) {
  const incoming = [], statuses = [];
  for (const e of Array.isArray(body?.events) ? body.events : []) {
    if (e?.kind === "message" && e.from) incoming.push(normalizeIncoming(e));
    else if (e?.kind === "status" && e.messageId && e.status) statuses.push(normalizeStatus(e));
  }
  return { incoming, statuses };
}

const digits = (v) => String(v || "").replace(/[^\d]/g, "");
// One key per person: a bare Indian mobile (98765 43210, 098765 43210) gets its 91, so it
// matches the same number written with the country code.
const normalizePhone = (v) => {
  const d = digits(v);
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
};
const toMs = (t) => {
  const n = Number(t);
  if (!n) return Date.now();
  return n > 10000000000 ? n : n * 1000;
};

function normalizeIncoming(e) {
  return {
    messageId: String(e.messageId || `in_${crypto.randomUUID()}`),
    from: normalizePhone(e.from),
    name: e.name ? String(e.name).slice(0, 100) : null,
    type: e.type || (e.mediaUrl ? "image" : "text"),
    text: e.text ? String(e.text).slice(0, 4096) : "",
    mediaUrl: e.mediaUrl || null,
    mimeType: e.mimeType || null,
    timestamp: toMs(e.timestamp),
  };
}

function normalizeStatus(e) {
  return {
    messageId: String(e.messageId),
    phone: e.phone ? normalizePhone(e.phone) : null,
    status: String(e.status).toLowerCase(),
    error: e.error ? String(e.error).slice(0, 500) : null,
    timestamp: toMs(e.timestamp),
  };
}

const SANDBOX_TEMPLATES = [
  {
    name: "sandbox_general_update",
    category: "MARKETING",
    status: "APPROVED",
    body: "Dear Parent, {{1}}\n\nRegards,\nAbhishri Academy",
  },
  {
    name: "sandbox_fee_reminder",
    category: "UTILITY",
    status: "APPROVED",
    body: "Dear Parent, this is a reminder that the fee of ₹{{1}} for {{2}} is due on {{3}}.",
  },
  {
    name: "sandbox_holiday_notice",
    category: "UTILITY",
    status: "APPROVED",
    body: "Dear Parent, the school will remain closed on {{1}} for {{2}}.",
  },
];

// Numbers ending in 0000 "fail" in the sandbox, so the failure path can be seen too.
const sandboxFails = (phone) => digits(phone).endsWith("0000");
const sandboxId = () => `sbx_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

const sandbox = {
  mode: "sandbox",
  simulatesReceipts: true,
  async sendText({ to }) {
    if (sandboxFails(to)) throw new HttpsError("failed-precondition", "Sandbox: numbers ending in 0000 always fail.");
    return { messageId: sandboxId() };
  },
  async sendTemplate({ recipients }) {
    return recipients.map((r) => (sandboxFails(r.phone)
      ? { phone: r.phone, error: "Sandbox: numbers ending in 0000 always fail." }
      : { phone: r.phone, messageId: sandboxId() }));
  },
  async listTemplates() {
    return SANDBOX_TEMPLATES;
  },
  async getAccount() {
    return { connected: true, label: "Sandbox (nothing is really sent)" };
  },
  async sendNotification({ to }) {
    if (to?.phone && sandboxFails(to.phone)) throw new HttpsError("failed-precondition", "Sandbox: numbers ending in 0000 always fail.");
    return { messageId: sandboxId() };
  },
  parseWebhook: parseNeutral,
};

function getProvider(config) {
  // Required here, not at the top: live.js uses parseNeutral from this file.
  return config?.mode === "live" ? require("./live").live(config) : sandbox;
}

module.exports = { getProvider, parseNeutral, normalizePhone };
