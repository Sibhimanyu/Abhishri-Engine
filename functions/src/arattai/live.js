const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { rememberUser, userIdForPhone, phoneForUser } = require("./store");

/**
 * The real Arattai Business Platform adapter (docs:
 * https://www.arattaibusiness.in/business-platform/developers/introduction/).
 *
 * Config (configs/arattai_main): clientId, clientSecret, refreshToken (OAuth, from
 * https://api-console.arattai.in with access_type=offline), companyId, businessId,
 * businessNumberId, and optionally webhookSecret (the webhook's selected signing key).
 *
 * Things Arattai does differently from WhatsApp, which this file hides:
 *   - Parents are Arattai *user IDs*, not phone numbers. A template sent by phone returns
 *     the user ID; incoming messages carry only the user ID. ./store.js keeps both ways.
 *   - Free text ("display" messages) is only allowed within 48 hours of the parent's last
 *     message, and only to a user ID. Anything else needs an approved template.
 *   - Templates have named placeholders ({{student_name}}). The rest of the app uses
 *     WhatsApp's {{1}}, {{2}}, so sync renumbers them and sending maps them back.
 *   - We pick each message's ID ourselves (ack_key); receipts come back with it.
 */
const API = "https://business.arattai.in";
const ACCOUNTS = "https://accounts.arattai.in";
const SCOPES = [
  "ArattaiBusiness.messages.CREATE",
  "ArattaiBusiness.messagetemplates.READ",
  "ArattaiBusiness.phonenumbers.READ",
  "ArattaiBusiness.customerdata.READ",
  "ArattaiBusiness.miniapps.CREATE",
].join(",");

const SEND_PATH = { transaction: "/api/v1/transactions", promotion: "/api/v1/promotions", authentication: "/api/v1/authentications" };
const CATEGORY = { transaction: "UTILITY", promotion: "MARKETING", authentication: "AUTHENTICATION" };
const TEXT_LIMIT = 2000;

const digits = (v) => String(v || "").replace(/[^\d]/g, "");
const newAckKey = () => `ab${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`;

/** "919876543210" -> "91-9876543210", the only phone format Arattai accepts. */
function arattaiPhone(phone) {
  const d = digits(phone);
  if (d.length <= 10) return `91-${d}`;
  return `${d.slice(0, d.length - 10)}-${d.slice(-10)}`;
}

function missingSettings(config) {
  return ["clientId", "clientSecret", "refreshToken", "companyId", "businessId", "businessNumberId"]
    .filter((k) => !String(config?.[k] || "").trim());
}

// ---------------------------------------------------------------- OAuth

// Access tokens last an hour. Refreshing is rate limited per refresh token, so the token
// is shared through RTDB (arattai_private has no rule, so clients can't read it) as well
// as memory.
let memoryToken = null; // { key, token, expiresAt }
const TOKEN_REF = () => admin.database().ref("arattai_private/oauth");
const tokenKey = (config) => crypto.createHash("sha256").update(`${config.clientId}|${config.refreshToken}`).digest("hex");

// Broadcasts send several messages at once; they share one refresh rather than each
// starting their own.
let refreshing = null; // { key, promise }

function accessToken(config, { force = false } = {}) {
  const key = tokenKey(config);
  if (refreshing?.key === key) return refreshing.promise;
  const promise = loadOrRefresh(config, key, force).finally(() => {
    if (refreshing?.promise === promise) refreshing = null;
  });
  refreshing = { key, promise };
  return promise;
}

async function loadOrRefresh(config, key, force) {
  const fresh = (t) => t && t.key === key && t.expiresAt > Date.now() + 60000;
  if (!force && fresh(memoryToken)) return memoryToken.token;
  if (!force) {
    const cached = (await TOKEN_REF().once("value").catch(() => null))?.val();
    if (fresh(cached)) {
      memoryToken = cached;
      return memoryToken.token;
    }
  }
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: String(config.refreshToken).trim(),
    client_id: String(config.clientId).trim(),
    client_secret: String(config.clientSecret).trim(),
  });
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token?${params}`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const why = body.error || `HTTP ${res.status}`;
    throw new HttpsError("failed-precondition", `Arattai sign-in failed (${why}). Check the Client ID, Client Secret and Refresh Token in Settings → Arattai Config.`);
  }
  memoryToken = { key, token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  await TOKEN_REF().set(memoryToken).catch((err) => logger.warn("Arattai: could not cache token", err.message));
  return memoryToken.token;
}

// ---------------------------------------------------------------- HTTP

// What parents and staff see when Arattai says no, by Arattai's error code.
const FRIENDLY = {
  invalid_recipient: "This number isn't on Arattai.",
  business_message_window_expired: "This parent hasn't messaged the school in the last 48 hours, so only a template can be sent. Use Broadcast.",
  no_ongoing_conversation: "There's no conversation with this parent on Arattai yet.",
  business_recipient_not_allowed: "This parent has blocked the school or turned off business messages.",
  recipient_identity_mismatch: "This number now belongs to a different Arattai user.",
  unassociated_template: "This template doesn't belong to the school's Arattai business. Sync templates again.",
  too_many_requests: "Arattai's sending limit was reached. Try again in a minute.",
  insufficient_balance: "The Arattai wallet is out of balance.",
};

class ArattaiError extends Error {
  constructor(status, code, message) {
    super(FRIENDLY[code] || message || `Arattai error ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function call(config, method, path, { body, query, number = false } = {}) {
  const url = new URL(path, API);
  Object.entries(query || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const headers = { "Arattai-CompanyId": String(config.companyId).trim() };
  if (number) headers["Arattai-BusinessNumberId"] = String(config.businessNumberId).trim();
  if (body) headers["Content-Type"] = "application/json";

  for (let attempt = 0; attempt < 2; attempt++) {
    headers.Authorization = `Bearer ${await accessToken(config, { force: attempt > 0 })}`;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    // An access token revoked or expired early: refresh once and retry.
    if (res.status === 401 && attempt === 0) continue;
    throw new ArattaiError(res.status, data.code, data.message);
  }
  throw new ArattaiError(401, "invalid_oauthtoken");
}

// ---------------------------------------------------------------- Mini app

/**
 * Exchange the single-use `user_data_key` Arattai adds to the mini app URL (valid one
 * minute) for who opened it: { name, phone ("91-9999999911"), businessNumberId, source }.
 * Fields may sit under `data`.
 */
async function getMiniAppSession(config, key) {
  const res = await call(config, "GET", `/api/v1/miniappsessions/${encodeURIComponent(key)}`);
  const d = res?.data && typeof res.data === "object" ? res.data : res || {};
  return { name: d.name || "", phone: d.phone || "", businessNumberId: d.businessnumber_id || "", source: d.source || "" };
}

/** Close the session once we've read it. Best effort: the key is single-use anyway. */
async function closeMiniAppSession(config, key) {
  try {
    await call(config, "DELETE", `/api/v1/miniappsessions/${encodeURIComponent(key)}`);
  } catch (err) {
    logger.warn("Arattai: could not close mini app session", err.message);
  }
}

const asHttps = (err) => {
  if (err instanceof HttpsError) return err;
  const code = err.status === 429 ? "resource-exhausted" : err.status >= 500 ? "unavailable" : "failed-precondition";
  return new HttpsError(code, err.message);
};

// ---------------------------------------------------------------- Templates

/** Named placeholders in order of first use, and the body renumbered to {{1}}, {{2}}. */
function renumber(text, declared = []) {
  const names = [];
  const seen = (n) => { if (!names.includes(n)) names.push(n); return names.indexOf(n) + 1; };
  const body = String(text || "").replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, n) => `{{${seen(n)}}}`);
  // Declared but unused placeholders still need a value, so they go last.
  declared.forEach((p) => p?.name && seen(p.name));
  return { body, names };
}

async function listTemplates(config) {
  const summaries = [];
  for (let index = 0; ; index += 100) {
    const page = await call(config, "GET", `/api/v1/businesses/${encodeURIComponent(config.businessId)}/messagetemplates`, { query: { limit: 100, index } });
    const rows = Array.isArray(page.data) ? page.data : [];
    summaries.push(...rows);
    if (rows.length < 100) break;
  }
  const out = [];
  for (const s of summaries) {
    const full = (await call(config, "GET", `/api/v1/messagetemplates/${encodeURIComponent(s.id)}`)).data || s;
    const translations = Array.isArray(full.translations) ? full.translations : [];
    const tr = translations.find((t) => t.language === full.language && t.published)
      || translations.find((t) => t.language === "en" && t.published)
      || translations.find((t) => t.published)
      || translations[0] || {};
    const content = tr.published || tr.draft || {};
    const approved = full.status === "enabled" && tr.status === "approved" && !!tr.published;
    // Arattai refuses anything else, so Broadcast shouldn't offer it.
    if (!approved) continue;
    const { body, names } = renumber([content.message?.title, content.message?.body, content.message?.footer].filter(Boolean).join("\n\n"), content.place_holders);
    out.push({
      name: full.name,
      category: CATEGORY[full.type] || "MARKETING",
      status: "APPROVED",
      body,
      arattai: { id: String(full.id), type: full.type, language: tr.language || full.language || "en", placeholders: names },
    });
  }
  return out;
}

// ---------------------------------------------------------------- Sending

async function sendTemplateTo(config, template, recipient, values) {
  const meta = template.arattai || {};
  const path = SEND_PATH[meta.type];
  if (!meta.id || !path) throw new HttpsError("failed-precondition", `Template "${template.name}" has no Arattai ID. Sync templates in Settings → Arattai Config.`);
  const variables = {};
  (meta.placeholders || []).forEach((name, i) => { variables[name] = String(values[i] ?? ""); });
  const ackKey = newAckKey();
  const body = { id: meta.id, ack_key: ackKey, language: meta.language || "en" };
  if (Object.keys(variables).length) body.variables = variables;
  if (recipient.userId) body.user_id = String(recipient.userId);
  else body.phone_number = arattaiPhone(recipient.phone);
  const res = await call(config, "POST", path, { body, number: true });
  const userId = res?.data?.user_id;
  if (userId && recipient.phone) await rememberUser(userId, { phone: recipient.phone, name: recipient.name });
  return { messageId: String(res?.data?.ack_key || ackKey), userId };
}

/** Run `fn` over `items`, a few at a time (Arattai allows 80 sends a second in total). */
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

/** Who to address a conversation to: a known user ID, or a phone the API can look up. */
async function resolveRecipient(to) {
  const key = String(to || "");
  if (key.startsWith("u")) return { userId: key.slice(1), phone: null };
  return { userId: await userIdForPhone(key), phone: key };
}

const live = (config) => {
  const ready = () => {
    const missing = missingSettings(config);
    if (missing.length) throw new HttpsError("failed-precondition", `Arattai Live is missing: ${missing.join(", ")}. Fill them in Settings → Arattai Config.`);
  };
  return {
    mode: "live",
    simulatesReceipts: false,

    async sendText({ to, text }) {
      ready();
      if (String(text).length > TEXT_LIMIT) throw new HttpsError("invalid-argument", `Arattai messages can be at most ${TEXT_LIMIT} characters.`);
      const { userId } = await resolveRecipient(to);
      if (!userId) throw new HttpsError("failed-precondition", FRIENDLY.no_ongoing_conversation + " Send a template from Broadcast first; replies work once they message back.");
      const ackKey = newAckKey();
      try {
        const res = await call(config, "POST", "/api/v1/messages", {
          number: true,
          body: { category: "display", type: "text", user_id: String(userId), content: { body: String(text) }, ack_key: ackKey },
        });
        return { messageId: String(res?.data?.ack_key || ackKey) };
      } catch (err) {
        throw asHttps(err);
      }
    },

    async sendTemplate({ template, recipients, variables }) {
      ready();
      return pool(recipients, 5, async (r) => {
        try {
          const target = r.phone?.startsWith("u") ? { userId: r.phone.slice(1), name: r.name } : r;
          const { messageId } = await sendTemplateTo(config, template, target, variables || []);
          return { phone: r.phone, messageId };
        } catch (err) {
          return { phone: r.phone, error: err.message };
        }
      });
    },

    async listTemplates() {
      ready();
      try {
        return await listTemplates(config);
      } catch (err) {
        throw asHttps(err);
      }
    },

    async getAccount() {
      const missing = missingSettings(config);
      if (missing.length) return { connected: false, label: `Missing: ${missing.join(", ")}` };
      try {
        const res = await call(config, "GET", `/api/v1/businessnumbers/${encodeURIComponent(config.businessNumberId)}`);
        const n = res.data || {};
        const name = n.display_name?.published_name || n.display_name?.draft_name || n.user_name || "Arattai business";
        return { connected: true, label: `${name} (${n.full_phonenumber || n.phonenumber || "number"})` };
      } catch (err) {
        return { connected: false, label: err.message };
      }
    },

    /**
     * Staff notifications. Staff rarely message the school first, so this needs an
     * approved template with one placeholder (the whole message) or two (title, details).
     * Arattai's API can't post to groups.
     */
    async sendNotification({ to, message, template }) {
      ready();
      if (to?.groupId) throw new HttpsError("failed-precondition", "Arattai's Business API can't post to groups. Clear the group ID so each admin gets a direct message.");
      if (!template) throw new HttpsError("failed-precondition", "Pick a staff notification template in Settings → Staff Notifications.");
      const { plainText } = await import("../shared/plainMessage.mjs");
      const n = (template.arattai?.placeholders || []).length;
      const values = n >= 2
        ? [message.title || "Abhishri Engine", plainText({ ...message, title: "" })]
        : [plainText(message)];
      const recipient = await resolveRecipient(to.phone);
      try {
        return await sendTemplateTo(config, template, recipient.userId ? recipient : { phone: to.phone }, values);
      } catch (err) {
        throw asHttps(err);
      }
    },

    parseWebhook: parseArattai,
  };
};

// ---------------------------------------------------------------- Webhook

/** Is this call really from Arattai? Only checked when a signing key is saved. */
function verifySignature(config, rawBody, header) {
  const secret = String(config?.webhookSecret || "").trim();
  if (!secret) return true;
  const presented = String(header || "").replace(/^sha256\s*=\s*/i, "").trim();
  const expected = crypto.createHmac("sha256", secret).update(rawBody || Buffer.alloc(0)).digest("base64");
  const a = Buffer.from(presented), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const STATUS_EVENT = {
  "chat.message.sent": "sent",
  "chat.message.delivered": "delivered",
  "chat.message.read": "read",
  "chat.message.failed": "failed",
};

/** A readable line for message types that aren't text or files. */
function describe(type, content) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  if (type === "location") return `📍 ${content.name || content.location || `${content.latitude}, ${content.longitude}`}`;
  if (type === "contact") return `👤 ${content.name || "Contact"}`;
  if (type === "address") return `🏠 ${content.message || content.address || "Address"}`;
  return String(content.message || content.title || content.comment || "");
}


const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;

/**
 * One chat.message.received entity into the neutral incoming shape. Media arrives as a
 * `url` (content.url, or content.<type>.url for gif), never a media ID, so it is stored as is.
 * Besides the base fields it may carry fileName, size, location { lat, lng, name, url }
 * and contact { name, phones }.
 */
function parseReceived(e, { userId, phone, name, ts }) {
  const c = e.content;
  const obj = c && typeof c === "object" ? c : {};
  const t = e.type || "text";
  const out = {
    messageId: String(e.id || e.ack_key || `in_${crypto.randomUUID()}`),
    from: phone || `u${digits(userId)}`,
    name,
    type: t === "text" ? "text" : t,
    text: "",
    mediaUrl: null,
    mimeType: null,
    timestamp: ts,
  };
  const rawUrl = String(obj[t]?.url || obj.url || "");
  // Only web links: anything else (javascript:, data:) would end up in a staff member's href.
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
  const mime = String(obj.type || obj[t]?.type || "");
  if (t === "file" && url) {
    out.type = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document";
    out.text = String(obj.comment || obj.file_name || "");
    out.mediaUrl = url;
    out.mimeType = mime || null;
    if (obj.file_name) out.fileName = String(obj.file_name);
    if (obj.size != null) out.size = Number(obj.size) || null;
  } else if ((t === "gif" || t === "image" || t === "sticker" || t === "video" || t === "audio" || t === "voice") && url) {
    out.type = t === "gif" ? "image" : t === "voice" ? "audio" : t;
    if (t === "gif") out.isGif = true;
    out.text = String(obj.comment || obj.caption || "");
    out.mediaUrl = url;
    out.mimeType = /^(image|audio|video)\//.test(mime) ? mime : t === "gif" ? "image/gif" : null;
  } else if (t === "location" && obj.latitude != null && obj.longitude != null) {
    out.text = describe(t, obj);
    out.location = { lat: Number(obj.latitude), lng: Number(obj.longitude), name: String(obj.name || obj.location || ""), url: mapsLink(obj.latitude, obj.longitude) };
  } else if (t === "contact") {
    const phones = (Array.isArray(obj.phones) ? obj.phones : []).map((p) => String(p?.number || p?.phone || p?.value || (typeof p === "string" ? p : ""))).filter(Boolean);
    out.text = describe(t, obj);
    out.contact = { name: String(obj.name || ""), phones };
  } else if (t === "text" || typeof c === "string") {
    out.text = describe(t, c);
  } else {
    out.text = describe(t, c) || `[unsupported message type: ${t}]`;
  }
  out.text = out.text.slice(0, 4096);
  return out;
}

/**
 * Arattai's envelope ({ event, event_time, entity }) into the provider-neutral shape.
 * Senders arrive as user IDs; known ones become their phone number, others "u<userId>".
 * The neutral { events: [...] } body is still accepted, for testing.
 */
async function parseArattai(body) {
  if (Array.isArray(body?.events)) return require("./provider").parseNeutral(body);
  const incoming = [], statuses = [];
  const e = body?.entity || {};
  const ts = Number(body?.event_time) || Date.now();

  if (STATUS_EVENT[body?.event]) {
    // "sent" and "failed" carry entity.ack_key; "delivered" carries entity.messages[].ack_key.
    const keys = new Set();
    if (e.ack_key) keys.add(String(e.ack_key));
    if (Array.isArray(e.messages)) for (const m of e.messages) if (m?.ack_key) keys.add(String(m.ack_key));
    const error = body.event === "chat.message.failed" ? String(e.reason || e.message || e.code || "Arattai couldn't deliver this message").slice(0, 500) : null;
    for (const messageId of keys) statuses.push({ messageId, status: STATUS_EVENT[body.event], error, timestamp: ts });
  } else if (body?.event === "chat.message.received" && e.user?.id) {
    const userId = String(e.user.id);
    const name = e.user.name ? String(e.user.name).slice(0, 100) : null;
    const phone = await phoneForUser(userId);
    await rememberUser(userId, { phone, name });
    incoming.push(parseReceived(e, { userId, phone, name, ts }));
  }
  return { incoming, statuses };
}

module.exports = { live, call, asHttps, getMiniAppSession, closeMiniAppSession, verifySignature, parseArattai, renumber, arattaiPhone, missingSettings, SCOPES };
