// Posting to Zoho Cliq as the school's bot, with a webhook token (zapikey).
//
// Settings live in configs/cliq (admin-only in firestore.rules, like configs/whatsapp_main):
//   enabled       master switch
//   domain        Cliq data centre host, e.g. "cliq.zoho.in"
//   botName       the bot's unique name, from its Cliq settings
//   channel       unique name of the admins' channel, e.g. "approvals"
//   webhookToken  a webhook token (Cliq > Bots & Tools > Webhook Tokens) of a member of that channel
//   appUrl        where message buttons point, e.g. "https://abhishri-academy.web.app"
//
// Direct messages go through the bot, so they only reach people subscribed to it.
const admin = require("firebase-admin");
const axios = require("axios");

const DEFAULT_APP_URL = "https://abhishri-academy.web.app";

async function loadCliqConfig() {
  const snap = await admin.firestore().collection("configs").doc("cliq").get();
  const cfg = snap.exists ? snap.data() : {};
  return {
    enabled: cfg.enabled === true,
    domain: String(cfg.domain || "cliq.zoho.in").replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    botName: String(cfg.botName || "").trim(),
    channel: String(cfg.channel || "").trim(),
    webhookToken: String(cfg.webhookToken || "").trim(),
    appUrl: String(cfg.appUrl || DEFAULT_APP_URL).trim(),
  };
}

/** Why this config can't send yet, or null when it can. */
function missingSetting(cfg) {
  if (!cfg.webhookToken) return "webhook token";
  if (!cfg.botName) return "bot name";
  if (!cfg.channel) return "channel";
  return null;
}

async function post(cfg, path, params, message) {
  const url = `https://${cfg.domain}/api/v2/${path}`;
  const res = await axios.post(url, message, {
    params: { ...params, zapikey: cfg.webhookToken },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status >= 300) {
    const detail = typeof res.data === "object" ? JSON.stringify(res.data) : String(res.data || "");
    throw new Error(`Cliq ${res.status} for ${path}: ${detail.slice(0, 300)}`);
  }
}

/** Post to the admins' channel as the bot. */
function postToChannel(cfg, message) {
  return post(cfg, `channelsbyname/${encodeURIComponent(cfg.channel)}/message`, { bot_unique_name: cfg.botName }, message);
}

/** Direct message from the bot to the given people (emails), if they're subscribed to it. */
function postToUsers(cfg, emails, message) {
  const userids = [...new Set(emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
  if (!userids.length) return Promise.resolve();
  return post(cfg, `bots/${encodeURIComponent(cfg.botName)}/message`, {}, { ...message, userids: userids.join(",") });
}

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

module.exports = { loadCliqConfig, missingSetting, postToChannel, postToUsers, displayNameOf };
