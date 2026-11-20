// Staff notifications for things waiting on someone's consent, sent over Arattai:
// - a teacher sends a weekly menu or daily report for approval -> admins
// - an admin approves it or sends it back                      -> admins (so they see it's
//   handled) and the teacher who asked
// - someone signs in who isn't set up yet (access request)     -> admins
// - Tamil birthdays today                                      -> one morning message
// These match the web app's bell: both follow shared/notifications.mjs. What counts as an
// event, and the wording (editable in Settings), is in shared/staffMessages.mjs. Approvals
// are reviewed in the app, through the link in the message.
//
// Sending goes through ./dispatch.js. Notifications are best-effort: a failure is logged,
// never retried or thrown, so it can't hold up or repeat the save that caused it.
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { resolveAccess } = require("../shared/access");
const { loadNotifyConfig } = require("../arattai/notify");
const { notifyStaff } = require("./dispatch");
const { composeStaffMessage } = require("./wording");

const messages = () => import("../shared/staffMessages.mjs");

/** A person's name as the app knows it (allowed_users/{email}.displayName), else their email. */
async function displayNameOf(email) {
  if (!email) return "Someone";
  try {
    const snap = await admin.firestore().collection("allowed_users").doc(String(email).toLowerCase()).get();
    return (snap.exists && snap.data().displayName) || email;
  } catch {
    return email;
  }
}

/** The notification config when Arattai notifications are on, else null so there's no work to do. */
async function readyConfig() {
  const cfg = await loadNotifyConfig();
  return cfg.enabled ? cfg : null;
}

function approvalTrigger(collection) {
  return onDocumentWritten(`${collection}/{docId}`, async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const m = await messages();
    const kind = m.approvalEvent(before, after);
    if (!kind) return;

    const id = event.params.docId;
    const cfg = await readyConfig();
    if (!cfg) return;

    const { approval } = after;
    const what = `${kind} ${collection}/${id}`;
    const appUrl = cfg.appUrl;
    if (kind === "requested") {
      const requesterName = await displayNameOf(approval.requestedBy);
      const message = await composeStaffMessage("approvalRequested", m.requestVars({ collection, id, data: after, requesterName, appUrl }));
      await notifyStaff({ kind: what, audience: { channel: true }, config: cfg, message });
      return;
    }
    const [reviewerName, requesterName] = await Promise.all([displayNameOf(approval.reviewedBy), displayNameOf(approval.requestedBy)]);
    // Each is sent on its own, so one failing doesn't stop the other.
    const sends = [
      composeStaffMessage("approvalDecided", m.decidedVars({ collection, id, data: after, event: kind, reviewerName, requesterName, appUrl }))
        .then((message) => notifyStaff({ kind: what, audience: { channel: true }, config: cfg, message })),
    ];
    if (approval.requestedBy !== approval.reviewedBy) {
      sends.push(composeStaffMessage(m.outcomeKey(kind), m.outcomeVars({ collection, id, data: after, event: kind, reviewerName, appUrl }))
        .then((message) => notifyStaff({ kind: `${what} (to the teacher)`, audience: { users: [approval.requestedBy] }, config: cfg, message })));
    }
    await Promise.allSettled(sends);
  });
}

exports.notifyOnMenuApproval = approvalTrigger("weekly_menus");
exports.notifyOnReportApproval = approvalTrigger("daily_reports");

// Created on someone's first sign-in attempt; later attempts only update it. If an admin
// removes the request and they try again, it's created again and sent again.
exports.notifyOnAccessRequest = onDocumentCreated("unauthorized_logins/{email}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const email = String(data.email || event.params.email).toLowerCase();
  // Same filter as the bell: someone already given access isn't a request.
  const allowed = await admin.firestore().collection("allowed_users").doc(email).get();
  if (allowed.exists) return;
  const cfg = await readyConfig();
  if (!cfg) return;
  const m = await messages();
  const message = await composeStaffMessage("accessRequest", m.accessRequestVars({ data: { ...data, email }, appUrl: cfg.appUrl }));
  await notifyStaff({ kind: `access request ${email}`, audience: { channel: true }, config: cfg, message });
});

/** Today's Tamil month and day in Chennai, the same way the web app works it out. */
async function tamilDateToday() {
  const { AstroTime, Observer, Body, Equator, Ecliptic } = await import("astronomy-engine");
  const { tamilSolarDate } = await import("../shared/tamilSolarDate.mjs");
  const now = new Date();
  const sun = Equator(Body.Sun, new AstroTime(now), new Observer(13.0827, 80.2707, 0), true, true);
  return tamilSolarDate(Ecliptic(sun.vec).elon, now);
}

// One message each morning with the day's Tamil birthdays, the digest of the bell's
// per-person entries. Nothing is sent on a day without any.
exports.notifyTamilBirthdays = onSchedule({ schedule: "30 7 * * *", timeZone: "Asia/Kolkata" }, async () => {
  const cfg = await readyConfig();
  if (!cfg) return;
  const today = await tamilDateToday();
  const db = admin.firestore();
  const find = async (coll, type) => {
    const snap = await db.collection(coll).where("tamilMonth", "==", today.tamilMonth).where("tamilDay", "==", today.tamilDay).get();
    return snap.docs.map((d) => ({ name: d.data().name, type, ...today })).filter((m) => m.name);
  };
  const members = [...await find("students", "student"), ...await find("staff", "staff")];
  const m = await messages();
  const vars = m.birthdayVars({ members, appUrl: cfg.appUrl });
  if (!vars) {
    logger.info(`Notify: no Tamil birthdays on ${today.tamilMonth} ${today.tamilDay}`);
    return;
  }
  const message = await composeStaffMessage("birthdays", vars);
  await notifyStaff({ kind: `Tamil birthdays ${today.tamilMonth} ${today.tamilDay}`, audience: { channel: true }, config: cfg, message });
});

/**
 * Admin-only, from Settings > Staff Notifications: sends the test message to the admins
 * and to the caller, and reports each result, so a missing phone or a wrong template shows
 * up straight away. Works while notifications are switched off, so setup can be checked first.
 */
exports.sendStaffNotificationTest = onCall(async (request) => {
  const access = await resolveAccess(request.auth);
  if (!access?.isAdmin) throw new HttpsError("permission-denied", "Only admins can send a test.");
  const config = await loadNotifyConfig();
  const test = (where) => composeStaffMessage("test", { where, link: config.appUrl });
  const admins = await notifyStaff({
    kind: "test", audience: { channel: true }, force: true, config,
    message: await test(config.groupId ? "in the admins' group" : "as an admin"),
  });
  const me = access.email
    ? await notifyStaff({ kind: "test", audience: { users: [access.email] }, force: true, config, message: await test("as a direct message") })
    : null;
  return {
    enabled: config.enabled,
    mode: config.provider.mode,
    results: {
      admins: admins?.arattai || { status: "failed", failed: [], skipped: [] },
      me: me?.arattai || { status: "skipped", skipped: [] },
    },
  };
});
