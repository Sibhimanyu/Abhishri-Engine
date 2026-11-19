// Where staff notifications go. Every notification the Cliq bot used to post directly
// (functions/src/cliq/triggers.js) now comes through here and goes to each channel that's
// switched on:
//   Cliq     configs/cliq.enabled          (Settings > Cliq Bot)
//   Arattai  configs/arattai_notify.enabled (Settings > Arattai Config)
// Both can be on at once, so the school can run them side by side and check they match
// before switching Cliq off. Each send is written to notification_log (admin-only) with
// what every channel did.
//
// Best-effort, like before: nothing here throws, so a failure can't block or repeat the
// save that caused it.
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { FieldValue } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { loadCliqConfig, missingSetting, postToChannel, postToUsers } = require("../cliq/client");
const { loadNotifyConfig, sendArattaiNotification } = require("../arattai/notify");

const plain = () => import("../shared/plainMessage.mjs");

async function sendCliq(cfg, audience, message) {
  if (!cfg.enabled) return { status: "off" };
  const missing = missingSetting(cfg);
  if (missing) return { status: "skipped", error: `The ${missing} isn't set in Settings > Cliq Bot.` };
  try {
    if (audience.channel) await postToChannel(cfg, message);
    else await postToUsers(cfg, audience.users || [], message);
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err.message };
  }
}

/**
 * Send one staff notification to every channel that's on.
 *   kind      what it is, for the log ("approval requested", "access request", ...)
 *   audience  { channel: true } for the admins, or { users: [appEmails] }
 *   message   the Cliq message (shared/cliqMessages.mjs); other channels get its plain form
 *   cliq      the Cliq config, if the caller already loaded it
 */
async function notifyStaff({ kind, audience, message, cliq }) {
  try {
    const [cliqCfg, arattaiCfg, { plainFromCliq, plainText }] = await Promise.all([
      cliq || loadCliqConfig(), loadNotifyConfig(), plain(),
    ]);
    const simple = plainFromCliq(message);
    const [cliqResult, arattaiResult] = await Promise.all([
      sendCliq(cliqCfg, audience, message),
      sendArattaiNotification(audience, simple, arattaiCfg),
    ]);
    const results = { cliq: cliqResult, arattai: arattaiResult };
    const attempted = Object.entries(results).filter(([, r]) => r.status !== "off");
    if (attempted.length === 0) return results;

    await admin.firestore().collection("notification_log").add({
      at: FieldValue.serverTimestamp(),
      kind,
      audience: audience.channel ? "admins" : (audience.users || []).join(", "),
      title: simple.title,
      text: plainText({ ...simple, links: [] }),
      results,
    }).catch((err) => logger.warn("Notify: couldn't write notification_log", err.message));

    for (const [name, r] of attempted) {
      if (r.status === "failed" || r.status === "partial") {
        logger.error(`Notify: ${name} ${r.status} for ${kind}`, r.error || JSON.stringify(r.failed));
      } else if (r.status === "skipped") {
        logger.warn(`Notify: ${name} skipped ${kind}`, r.error || `no phone for ${(r.skipped || []).join(", ")}`);
      } else {
        logger.info(`Notify: ${name} sent ${kind}`);
      }
    }
    return results;
  } catch (err) {
    logger.error(`Notify: failed to send ${kind}`, err.message);
    return null;
  }
}

// The log is for checking the move from Cliq; three months is plenty.
const LOG_DAYS = 90;
exports.pruneNotificationLog = onSchedule({ schedule: "every day 03:50", timeZone: "Asia/Kolkata" }, async () => {
  const cutoff = new Date(Date.now() - LOG_DAYS * 86400000);
  const db = admin.firestore();
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const snap = await db.collection("notification_log").where("at", "<", cutoff).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  logger.info("pruneNotificationLog complete", { removed });
});

exports.notifyStaff = notifyStaff;
