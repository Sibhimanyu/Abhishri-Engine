const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step one of "Set or reset password" on the staff sign-in page, for staff whose email
 * isn't a Google account (e.g. @abhishriacademy.in on Zoho Mail).
 *
 * Being added under User Permissions creates no sign-in account, so there is no password
 * to reset and Firebase's reset email silently goes nowhere. For an address on the access
 * list with no account yet, this creates one with no password; the page then asks
 * Firebase to send its reset email, and following that link sets the password and marks
 * the email verified, which is what unlocks the record (authEmail() in firestore.rules).
 *
 * Needs no sign-in, and always answers the same way, so it can't be used to learn which
 * addresses have access. It only ever creates an account for an address an admin already
 * added, and the link goes to that inbox, so only its owner can finish.
 */
exports.prepareStaffPasswordSetup = onCall(async (request) => {
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: true };

  const record = await admin.firestore().collection("allowed_users").doc(email).get();
  if (!record.exists) return { ok: true };

  try {
    await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    await admin.auth().createUser({ email, emailVerified: false });
    logger.info("prepareStaffPasswordSetup: created sign-in account", { email });
  }
  return { ok: true };
});
