// Arattai's file links (files.arattai.in, content.download_url) stop working shortly after the
// webhook arrives, so incoming photos, documents and voice notes are copied into Firebase
// Storage straight away and the chat shows our copy. Best effort: if the copy fails, the
// message keeps Arattai's link (which may already be dead) rather than being dropped.
const admin = require("firebase-admin");
const crypto = require("crypto");
const logger = require("firebase-functions/logger");

const MAX_BYTES = 25 * 1024 * 1024;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/aac": "aac", "audio/mp4": "m4a", "application/pdf": "pdf" };

const safe = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "x";

async function download(url, headers) {
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error(`too large (${len} bytes)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`too large (${buf.length} bytes)`);
  return { buf, type: res.headers.get("content-type") || "" };
}

/**
 * Copy msg.mediaUrl into Storage and point the message at the copy. `authHeaders` is a
 * function returning Arattai API headers, tried if the plain download is refused.
 */
async function mirrorMedia(msg, { conversationId, authHeaders } = {}) {
  if (!msg?.mediaUrl || !/^https:\/\//i.test(msg.mediaUrl)) return msg;
  let got;
  try {
    got = await download(msg.mediaUrl, {});
  } catch (first) {
    try {
      got = await download(msg.mediaUrl, authHeaders ? await authHeaders() : {});
    } catch (err) {
      logger.warn("Arattai media: couldn't copy the file", { first: first.message, second: err.message });
      return msg;
    }
  }
  const type = (msg.mimeType || got.type || "application/octet-stream").split(";")[0].trim();
  const ext = EXT[type] || (msg.fileName && /\.([A-Za-z0-9]{1,5})$/.exec(msg.fileName)?.[1]?.toLowerCase()) || "bin";
  const path = `arattai_media/${safe(conversationId)}/${safe(msg.messageId)}.${ext}`;
  const token = crypto.randomUUID();
  const bucket = admin.storage().bucket();
  await bucket.file(path).save(got.buf, {
    resumable: false,
    metadata: { contentType: type, metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  return { ...msg, mediaUrl: url, mimeType: msg.mimeType || type, originalMediaUrl: msg.mediaUrl, size: msg.size || got.buf.length };
}

module.exports = { mirrorMedia };
