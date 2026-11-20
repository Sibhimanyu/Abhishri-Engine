// Staff notifications over Arattai (the events in shared/notifications.mjs).
// functions/src/notify/dispatch.js sends them through here.
//
// Settings live in configs/arattai_notify (admin-only, by the configs rule's default),
// edited in Settings > Staff Notifications:
//   enabled     master switch for staff notifications
//   appUrl      where message links point (default https://abhishri-academy.web.app)
//   groupId     an Arattai group for what goes to the admins. When empty, each admin gets
//               those messages as a direct message instead.
//   phoneMap    { appEmail: phone } for staff with no phone on their staff record
// (An old `template` field is ignored.) Each event has its own Arattai template, made and
// tracked in configs/staff_messages (see ./staffTemplates.js); an event whose template isn't
// approved is not sent. The wording is in configs/staff_messages too (../notify/wording.js).
//
// Direct messages go to the staff member's mobile: phoneMap, else staff/{id}.phone for the
// staff record with that email, else allowed_users/{email}.phone. Anyone without one is
// skipped and listed in the notification log.
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { resolveAccess } = require("../shared/access");
const { getProvider, normalizePhone } = require("./provider");
const { P } = require("./store");

const DEFAULT_APP_URL = "https://abhishri-academy.web.app";

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
  const staffMsgs = await db.collection("configs").doc("staff_messages").get().catch(() => null);
  const staffTemplates = {};
  Object.entries(staffMsgs?.exists ? staffMsgs.data() : {}).forEach(([key, v]) => {
    if (v?.arattai) staffTemplates[key] = v.arattai;
  });
  return {
    enabled: cfg.enabled === true,
    appUrl: String(cfg.appUrl || "").trim() || DEFAULT_APP_URL,
    groupId: String(cfg.groupId || "").trim(),
    phoneMap,
    staffTemplates,
    provider: getProvider(main.exists ? main.data() : {}),
  };
}

/**
 * A person's mobile for Arattai and where it came from:
 * { phone|null, source: 'override'|'staff record'|'user account'|null, staffName }.
 */
async function resolvePhone(cfg, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return { phone: null, source: null, staffName: "" };
  const db = admin.firestore();
  const staff = await db.collection("staff").where("email", "==", e).limit(1).get();
  const staffData = staff.empty ? {} : staff.docs[0].data();
  const staffName = String(staffData.name || "").trim();
  if (cfg.phoneMap[e]) return { phone: cfg.phoneMap[e], source: "override", staffName };
  const fromStaff = normalizePhone(staffData.phone);
  if (fromStaff.length >= 10) return { phone: fromStaff, source: "staff record", staffName };
  const user = await db.collection("allowed_users").doc(e).get();
  const fromUser = user.exists ? normalizePhone(user.data().phone) : "";
  return fromUser.length >= 10 ? { phone: fromUser, source: "user account", staffName } : { phone: null, source: null, staffName };
}

/** A staff member's mobile for Arattai, or null. */
async function phoneFor(cfg, email) {
  return (await resolvePhone(cfg, email)).phone;
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
 * `audience` is { channel: true } (the admins) or { users: [emails] }.
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
  // Each event is sent with its own template, and only once Arattai has approved it.
  const state = cfg.staffTemplates?.[message.event];
  if (!state || state.status !== "approved" || !state.templateId) {
    return { status: "skipped", reason: "template not approved", mode: cfg.provider.mode, sent: 0, failed: [], skipped: [] };
  }
  try {
    const { templateValues } = await import("../shared/staffMessages.mjs");
    // The approved template holds the text last submitted, so fill exactly its placeholders.
    const sendMessage = { ...message, values: templateValues(state.submittedText || {}, message.vars) };
    const template = { name: state.templateId, arattai: { id: state.templateId, type: "transaction", language: "en" } };
    const { group, people } = await recipientsFor(cfg, audience);
    const targets = group ? [{ label: "group", to: { groupId: group } }]
      : people.filter((p) => p.phone).map((p) => ({ label: p.email, to: { phone: p.phone } }));
    const skipped = people.filter((p) => !p.phone).map((p) => p.email);
    const results = await Promise.allSettled(targets.map((t) => cfg.provider.sendNotification({ to: t.to, message: sendMessage, template })));
    const failed = results.map((r, i) => (r.status === "rejected" ? { to: targets[i].label, error: r.reason?.message || String(r.reason) } : null)).filter(Boolean);
    const sent = targets.length - failed.length;
    const status = targets.length === 0 ? "skipped" : sent === 0 ? "failed" : failed.length || skipped.length ? "partial" : "sent";
    return { status, mode: cfg.provider.mode, sent, failed, skipped };
  } catch (err) {
    return { status: "failed", failed: [{ to: "all", error: err.message }], sent: 0, skipped: [] };
  }
}

/**
 * Admin-only, from Settings > Staff Notifications: who would get staff notifications
 * (and whose phone is missing). Works while notifications are switched off, so the setup
 * can be checked first. The test send is sendStaffNotificationTest (notify/triggers.js).
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
  return { enabled: cfg.enabled, mode: cfg.provider.mode, admins, me };
});

const ADMIN_GETS = ["Approval requested", "Approval decided", "Access requests", "Tamil birthdays", "Test message"];
const EVERYONE_GETS = ["Your approvals (approved or sent back)"];

/** Every app user with their resolved Arattai phone and what they get; admins first, then A-Z. */
async function listRecipients(cfg) {
  const snap = await admin.firestore().collection("allowed_users").get();
  const seen = new Set();
  const users = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const email = String(data.email || (d.id.includes("@") ? d.id : "")).trim().toLowerCase();
    if (!email || seen.has(email)) return;
    seen.add(email);
    users.push({ email, data });
  });
  const rows = await Promise.all(users.map(async ({ email, data }) => {
    const r = await resolvePhone(cfg, email);
    const isAdmin = data.isAdmin === true || data.role === "admin";
    return {
      email,
      name: r.staffName || String(data.displayName || data.name || "").trim(),
      role: String(data.role || (isAdmin ? "admin" : "staff")),
      isAdmin,
      phone: r.phone,
      phoneSource: r.source,
      gets: isAdmin ? [...ADMIN_GETS, ...EVERYONE_GETS] : [...EVERYONE_GETS],
    };
  }));
  rows.sort((a, b) => (b.isAdmin - a.isAdmin) || (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: "base" }));
  return rows;
}

/** Admin-only: the table in Settings > Staff Notifications > Recipients. */
const listStaffNotificationRecipients = onCall(async (request) => {
  const access = await resolveAccess(request.auth);
  if (!access?.isAdmin) throw new HttpsError("permission-denied", "Only admins can see staff notification recipients.");
  const cfg = await loadNotifyConfig();
  return { recipients: await listRecipients(cfg), mode: cfg.provider.mode };
});

module.exports = { listStaffNotificationRecipients, listRecipients, resolvePhone, loadNotifyConfig, recipientsFor, sendArattaiNotification, checkArattaiNotify };
