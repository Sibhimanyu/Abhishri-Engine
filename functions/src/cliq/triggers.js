// Zoho Cliq notifications for things waiting on someone's consent:
// - a teacher sends a weekly menu or daily report for approval -> admins' channel, with
//   Approve / Send back buttons when the Cliq functions are set up (see ./actions.js)
// - an admin approves it or sends it back, in the app or Cliq  -> DM to that teacher, and
//   a note in the channel so the other admins see it's handled
// - someone sends in-app feedback                              -> admins' channel
// What counts as an event, and the wording, is in shared/cliqMessages.mjs.
//
// Notifications are best-effort: a Cliq failure is logged, never retried or thrown,
// so it can't hold up or repeat the save that caused it.
const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { resolveAccess } = require("../shared/access");
const { loadCliqConfig, missingSetting, postToChannel, postToUsers, displayNameOf } = require("./client");

const messages = () => import("../shared/cliqMessages.mjs");

/** The config when Cliq is switched on and complete, else null (with a log line saying why). */
async function readyConfig(what) {
  const cfg = await loadCliqConfig();
  if (!cfg.enabled) return null;
  const missing = missingSetting(cfg);
  if (missing) {
    logger.warn(`Cliq: skipped ${what}, the ${missing} isn't set in configs/cliq.`);
    return null;
  }
  return cfg;
}

function approvalTrigger(collection) {
  return onDocumentWritten(`${collection}/{docId}`, async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const { approvalEvent, requestMessage, outcomeMessage, decidedMessage } = await messages();
    const kind = approvalEvent(before, after);
    if (!kind) return;

    const id = event.params.docId;
    const cfg = await readyConfig(`${kind} ${collection}/${id}`);
    if (!cfg) return;

    const { approval } = after;
    try {
      if (kind === "requested") {
        const requesterName = await displayNameOf(approval.requestedBy);
        await postToChannel(cfg, requestMessage({ collection, id, data: after, requesterName, appUrl: cfg.appUrl, cliq: cfg }));
      } else {
        const [reviewerName, requesterName] = await Promise.all([displayNameOf(approval.reviewedBy), displayNameOf(approval.requestedBy)]);
        const sends = [postToChannel(cfg, decidedMessage({ collection, id, data: after, event: kind, reviewerName, requesterName }))];
        if (approval.requestedBy !== approval.reviewedBy) {
          sends.push(postToUsers(cfg, [approval.requestedBy], outcomeMessage({ collection, id, data: after, event: kind, reviewerName, appUrl: cfg.appUrl })));
        }
        // One failing (e.g. the teacher isn't subscribed to the bot) mustn't stop the other.
        const failed = (await Promise.allSettled(sends)).filter((r) => r.status === "rejected");
        if (failed.length) throw new Error(failed.map((r) => r.reason?.message).join("; "));
      }
      logger.info(`Cliq: sent ${kind} for ${collection}/${id}`);
    } catch (err) {
      logger.error(`Cliq: failed to send ${kind} for ${collection}/${id}`, err.message);
    }
  });
}

exports.cliqOnMenuApproval = approvalTrigger("weekly_menus");
exports.cliqOnReportApproval = approvalTrigger("daily_reports");

exports.cliqOnFeedback = onDocumentCreated("feedback/{feedbackId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const cfg = await readyConfig(`feedback/${event.params.feedbackId}`);
  if (!cfg) return;
  const { feedbackMessage } = await messages();
  try {
    await postToChannel(cfg, feedbackMessage({ data, appUrl: cfg.appUrl }));
    logger.info(`Cliq: sent feedback/${event.params.feedbackId}`);
  } catch (err) {
    logger.error(`Cliq: failed to send feedback/${event.params.feedbackId}`, err.message);
  }
});

/**
 * Admin-only check from Settings > Cliq: posts a test to the channel and DMs the caller,
 * and reports each result, so a wrong token, bot or channel name shows up straight away.
 * Works while notifications are switched off, so the setup can be checked first.
 */
exports.sendCliqTest = onCall(async (request) => {
  const access = await resolveAccess(request.auth);
  if (!access?.isAdmin) throw new HttpsError("permission-denied", "Only admins can test the Cliq bot.");
  const cfg = await loadCliqConfig();
  const missing = missingSetting(cfg);
  if (missing) throw new HttpsError("failed-precondition", `Set the ${missing} first.`);

  const email = access.email;
  const name = await displayNameOf(email);
  const test = (where) => ({
    text: `Test from Abhishri Engine, sent by ${name}. If you can see this ${where}, the bot is set up.`,
    card: { title: "Cliq bot test", theme: "modern-inline" },
    buttons: [{ label: "Open app", type: "+", action: { type: "open.url", data: { web: cfg.appUrl } } }],
  });
  const attempt = async (fn) => {
    try {
      await fn();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
  return {
    channel: await attempt(() => postToChannel(cfg, test(`in #${cfg.channel}`))),
    direct: await attempt(() => postToUsers(cfg, [email], test("as a direct message"))),
    enabled: cfg.enabled,
  };
});
