const { onRequest } = require("firebase-functions/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { ServerValue } = require("firebase-admin/database");
const crypto = require("crypto");
const { getProvider } = require("./provider");
const { verifySignature } = require("./live");
const { P, applyIncoming, applyStatus } = require("./store");
const { mirrorMedia } = require("./media");
const { authHeaders } = require("./live");
const { applyTemplateApproval } = require("./staffTemplates");

const tokenMatches = (presented, expected) => {
  const a = Buffer.from(String(presented || ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Incoming messages and delivery receipts from Arattai.
 *
 * Unlike the WhatsApp webhook this one is closed until a webhookToken is set (Settings →
 * Arattai Config). Callers present it as ?token=<value> (part of the URL given to
 * Arattai) or an X-Webhook-Token header. When a webhookSecret is saved too, POSTs must
 * also carry Arattai's X-Hub-Signature-256 (Base64 HMAC-SHA256 of the raw body).
 * How the body is read is up to the provider (see provider.js); both modes accept the
 * neutral { events: [...] } shape.
 */
exports.arattaiWebhook = onRequest(async (request, response) => {
  let config;
  try {
    const snap = await admin.firestore().collection("configs").doc(P.config).get();
    config = snap.exists ? snap.data() : {};
  } catch (err) {
    logger.error("Arattai webhook: could not load config", err);
    return response.status(503).send("Config unavailable");
  }

  const token = config.webhookToken ? String(config.webhookToken).trim() : "";
  const presented = request.query.token || request.get("x-webhook-token");
  if (!token || !tokenMatches(presented, token)) {
    logger.warn("Arattai webhook: rejected call", { method: request.method, tokenConfigured: !!token });
    return response.status(403).send("Forbidden");
  }

  // Arattai checks the URL with a GET ?challenge=<uuid> and expects { challenge } back.
  if (request.method === "GET") {
    return request.query.challenge
      ? response.status(200).json({ challenge: String(request.query.challenge) })
      : response.status(200).send("OK");
  }
  if (request.method !== "POST") return response.status(405).send("Method Not Allowed");
  if (!verifySignature(config, request.rawBody, request.get("x-hub-signature-256"))) {
    logger.warn("Arattai webhook: bad signature", { eventId: request.get("x-arattai-eventid") || null });
    return response.status(401).send("Bad signature");
  }

  try {
    const body = request.body || {};
    await admin.database().ref(P.debug).push({ timestamp: ServerValue.TIMESTAMP, payload: body });
    const { incoming, statuses, templates = [] } = await getProvider(config).parseWebhook(body);
    for (const inc of incoming) {
      // Arattai's file links expire quickly, so keep our own copy before saving the message.
      const msg = config.mode === "live" && inc.mediaUrl
        ? await mirrorMedia(inc, { conversationId: inc.from, authHeaders: () => authHeaders(config) }).catch(() => inc)
        : inc;
      await applyIncoming(msg);
    }
    for (const t of templates) await applyTemplateApproval(t);
    let unmatched = 0;
    for (const st of statuses) if (!(await applyStatus(st))) unmatched++;
    if (unmatched) logger.info("Arattai webhook: receipts for unknown messages", { unmatched });
    return response.status(200).json({ ok: true, messages: incoming.length, receipts: statuses.length });
  } catch (err) {
    logger.error("Arattai webhook: failed to process", err);
    return response.status(500).send("Error");
  }
});

// Same retention as the WhatsApp debug log: payloads carry parents' numbers and messages.
const RETENTION_DAYS = 30;
const BATCH = 500;
const MAX_BATCHES = 20;

exports.pruneArattaiDebugLog = onSchedule(
  { schedule: "every day 03:40", timeZone: "Asia/Kolkata" },
  async () => {
    const ref = admin.database().ref(P.debug);
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    let removed = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const snap = await ref.orderByChild("timestamp").endAt(cutoff).limitToFirst(BATCH).once("value");
      if (!snap.exists()) break;
      const updates = {};
      snap.forEach((child) => { updates[child.key] = null; });
      const n = Object.keys(updates).length;
      await ref.update(updates);
      removed += n;
      if (n < BATCH) break;
    }
    logger.info("pruneArattaiDebugLog complete", { removed, retentionDays: RETENTION_DAYS });
  }
);
