const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

/**
 * Phone sign-in is for parents only; staff sign in with their email. A texted code is only
 * as safe as the SIM (SIM swaps, recycled numbers), and staff accounts reach student
 * records, fees and accounting. The rules and callables already ignore phone sessions for
 * staff access; this also removes any phone number linked to a staff account whenever
 * that person's record changes, so there is nothing left to sign in with.
 * Accounts without an email are parents and are never touched.
 */
async function enforcePhoneSignIn(uid) {
  if (!uid) return 'skipped';
  let user;
  try {
    user = await admin.auth().getUser(uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return 'skipped';
    throw err;
  }
  if (!user.phoneNumber || !user.email) return 'no-phone';

  await admin.auth().updateUser(uid, { phoneNumber: null });
  logger.info('Removed phone sign-in from a staff account', { uid, email: user.email });
  return 'removed';
}

exports.enforcePhoneSignIn = enforcePhoneSignIn;
