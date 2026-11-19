const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { resolveAccess } = require("../shared/access");
const { getProvider, normalizePhone } = require("./provider");
const { P, safeKey, applyIncoming, simulateReceipts } = require("./store");

/**
 * Arattai callables. Unlike the WhatsApp module, each one checks the specific action it
 * needs (arattai_sender.access = live chats, .broadcast = send broadcasts, .manage =
 * lists, history, templates and settings), the same way the security rules do.
 */
async function requirePerm(auth, ...actions) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Please sign in.");
  const access = await resolveAccess(auth);
  if (!access || !actions.some((a) => access.can("arattai_sender", a))) {
    throw new HttpsError("permission-denied", "You don't have access to Arattai messaging.");
  }
  return access;
}

async function loadConfig() {
  const snap = await admin.firestore().collection("configs").doc(P.config).get();
  return snap.exists ? snap.data() : {};
}

const ANY = ["access", "broadcast", "manage"];
const validPhone = (p) => p.length >= 10 && p.length <= 15;
// A chat is keyed by phone, or by "u<userId>" for a parent whose number Arattai didn't share.
const chatKey = (v) => {
  const s = String(v || "").trim();
  return /^u\d{1,30}$/.test(s) ? s : normalizePhone(s);
};
const validChat = (k) => k.startsWith("u") || validPhone(k);

exports.checkArattaiAccount = onCall(async (request) => {
  await requirePerm(request.auth, ...ANY);
  const config = await loadConfig();
  const provider = getProvider(config);
  const account = await provider.getAccount();
  return { mode: provider.mode, ...account };
});

exports.syncArattaiTemplates = onCall(async (request) => {
  await requirePerm(request.auth, "manage");
  const provider = getProvider(await loadConfig());
  const templates = await provider.listTemplates();

  const fs = admin.firestore();
  const coll = fs.collection("configs").doc(P.config).collection("templates");
  const existing = await coll.get();
  const batch = fs.batch();
  const keep = new Set();
  for (const t of templates) {
    if (!t?.name) continue;
    const id = safeKey(t.name);
    keep.add(id);
    // Stored in the same shape as WhatsApp templates so the Broadcast screen reads both.
    const components = [{ type: "BODY", text: t.body || "" }];
    if (t.headerFormat) components.unshift({ type: "HEADER", format: t.headerFormat });
    batch.set(coll.doc(id), {
      name: t.name, template_name: t.name, category: t.category || "MARKETING", status: t.status || "APPROVED",
      components, arattai: t.arattai || null, lastSynced: FieldValue.serverTimestamp(),
    });
  }
  // Templates that no longer exist at Arattai (e.g. the sandbox ones after going live).
  existing.forEach((d) => { if (!keep.has(d.id)) batch.delete(d.ref); });
  await batch.commit();
  return { success: true, count: keep.size, mode: provider.mode };
});

exports.sendArattaiMessage = onCall(async (request) => {
  await requirePerm(request.auth, "access", "manage");
  const to = chatKey(request.data?.to);
  const text = String(request.data?.text || "").trim();
  const messageKey = request.data?.messageKey;
  if (!validChat(to)) throw new HttpsError("invalid-argument", "Enter a valid phone number.");
  if (!text || text.length > 4096) throw new HttpsError("invalid-argument", "Messages must be 1–4096 characters.");
  if (messageKey && !/^[-_A-Za-z0-9]{1,40}$/.test(messageKey)) throw new HttpsError("invalid-argument", "Bad message key.");

  const provider = getProvider(await loadConfig());
  const db = admin.database();
  const key = messageKey || db.ref().push().key;
  const msgRef = db.ref(`${P.conversations}/${to}/messages/${key}`);
  const ts = Date.now();

  let messageId;
  try {
    ({ messageId } = await provider.sendText({ to, text }));
  } catch (err) {
    await msgRef.update({ message: text, to, from: "business", direction: "outbound", type: "text", timestamp: ts, status: "failed", error: err.message });
    throw err instanceof HttpsError ? err : new HttpsError("internal", err.message);
  }

  await msgRef.update({ messageId, message: text, to, from: "business", direction: "outbound", type: "text", timestamp: ts, status: "sent" });
  await db.ref(`${P.conversations}/${to}/metadata`).update({ lastMessage: text, timestamp: ts, phoneNumber: to });
  await db.ref(`${P.map}/${safeKey(messageId)}`).set({ phone: to, messageKey: key });
  if (provider.simulatesReceipts) await simulateReceipts([{ messageId, phone: to }]);
  return { messageId, mode: provider.mode };
});

const BATCH_SIZE = 100;
const MAX_RECIPIENTS = 5000;

exports.sendArattaiBroadcast = onCall({ timeoutSeconds: 540 }, async (request) => {
  await requirePerm(request.auth, "broadcast");
  const { templateName, variables, broadcastId, excludedNumbers } = request.data || {};
  const recipients = (Array.isArray(request.data?.recipients) ? request.data.recipients : [])
    .map((r) => ({ phone: normalizePhone(r?.phone), name: String(r?.name || "").slice(0, 100) }))
    .filter((r) => validPhone(r.phone));
  if (!broadcastId || typeof broadcastId !== "string") throw new HttpsError("invalid-argument", "Missing broadcastId.");
  if (!templateName) throw new HttpsError("invalid-argument", "Pick a template.");
  if (recipients.length === 0) throw new HttpsError("invalid-argument", "No valid recipients.");
  if (recipients.length > MAX_RECIPIENTS) throw new HttpsError("invalid-argument", `At most ${MAX_RECIPIENTS} recipients per broadcast.`);

  const fs = admin.firestore(), db = admin.database();
  const historyRef = fs.collection(P.history).doc(broadcastId);

  // Claim the broadcast so a retried or double-clicked call can't send it twice.
  const claimed = await fs.runTransaction(async (tx) => {
    const snap = await tx.get(historyRef);
    if (!snap.exists || snap.data().dispatchStarted) return false;
    tx.update(historyRef, { dispatchStarted: true, dispatchStartedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) throw new HttpsError("already-exists", "This broadcast has already been sent or is sending now.");

  const tSnap = await fs.collection("configs").doc(P.config).collection("templates").doc(safeKey(templateName)).get();
  if (!tSnap.exists) {
    await historyRef.update({ status: "failed", error: "Template not found" });
    throw new HttpsError("failed-precondition", `Template "${templateName}" not found. Sync templates in Settings → Arattai Config.`);
  }
  const template = tSnap.data();
  const provider = getProvider(await loadConfig());
  const vars = (Array.isArray(variables) ? variables : []).map((v) => String(v ?? ""));

  // Rendered once for the conversation view, so the chat shows what parents actually got.
  const body = template.components?.find((c) => c.type === "BODY")?.text || "";
  const rendered = body.replace(/\{\{(\d+)\}\}/g, (m, n) => vars[Number(n) - 1] ?? m);

  // Unique by number; the client dedupes too, but the server is what spends messages.
  const unique = [...new Map(recipients.map((r) => [r.phone, r])).values()];
  const ts = Date.now();
  const initial = {};
  unique.forEach((r) => {
    initial[`${broadcastId}/${r.phone}`] = { broadcastId, recipientId: r.phone, name: r.name || r.phone, status: "queued", timestamp: ts };
  });
  await db.ref(P.logs).update(initial);
  await historyRef.update({
    provider: provider.mode, recipientsCount: unique.length, queuedCount: unique.length,
    excludedCount: Array.isArray(excludedNumbers) ? excludedNumbers.length : 0,
  });

  let dispatched = 0;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    if ((await historyRef.get()).data()?.stopRequested) {
      await historyRef.update({ status: "stopped", currentContactName: "" });
      return { success: true, stopped: true, dispatchedCount: dispatched };
    }
    await historyRef.update({ currentContactName: chunk[0].name || chunk[0].phone });

    let results;
    try {
      results = await provider.sendTemplate({ template, recipients: chunk, variables: vars });
    } catch (err) {
      logger.error("Arattai broadcast batch failed", { broadcastId, batch: i / BATCH_SIZE, error: err.message });
      results = chunk.map((r) => ({ phone: r.phone, error: err.message }));
    }

    const now = Date.now();
    const updates = {};
    const sent = [];
    let ok = 0, failed = 0;
    results.forEach((res, idx) => {
      const r = chunk.find((c) => c.phone === normalizePhone(res.phone)) || chunk[idx];
      const log = `${P.logs}/${broadcastId}/${r.phone}`;
      if (res.messageId) {
        const key = `${safeKey(res.messageId)}`;
        updates[`${log}/status`] = "sent";
        updates[`${log}/sentAt`] = now;
        updates[`${log}/messageId`] = res.messageId;
        updates[`${P.conversations}/${r.phone}/messages/${key}`] = {
          messageId: res.messageId, from: "business", to: r.phone, message: rendered, type: "template",
          timestamp: now, direction: "outbound", status: "sent", broadcastId,
        };
        updates[`${P.conversations}/${r.phone}/metadata/lastMessage`] = `📢 ${rendered}`.slice(0, 200);
        updates[`${P.conversations}/${r.phone}/metadata/timestamp`] = now;
        updates[`${P.conversations}/${r.phone}/metadata/phoneNumber`] = r.phone;
        updates[`${P.conversations}/${r.phone}/metadata/displayName`] = r.name || r.phone;
        updates[`${P.map}/${key}`] = { phone: r.phone, messageKey: key, broadcastId };
        sent.push({ messageId: res.messageId, phone: r.phone });
        ok++;
      } else {
        updates[`${log}/status`] = "failed";
        updates[`${log}/timestamp`] = now;
        updates[`${log}/error`] = res.error || "Unknown error";
        failed++;
      }
    });
    await db.ref().update(updates);
    dispatched += ok;
    const inc = FieldValue.increment;
    await historyRef.update({
      dispatchedCount: dispatched, sentCount: inc(ok), failedCount: inc(failed),
      queuedCount: inc(-chunk.length), processedNumbersCount: inc(chunk.length), processedContactsCount: inc(chunk.length),
    });
    if (provider.simulatesReceipts) await simulateReceipts(sent);
  }

  await historyRef.update({ status: "dispatched", currentContactName: "" });
  return { success: true, dispatchedCount: dispatched, mode: provider.mode };
});

/**
 * Sandbox only: make a parent "send" the school a message, to try the live chat inbox
 * and the unread badge without a real Arattai account.
 */
exports.simulateArattaiInbound = onCall(async (request) => {
  await requirePerm(request.auth, "manage");
  const provider = getProvider(await loadConfig());
  if (provider.mode !== "sandbox") throw new HttpsError("failed-precondition", "Only available in Sandbox mode.");
  const from = normalizePhone(request.data?.from);
  const text = String(request.data?.text || "").trim().slice(0, 4096);
  if (!validPhone(from) || !text) throw new HttpsError("invalid-argument", "Enter a phone number and a message.");
  await applyIncoming({
    messageId: `sbx_in_${Date.now()}`, from, name: request.data?.name ? String(request.data.name).slice(0, 100) : null,
    type: "text", text, timestamp: Date.now(),
  });
  return { success: true };
});
