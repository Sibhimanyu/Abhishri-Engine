// Staff notifications over Arattai: the same ones the Cliq bot sends (shared/notifications.mjs),
// so the school can move off Cliq by running both for a while, then switching Cliq off.
// functions/src/notify/dispatch.js decides what goes where; this sends the Arattai side.
//
// Settings live in configs/arattai_notify (admin-only, by the configs rule's default):
//   enabled     master switch for Arattai staff notifications
//   groupId     an Arattai group for what Cliq posts to the admins' channel. When empty,
//               each admin gets those posts as a direct message instead.
//   phoneMap    { appEmail: phone } for staff with no phone on their staff record
//   template    name of a synced Arattai template (live mode): Arattai only lets a business
//               message someone first with an approved template
//
// Direct messages go to the staff member's mobile: phoneMap, else staff/{id}.phone for the
// staff record with that email, else allowed_users/{email}.phone. Anyone without one is
// skipped and listed in the notification log.
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { resolveAccess } = require("../shared/access");
const { getProvider, normalizePhone } = require("./provider");
const { P, safeKey } = require("./store");

async function loadNotifyConfig() {
  const db = admin.firestore();
  const [notify, main] = await Promise.all([
    db.collection("configs").doc("arattai_notify").get(),
    db.collection("configs").doc(P.config).get(),
  ]);
  const cfg = notify.exists ? notify.data() : {};
  const phoneMap = {};
  Object.entries(cfg.phoneMap && typeof cfg.phoneMap === "object" ? cfg.phoneMap : {}).forEach(([email, phone]) => {
    const e = String(email || "").trim().toLowerCase();
    const p = normalizePhone(phone);
    if (e && p.length >= 10) phoneMap[e] = p;
  });
  const templateName = String(cfg.template || "").trim();
  const tSnap = templateName
    ? await db.collection("configs").doc(P.config).collection("templates").doc(safeKey(templateName)).get()
    : null;
  return {
    enabled: cfg.enabled === true,
    groupId: String(cfg.groupId || "").trim(),
    phoneMap,
    template: tSnap?.exists ? tSnap.data() : null,
    provider: getProvider(main.exists ? main.data() : {}),
  };
}

/** A staff member's mobile for Arattai, or null. */
async function phoneFor(cfg, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  if (cfg.phoneMap[e]) return cfg.phoneMap[e];
  const db = admin.firestore();
  const staff = await db.collection("staff").where("email", "==", e).limit(1).get();
  const fromStaff = staff.empty ? "" : normalizePhone(staff.docs[0].data().phone);
  if (fromStaff.length >= 10) return fromStaff;
  const user = await db.collection("allowed_users").doc(e).get();
  const fromUser = user.exists ? normalizePhone(user.data().phone) : "";
  return fromUser.length >= 10 ? fromUser : null;
}

/** App emails of everyone who is an admin. */
async function adminEmails() {
  const db = admin.firestore();
  const [byFlag, byRole] = await Promise.all([
    db.collection("allowed_users").where("isAdmin", "==", true).get(),
    db.collection("allowed_users").where("role", "==", "admin").get(),
  ]);
  const emails = new Set();
  [...byFlag.docs, ...byRole.docs].forEach((d) => {
    const email = String(d.data().email || (d.id.includes("@") ? d.id : "")).toLowerCase();
    if (email) emails.add(email);
  });
  return [...emails];
}

/**
 * Who would get a message for this audience: { group?, people: [{ email, phone|null }] }.
 * `audience` is { channel: true } (what Cliq posts to the admins' channel) or { users: [emails] }.
 */
async function recipientsFor(cfg, audience) {
  if (audience.channel && cfg.groupId) return { group: cfg.groupId, people: [] };
  const emails = audience.channel ? await adminEmails() : [...new Set((audience.users || []).map((e) => String(e).toLowerCase()))];
  const people = await Promise.all(emails.map(async (email) => ({ email, phone: await phoneFor(cfg, email) })));
  return { people };
}

/**
 * Send one notification. Never throws: returns what happened, for the notification log.
 *   { status: off | sent | partial | failed | skipped, sent, failed: [{ to, error }], skipped: [emails] }
 */
async function sendArattaiNotification(audience, message, cfgIn) {
  const cfg = cfgIn || await loadNotifyConfig();
  if (!cfg.enabled) return { status: "off" };
  try {
    const { group, people } = await recipientsFor(cfg, audience);
    const targets = group ? [{ label: "group", to: { groupId: group } }]
      : people.filter((p) => p.phone).map((p) => ({ label: p.email, to: { phone: p.phone } }));
    const skipped = people.filter((p) => !p.phone).map((p) => p.email);
    const results = await Promise.allSettled(targets.map((t) => cfg.provider.sendNotification({ to: t.to, message, template: cfg.template })));
    const failed = results.map((r, i) => (r.status === "rejected" ? { to: targets[i].label, error: r.reason?.message || String(r.reason) } : null)).filter(Boolean);
    const sent = targets.length - failed.length;
    const status = targets.length === 0 ? "skipped" : sent === 0 ? "failed" : failed.length || skipped.length ? "partial" : "sent";
    return { status, mode: cfg.provider.mode, sent, failed, skipped };
  } catch (err) {
    return { status: "failed", failed: [{ to: "all", error: err.message }], sent: 0, skipped: [] };
  }
}

/**
 * Admin-only, from Settings > Arattai Config: who would get staff notifications on
 * Arattai (and whose phone is missing), and with { send: true } a test to both audiences.
 * Works while Arattai notifications are switched off, so the setup can be checked first.
 */
const checkArattaiNotify = onCall(async (request) => {
  const access = await resolveAccess(request.auth);
  if (!access?.isAdmin) throw new HttpsError("permission-denied", "Only admins can check staff notifications.");
  const cfg = await loadNotifyConfig();
  const [admins, me] = await Promise.all([
    recipientsFor(cfg, { channel: true }),
    // An admin signed in without a verified email has no address to look a phone up by.
    access.email ? recipientsFor(cfg, { users: [access.email] }) : { people: [] },
  ]);
  const out = { enabled: cfg.enabled, mode: cfg.provider.mode, admins, me };
  if (request.data?.send) {
    const test = (where) => ({
      title: "Arattai notification test",
      text: `Test from Abhishri Engine. If you can see this ${where}, staff notifications on Arattai are set up.`,
      links: [{ label: "Open app", url: "https://abhishri-academy.web.app" }],
      actions: [],
    });
    const on = { ...cfg, enabled: true };
    out.results = {
      admins: await sendArattaiNotification({ channel: true }, test(cfg.groupId ? "in the admins' group" : "as an admin"), on),
      me: access.email ? await sendArattaiNotification({ users: [access.email] }, test("as a direct message"), on) : { status: "skipped", skipped: [] },
    };
  }
  return out;
});

module.exports = { loadNotifyConfig, recipientsFor, sendArattaiNotification, checkArattaiNotify };
