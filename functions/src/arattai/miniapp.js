const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { P } = require("./store");
const { getMiniAppSession, closeMiniAppSession, asHttps } = require("./live");

/**
 * Arattai opens our parent page inside a chat with ?user_data_key=<key>. This exchanges the
 * key for the parent's name and phone, and if that number is a parent on a student record,
 * hands back a Firebase custom token so the existing parent portal opens without an SMS code.
 *
 * The session is uid `arattai_<digits>` with claims { portalPhone, via: "arattai" }. It has no
 * email, so it can never match a staff account, and the rules/callables treat it like a
 * phone-code parent (see isPhoneSession in shared/access.js and firestore.rules).
 */

// Arattai's key format isn't documented (base64-style keys may contain + / =), so accept any
// printable, non-space key; it is URL-encoded when we call Arattai.
const KEY_PATTERN = /^[\x21-\x7e]{8,512}$/;

/** Arattai's "91-9999999911" as E.164 ("+919999999911"), or null. */
async function toE164(arattaiPhone) {
  const { normalizePhone } = await import("../shared/phone.mjs");
  const s = String(arattaiPhone || "").trim();
  if (!/^\+?\d{1,4}-\d{6,14}$/.test(s) && !/^\+?\d{8,15}$/.test(s)) return null;
  return normalizePhone(`+${s.replace(/^\+/, "").replace(/\D/g, "")}`);
}

exports.toE164 = toE164;

exports.startArattaiMiniApp = onCall(async (request) => {
  const key = request.data?.key;
  logger.info("Arattai mini app: start", { keyLen: typeof key === "string" ? key.length : null });
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    logger.warn("Arattai mini app: rejected key format", { keyLen: typeof key === "string" ? key.length : null });
    throw new HttpsError("invalid-argument", "Missing or invalid link.");
  }

  const snap = await admin.firestore().collection("configs").doc(P.config).get();
  const config = snap.exists ? snap.data() : {};
  if (config.mode !== "live") {
    throw new HttpsError("failed-precondition", "Arattai isn't connected.");
  }

  let session;
  try {
    session = await getMiniAppSession(config, key);
  } catch (err) {
    logger.warn("Arattai mini app: key exchange failed", err.status, err.code);
    // Expired, used or unknown keys come back as 4xx.
    if (err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 401 && err.status !== 403) {
      throw new HttpsError("not-found", "This link has expired.");
    }
    throw asHttps(err);
  }

  const phone = await toE164(session.phone);
  if (!phone) {
    await closeMiniAppSession(config, key);
    throw new HttpsError("failed-precondition", "Arattai didn't share a usable phone number.");
  }
  const last4 = phone.slice(-4);

  const { childrenFor } = require("../students/portal");
  const children = await childrenFor(phone);
  if (!children.length) {
    logger.info("Arattai mini app: number not registered", { last4 });
    await closeMiniAppSession(config, key);
    return { ok: false, reason: "not-registered", name: session.name };
  }

  const uid = `arattai_${phone.replace(/\D/g, "")}`;
  const auth = admin.auth();
  try {
    await auth.getUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    await auth.createUser({ uid, displayName: session.name || undefined });
  }
  const token = await auth.createCustomToken(uid, { portalPhone: phone, via: "arattai" });

  await closeMiniAppSession(config, key);
  logger.info("Arattai mini app: parent signed in", { last4, children: children.length });
  return { ok: true, token, name: session.name };
});
