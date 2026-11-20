// One Arattai template per staff notification event, managed from Settings > Staff
// Notifications. The wording is in shared/staffMessages.mjs (edited text in
// configs/staff_messages); this file creates, submits, edits, tracks and deletes the
// matching Arattai templates and records the state at
//   configs/staff_messages -> { [eventKey]: { title, body, arattai: {
//     templateId, status, rejectedReason?, submittedAt, approvedAt?, submittedText: { title, body }, lastError } } }
// status: draft | under_review | approved | rejected | update_required (no state = not submitted).
// Only the server writes `arattai` (Admin SDK); the doc is admin-only in firestore.rules.
// Sandbox mode simulates: submitting marks the template approved straight away.
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { resolveAccess } = require("../shared/access");
const { getProvider } = require("./provider");
const live = require("./live");
const { P } = require("./store");

const messages = () => import("../shared/staffMessages.mjs");
const messagesRef = () => admin.firestore().collection("configs").doc("staff_messages");

async function requireAdmin(auth) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Please sign in.");
  const access = await resolveAccess(auth);
  if (!access?.isAdmin) throw new HttpsError("permission-denied", "Only admins can manage staff notification templates.");
}

async function context() {
  const [m, snap, main] = await Promise.all([
    messages(),
    messagesRef().get(),
    admin.firestore().collection("configs").doc(P.config).get(),
  ]);
  const config = main.exists ? main.data() : {};
  const provider = getProvider(config);
  return { m, doc: snap.exists ? snap.data() : {}, config, provider };
}

function checkKey(m, key) {
  if (!Object.prototype.hasOwnProperty.call(m.EVENTS, key)) throw new HttpsError("invalid-argument", "Unknown notification.");
}

function liveReady(config) {
  const missing = live.missingSettings(config);
  if (missing.length) throw new HttpsError("failed-precondition", `Arattai Live is missing: ${missing.join(", ")}. Fill them in Settings → Arattai Config.`);
}

const setState = (key, arattai) => messagesRef().set({ [key]: { arattai } }, { merge: true });

/** Record a failure on the event without losing the rest of its state. */
const recordError = (key, err) => messagesRef().set({ [key]: { arattai: { lastError: String(err?.message || err).slice(0, 500) } } }, { merge: true });

/** Create (or edit) the event's template, then send it for review. */
const submitStaffTemplate = onCall(async (request) => {
  await requireAdmin(request.auth);
  const key = String(request.data?.key || "");
  const { m, doc, config, provider } = await context();
  checkKey(m, key);
  const state = doc[key]?.arattai || {};
  if (state.status === "under_review") throw new HttpsError("failed-precondition", "Arattai is reviewing this template. It can be changed once the review is done.");
  const wording = m.mergeMessages(doc)[key];
  let payload;
  try {
    payload = m.buildTemplatePayload(key, wording);
  } catch (err) {
    throw new HttpsError("invalid-argument", err.message);
  }
  const submittedText = { title: wording.title, body: wording.body };

  if (provider.mode !== "live") {
    await setState(key, {
      templateId: state.templateId || `sandbox_${payload.name}`, status: "approved", rejectedReason: FieldValue.delete(),
      submittedAt: Timestamp.now(), approvedAt: Timestamp.now(), submittedText, lastError: null,
    });
    return { ok: true, status: "approved", mode: "sandbox" };
  }

  liveReady(config);
  try {
    let id = state.templateId;
    if (id) await live.updateTemplate(config, id, payload);
    else id = (await live.createTemplate(config, payload)).id;
    if (!id) throw new HttpsError("internal", "Arattai didn't return a template ID.");
    // Remember the ID before submitting, so a failed submit can be retried as an edit.
    await setState(key, { templateId: id, status: "draft", submittedText, lastError: null });
    await live.submitTemplate(config, id);
    await setState(key, { templateId: id, status: "under_review", rejectedReason: FieldValue.delete(), submittedAt: Timestamp.now(), approvedAt: FieldValue.delete(), submittedText, lastError: null });
    return { ok: true, status: "under_review", mode: "live" };
  } catch (err) {
    await recordError(key, err).catch(() => {});
    throw err;
  }
});

/** Ask Arattai for the current status of every template that has been created. */
const refreshStaffTemplates = onCall(async (request) => {
  await requireAdmin(request.auth);
  const { m, doc, config, provider } = await context();
  if (provider.mode !== "live") return { ok: true, mode: "sandbox", checked: 0 };
  liveReady(config);
  let checked = 0;
  for (const key of Object.keys(m.EVENTS)) {
    const state = doc[key]?.arattai;
    if (!state?.templateId) continue;
    try {
      const t = await live.getTemplate(config, state.templateId);
      const update = { status: t.status, lastError: null };
      update.rejectedReason = t.status === "rejected" && t.reason ? t.reason : FieldValue.delete();
      if (t.status === "approved" && state.status !== "approved") update.approvedAt = Timestamp.now();
      await setState(key, update);
      checked++;
    } catch (err) {
      logger.warn(`Staff templates: couldn't refresh ${key}`, err.message);
      await recordError(key, err).catch(() => {});
    }
  }
  return { ok: true, mode: "live", checked };
});

/** Delete the event's template at Arattai and forget it here. The wording is kept. */
const deleteStaffTemplate = onCall(async (request) => {
  await requireAdmin(request.auth);
  const key = String(request.data?.key || "");
  const { m, doc, config, provider } = await context();
  checkKey(m, key);
  const state = doc[key]?.arattai;
  if (!state) return { ok: true };
  if (provider.mode === "live" && state.templateId) {
    liveReady(config);
    await live.deleteTemplate(config, state.templateId);
  }
  await messagesRef().set({ [key]: { arattai: FieldValue.delete() } }, { merge: true });
  return { ok: true };
});

/** The messagetemplate.approval.updated webhook: find the event by templateId and record the outcome. */
async function applyTemplateApproval({ templateId, status, reason }) {
  const snap = await messagesRef().get();
  const data = snap.exists ? snap.data() : {};
  const key = Object.keys(data).find((k) => data[k]?.arattai?.templateId === templateId);
  if (!key) {
    logger.info("Staff templates: approval for an unknown template", { templateId });
    return false;
  }
  const update = { [`${key}.arattai.status`]: status, [`${key}.arattai.lastError`]: null };
  if (status === "approved") {
    update[`${key}.arattai.approvedAt`] = Timestamp.now();
    update[`${key}.arattai.rejectedReason`] = FieldValue.delete();
  } else {
    update[`${key}.arattai.rejectedReason`] = reason || FieldValue.delete();
  }
  await messagesRef().update(update);
  return true;
}

module.exports = { submitStaffTemplate, refreshStaffTemplates, deleteStaffTemplate, applyTemplateApproval };
