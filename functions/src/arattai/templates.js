// The Templates page: every Arattai message template the business has, and creating,
// editing, submitting and deleting them. Admin only.
//
// Live mode talks to Arattai (./live.js). Sandbox mode keeps templates in Firestore at
// configs/{P.config}/sandbox_templates and "submitting" approves them straight away.
// Staff notification templates (one per event, see ./staffTemplates.js) show up in the list
// with `staffEvent` set; they are edited through submitStaffTemplate, not here.
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { resolveAccess } = require("../shared/access");
const { getProvider } = require("./provider");
const live = require("./live");
const { P } = require("./store");

const rules = () => import("../shared/templateRules.mjs");
const messagesRef = () => admin.firestore().collection("configs").doc("staff_messages");
const sandboxCol = () => admin.firestore().collection("configs").doc(P.config).collection("sandbox_templates");

async function requireAdmin(auth) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Please sign in.");
  const access = await resolveAccess(auth);
  if (!access?.isAdmin) throw new HttpsError("permission-denied", "Only admins can manage templates.");
}

async function context() {
  const main = await admin.firestore().collection("configs").doc(P.config).get();
  const config = main.exists ? main.data() : {};
  return { config, mode: getProvider(config).mode };
}

function liveReady(config) {
  const missing = live.missingSettings(config);
  if (missing.length) throw new HttpsError("failed-precondition", `Arattai Live is missing: ${missing.join(", ")}. Fill them in Settings → Arattai Config.`);
}

// ---------------------------------------------------------------- Pure helpers

/** A time Arattai sent (epoch seconds or milliseconds, or a date string) as milliseconds, or null. */
function toMillis(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return n < 1e11 ? n * 1000 : n;
  }
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

/**
 * One list row from a full template response (data.translations[].draft / .published):
 * { id, name, type, language, description, status, enabled, reason, title, body, footer,
 *   placeholders: [{ name, sample }], modifiedAt }. The content comes from the draft
 * and falls back to the published version.
 */
function parseRow(res) {
  const d = res?.data && typeof res.data === "object" && !Array.isArray(res.data) ? res.data : res || {};
  const translations = Array.isArray(d.translations) ? d.translations : [];
  const tr = translations.find((t) => t.language === d.language) || translations.find((t) => t.language === "en") || translations[0] || {};
  const draft = tr.draft && typeof tr.draft === "object" ? tr.draft : null;
  const published = tr.published && typeof tr.published === "object" ? tr.published : null;
  const content = draft || published || {};
  const status = String(content.status || tr.status || (published ? "approved" : "draft"));
  const reason = (draft && (draft.rejection_reason || draft.rejected_reason || draft.reason)) || tr.rejection_reason || tr.rejected_reason || tr.reason || d.rejection_reason || d.reason || null;
  const msg = content.message || {};
  return {
    id: d.id != null ? String(d.id) : "",
    name: String(d.name || ""),
    type: String(d.type || "transaction"),
    language: String(tr.language || d.language || "en"),
    description: String(d.description || ""),
    status,
    enabled: d.status ? d.status === "enabled" : null,
    reason: status === "rejected" && reason ? String(reason) : null,
    title: String(msg.title || ""),
    body: String(msg.body || ""),
    footer: String(msg.footer || ""),
    placeholders: (Array.isArray(content.place_holders) ? content.place_holders : []).filter((p) => p?.name).map((p) => ({ name: String(p.name), sample: String(p.sample_value ?? p.sample ?? "") })),
    modifiedAt: toMillis(content.modified_time ?? content.updated_time ?? d.modified_time ?? d.modified_at ?? d.updated_time ?? d.updated_at ?? d.last_modified_time ?? d.created_time ?? d.created_at),
  };
}

/** The event key whose recorded template ID is `id`, or null. `doc` is configs/staff_messages. */
function staffEventOf(doc, id) {
  if (!id) return null;
  return Object.keys(doc || {}).find((k) => doc[k]?.arattai?.templateId === id) || null;
}

/** Run `fn` over `items` with at most `n` at a time, keeping the order. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// ---------------------------------------------------------------- Arattai calls

async function fetchLiveRows(config) {
  const summaries = [];
  for (let index = 0; ; index += 100) {
    const page = await live.call(config, "GET", `/api/v1/businesses/${encodeURIComponent(config.businessId)}/messagetemplates`, { query: { limit: 100, index } });
    const rows = Array.isArray(page.data) ? page.data : [];
    summaries.push(...rows);
    if (rows.length < 100) break;
  }
  return mapLimit(summaries, 5, async (s) => {
    try {
      return parseRow(await live.call(config, "GET", `/api/v1/messagetemplates/${encodeURIComponent(s.id)}`));
    } catch (err) {
      logger.warn("Templates: couldn't read one template", { id: s.id, error: err.message });
      return parseRow(s);
    }
  });
}

async function fetchSandboxRows() {
  const snap = await sandboxCol().get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

const listArattaiTemplates = onCall(async (request) => {
  await requireAdmin(request.auth);
  const { config, mode } = await context();
  const [snap] = await Promise.all([messagesRef().get()]);
  const doc = snap.exists ? snap.data() : {};
  let rows;
  if (mode === "live") {
    liveReady(config);
    try {
      rows = await fetchLiveRows(config);
    } catch (err) {
      throw live.asHttps(err);
    }
  } else {
    rows = await fetchSandboxRows();
  }
  const templates = rows
    .map((r) => ({ ...r, staffEvent: staffEventOf(doc, r.id) }))
    .sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0) || a.name.localeCompare(b.name));
  return { mode, templates };
});

/** The template's current status at Arattai, "draft" when it can't be read. */
async function currentStatus(config, id) {
  try {
    return parseRow(await live.call(config, "GET", `/api/v1/messagetemplates/${encodeURIComponent(id)}`)).status;
  } catch {
    return "draft";
  }
}

const saveArattaiTemplate = onCall(async (request) => {
  await requireAdmin(request.auth);
  const r = await rules();
  const data = request.data || {};
  const id = data.id ? String(data.id) : "";
  const t = {
    name: data.name, type: data.type, language: data.language, description: data.description,
    title: data.title, body: data.body, footer: data.footer,
    placeholders: Array.isArray(data.placeholders) ? data.placeholders : [],
  };
  const problems = r.templateProblems(t);
  if (problems.length) throw new HttpsError("invalid-argument", problems[0]);
  const submit = data.submit === true;
  const payload = r.buildPayload(t);
  const { config, mode } = await context();

  if (id) {
    const snap = await messagesRef().get();
    if (staffEventOf(snap.exists ? snap.data() : {}, id)) throw new HttpsError("failed-precondition", "This is a staff notification template. Edit it from Settings → Staff Notifications.");
  }

  if (mode !== "live") {
    const row = { ...payload.message, name: payload.name, type: payload.type, language: payload.language, description: payload.description, modifiedAt: Date.now() };
    const stored = {
      name: row.name, type: row.type, language: row.language, description: row.description,
      title: row.title || "", body: row.body, footer: row.footer || "",
      placeholders: payload.place_holders.map((p) => ({ name: p.name, sample: p.sample_value })),
      status: submit ? "approved" : "draft", enabled: true, reason: null, modifiedAt: row.modifiedAt,
    };
    const ref = id ? sandboxCol().doc(id) : sandboxCol().doc();
    await ref.set(stored);
    return { id: ref.id, status: stored.status };
  }

  liveReady(config);
  let newId = id;
  if (id) {
    // Arattai refuses edits while a template is under review, but allows deleting it and
    // creating a new one with the same name: replace it, which restarts the review.
    if ((await currentStatus(config, id)) === "under_review") {
      await live.deleteTemplate(config, id);
      newId = "";
    }
  }
  try {
    if (newId) await live.updateTemplate(config, newId, payload);
    else newId = (await live.createTemplate(config, payload)).id;
  } catch (err) {
    if (id && !newId) throw new HttpsError(err.code || "failed-precondition", `The old template was removed, but the new one couldn't be created: ${err.message}`);
    throw err;
  }
  if (!newId) throw new HttpsError("internal", "Arattai didn't return a template ID.");
  let status;
  if (submit) {
    await live.submitTemplate(config, newId, payload.language);
    status = "under_review";
  } else {
    status = await currentStatus(config, newId);
  }
  return { id: newId, status };
});

const deleteArattaiTemplate = onCall(async (request) => {
  await requireAdmin(request.auth);
  const id = String(request.data?.id || "");
  if (!id) throw new HttpsError("invalid-argument", "Which template?");
  const { config, mode } = await context();
  if (mode === "live") {
    liveReady(config);
    await live.deleteTemplate(config, id);
  } else {
    await sandboxCol().doc(id).delete();
  }
  const snap = await messagesRef().get();
  const key = staffEventOf(snap.exists ? snap.data() : {}, id);
  if (key) await messagesRef().set({ [key]: { arattai: FieldValue.delete() } }, { merge: true });
  return { ok: true };
});

module.exports = { listArattaiTemplates, saveArattaiTemplate, deleteArattaiTemplate, parseRow, staffEventOf, toMillis };
