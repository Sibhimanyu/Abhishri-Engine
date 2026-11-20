// The wording of staff notifications: shared/staffMessages.mjs holds the defaults, and an
// admin's edits live in configs/staff_messages ({ [eventKey]: { title, body } }, written
// from Settings > Staff Notifications). Edits are read at most once a minute.
const admin = require("firebase-admin");

const CACHE_MS = 60 * 1000;
let cache = { at: 0, overrides: null };

const messages = () => import("../shared/staffMessages.mjs");

async function loadOverrides() {
  if (cache.overrides && Date.now() - cache.at < CACHE_MS) return cache.overrides;
  let overrides = {};
  try {
    const snap = await admin.firestore().collection("configs").doc("staff_messages").get();
    if (snap.exists) overrides = snap.data();
  } catch {
    // Fall back to what we had, else the defaults: wording must never stop a send.
    if (cache.overrides) return cache.overrides;
  }
  cache = { at: Date.now(), overrides };
  return overrides;
}

/**
 * { title, text, links: [], actions: [], event, vars } for an event, ready for
 * sendArattaiNotification (which sends the event's own template and needs `event` and `vars`).
 */
async function composeStaffMessage(eventKey, vars) {
  const [{ renderStaffMessage }, overrides] = await Promise.all([messages(), loadOverrides()]);
  return { ...renderStaffMessage(eventKey, vars, overrides), links: [], actions: [], event: eventKey, vars };
}

module.exports = { composeStaffMessage };
