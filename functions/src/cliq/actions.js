// Approve / Send back from Zoho Cliq.
//
// A request's buttons run the school's Cliq functions (docs/cliq-bot.md), which POST here:
//   header  X-Abhishri-Secret: <configs/cliq.actionSecret>
//   body    { key, email, note? }   key = "<a|s>|<collection>|<docId>|<requestedAt ms>"
// The secret proves the call came from those functions, and Cliq supplies the clicking
// user's email. That email must belong to an admin in the app (allowed_users), directly or
// through configs/cliq.userMap. The decision is written exactly like the app's own
// reviewDocument, so the Firestore triggers then DM the teacher and note it in the channel.
//
// Always answers 200 with { status: "success" | "failure", text }, which the Cliq function
// shows to the person who clicked.
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { loadCliqConfig, appEmailFor, displayNameOf } = require("./client");

const messages = () => import("../shared/cliqMessages.mjs");

const AUDIT_PREFIX = { weekly_menus: "WEEKLY_MENU", daily_reports: "DAILY_REPORT" };

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Deluge may send the JSON as text/plain, so fall back to parsing the raw body.
function bodyOf(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) && Object.keys(req.body).length) return req.body;
  try {
    return JSON.parse(req.rawBody ? req.rawBody.toString("utf8") : String(req.body || ""));
  } catch {
    return {};
  }
}

async function isAdminEmail(email) {
  if (!email) return false;
  const snap = await admin.firestore().collection("allowed_users").doc(email).get();
  const u = snap.exists ? snap.data() : null;
  return !!(u && (u.isAdmin === true || u.role === "admin"));
}

exports.cliqAction = onRequest(async (req, res) => {
  const reply = (status, text) => res.status(200).json({ status, text });
  if (req.method !== "POST") return res.status(405).send("POST only");

  const cfg = await loadCliqConfig();
  if (!cfg.actionSecret || !sameSecret(req.get("x-abhishri-secret"), cfg.actionSecret)) {
    logger.warn("cliqAction: rejected a call without the right secret");
    return res.status(403).json({ status: "failure", text: "Not allowed." });
  }

  const { parseActionKey, decisionProblem, KINDS } = await messages();
  const body = bodyOf(req);
  const parsed = parseActionKey(body.key);
  if (!parsed) return reply("failure", "This button isn't recognised. Open the app to review it.");

  const email = appEmailFor(cfg, body.email);
  const note = String(body.note || "").trim().slice(0, 1000);
  const reviewer = { isAdmin: await isAdminEmail(email) };
  const ref = admin.firestore().collection(parsed.collection).doc(parsed.id);
  const approve = parsed.action === "approve";
  const reviewerName = await displayNameOf(email);

  let problem = null;
  let data = null;
  try {
    await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      data = snap.exists ? snap.data() : null;
      problem = decisionProblem({ exists: snap.exists, approval: data?.approval, parsed, reviewer, note });
      if (problem) return;
      tx.update(ref, {
        "approval.status": approve ? "approved" : "changes_requested",
        "approval.reviewedBy": email,
        "approval.reviewedByName": reviewerName,
        "approval.reviewedAt": FieldValue.serverTimestamp(),
        "approval.note": approve ? "" : note,
      });
    });
  } catch (err) {
    logger.error("cliqAction: failed to record the decision", err);
    return reply("failure", "Something went wrong saving that. Please try again from the app.");
  }
  if (problem) {
    logger.info(`cliqAction: ${parsed.action} ${parsed.collection}/${parsed.id} by ${email} refused: ${problem}`);
    return reply("failure", problem);
  }

  const kind = KINDS[parsed.collection];
  const targetName = kind.title(parsed.id, data).replace(/^[^:]+:\s*/, "");
  await admin.firestore().collection("audit_logs").add({
    action: `${AUDIT_PREFIX[parsed.collection]}_${approve ? "APPROVED" : "SENT_BACK"}`,
    module: "school_calendar",
    targetId: parsed.id,
    targetName,
    performedBy: email,
    timestamp: FieldValue.serverTimestamp(),
    details: approve ? { via: "cliq" } : { note, via: "cliq" },
  }).catch((err) => logger.warn("cliqAction: audit log failed", err.message));

  const requester = await displayNameOf(data?.approval?.requestedBy);
  logger.info(`cliqAction: ${parsed.action} ${parsed.collection}/${parsed.id} by ${email}`);
  return reply("success", approve
    ? `Approved. ${requester} can export the ${kind.noun} now.`
    : `Sent back to ${requester} with your note.`);
});
