// Where staff notifications go: Arattai (Settings > Staff Notifications, stored in
// configs/arattai_notify). Every notification (functions/src/notify/triggers.js) comes
// through here. Each send is written to notification_log (admin-only) with what happened.
//
// Best-effort: nothing here throws, so a failure can't block or repeat the save that
// caused it.
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { FieldValue } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { loadNotifyConfig, sendArattaiNotification } = require("../arattai/notify");

const plain = () => import("../shared/plainMessage.mjs");

/**
 * Send one staff notification.
 *   kind      what it is, for the log ("approval requested", "access request", ...)
 *   audience  { channel: true } for the admins, or { users: [appEmails] }
 *   message   { title, text, links, actions } from wording.js
 *   config    the Arattai notification config, if the caller already loaded it
 *   force     send even while notifications are switched off (the test send)
 */
async function notifyStaff({ kind, audience, message, config, force }) {
  try {
    const [loaded, { plainText }] = await Promise.all([config || loadNotifyConfig(), plain()]);
    const cfg = force ? { ...loaded, enabled: true } : loaded;
    const result = await sendArattaiNotification(audience, message, cfg);
    const results = { arattai: result };
    if (result.status === "off") return results;

    await admin.firestore().collection("notification_log").add({
      at: FieldValue.serverTimestamp(),
      kind,
      audience: audience.channel ? "admins" : (audience.users || []).join(", "),
      title: message.title,
      text: plainText({ ...message, title: "", links: [] }),
      results,
    }).catch((err) => logger.warn("Notify: couldn't write notification_log", err.message));

    if (result.status === "failed" || result.status === "partial") {
      logger.error(`Notify: Arattai ${result.status} for ${kind}`, result.error || JSON.stringify(result.failed));
    } else if (result.status === "skipped") {
      logger.warn(`Notify: Arattai skipped ${kind}`, result.reason || result.error || `no phone for ${(result.skipped || []).join(", ")}`);
    } else {
      logger.info(`Notify: Arattai sent ${kind}`);
    }
    return results;
  } catch (err) {
    logger.error(`Notify: failed to send ${kind}`, err.message);
    return null;
  }
}

// Three months of history is plenty for checking what went out.
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
