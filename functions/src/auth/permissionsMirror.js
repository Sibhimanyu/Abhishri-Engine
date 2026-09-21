const functions = require('firebase-functions/v1');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

// Mirrors the module/action set and fallback logic defined in firestore.rules' getPerm().
const MODULE_ACTIONS = {
  staff_directory: ['view', 'manage', 'delete'],
  student_directory: ['view', 'manage', 'delete'],
  attendance: ['view', 'mark', 'edit'],
  fees_accounting: ['view', 'view_dashboard', 'config', 'ledger', 'trans_add', 'trans_delete', 'exp_own', 'exp_all', 'wallet_view_own', 'wallet_edit_own'],
  whatsapp_sender: ['access', 'broadcast', 'manage'],
  smart_campus: ['view', 'control', 'scenes', 'config']
};

function fallbackPerms(role) {
  const isPro = role === 'pro';
  const isTeach = role === 'teacher';
  return {
    staff_directory: { view: true, manage: isPro, delete: false },
    student_directory: { view: true, manage: isPro, delete: false },
    attendance: { view: true, mark: isTeach || isPro, edit: isPro },
    fees_accounting: { view: false, view_dashboard: false, config: false, ledger: false, trans_add: false, trans_delete: false, exp_own: true, exp_all: false, wallet_view_own: true, wallet_edit_own: false },
    whatsapp_sender: { access: false, broadcast: false, manage: false },
    smart_campus: { view: isPro, control: isPro, scenes: false, config: false }
  };
}

async function resolvePermissions(db, userData) {
  const isAdmin = userData.isAdmin === true;
  const role = userData.role || 'staff';
  const direct = userData.permissions || {};
  const groupSnap = await db.collection('permission_groups').doc(role).get();
  const groupPerms = groupSnap.exists ? (groupSnap.data().permissions || {}) : null;
  const fallback = fallbackPerms(role);

  const resolved = {};
  for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
    resolved[module] = {};
    for (const action of actions) {
      const directVal = !!(direct[module] && direct[module][action] === true);
      const groupOrFallbackVal = groupPerms
        ? !!(groupPerms[module] && groupPerms[module][action] === true)
        : fallback[module][action] === true;
      resolved[module][action] = isAdmin || directVal || groupOrFallbackVal;
    }
  }
  return { isAdmin, role, permissions: resolved };
}

/**
 * Resolve an allowed_users document to the Firebase Auth UID the security rules key on.
 *
 * The rules read rtdb_permissions/{auth.uid}, but allowed_users documents in this project
 * are keyed by EMAIL. Writing rtdb_permissions/{docId} was wrong twice over: the key
 * would never match auth.uid, and an email contains a '.', which is not a legal RTDB key
 * character — so the write threw and rtdb_permissions stayed empty, denying every
 * modules/smart_campus read.
 *
 * onUserCreated migrates email-keyed docs to uid-keyed ones, so a docId with no '@' is
 * already a uid and is used directly.
 */
async function resolveUid(docId, userData) {
  if (docId && !docId.includes('@')) return docId;
  const email = String(userData?.email || docId || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  try {
    const user = await admin.auth().getUserByEmail(email);
    return user.uid;
  } catch (err) {
    // No Auth account yet: the person has been granted access but never signed in.
    // Nothing to mirror, and it will resolve itself on their first login.
    logger.warn('permissionsMirror: no auth user for', { email, code: err.code });
    return null;
  }
}

async function mirrorUser(db, docId, userData) {
  const uid = await resolveUid(docId, userData);
  if (!uid) return { uid: null, action: 'skipped' };

  if (!userData) {
    await admin.database().ref(`rtdb_permissions/${uid}`).remove();
    return { uid, action: 'removed' };
  }
  const mirrored = await resolvePermissions(db, userData);
  await admin.database().ref(`rtdb_permissions/${uid}`).set({
    ...mirrored,
    sourceDocId: docId,
    mirroredAt: new Date().toISOString(),
  });
  return { uid, action: 'mirrored' };
}

/**
 * Mirror every allowed_users document.
 *
 * The write triggers below only fire when a document changes, and no allowed_users
 * document had been written since before the mirror existed — so nothing was ever
 * mirrored and Smart Campus was locked out for everyone. A trigger with no backfill is
 * only half a sync; this is the other half.
 */
async function mirrorAllUsers(db) {
  const snap = await db.collection('allowed_users').get();
  const results = await Promise.all(snap.docs.map((d) => mirrorUser(db, d.id, d.data())));
  return {
    total: snap.size,
    mirrored: results.filter((r) => r.action === 'mirrored').length,
    skipped: results.filter((r) => r.action === 'skipped').length,
  };
}

exports.resolvePermissions = resolvePermissions;
exports.mirrorUser = mirrorUser;
exports.mirrorAllUsers = mirrorAllUsers;

/**
 * Nightly safety net. Same reasoning as dailyWalletReconciliation: a sync that only runs
 * on write silently rots the moment its backfill is missed, and the failure is invisible
 * until someone notices a screen is empty.
 */
exports.dailyPermissionsMirror = onSchedule(
  { schedule: 'every day 00:40', timeZone: 'Asia/Kolkata' },
  async () => {
    const stats = await mirrorAllUsers(admin.firestore());
    logger.info('dailyPermissionsMirror', stats);
  }
);

// Keeps rtdb_permissions/{docId} in sync whenever a staff/admin record changes.
exports.onAllowedUserWrite = functions.region('us-central1').firestore
  .document('allowed_users/{docId}')
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const docId = context.params.docId;
    await mirrorUser(db, docId, change.after.exists ? change.after.data() : null);
  });

// A role's permission_groups doc changing affects every user with that role.
exports.onPermissionGroupWrite = functions.region('us-central1').firestore
  .document('permission_groups/{role}')
  .onWrite(async (change, context) => {
    const db = admin.firestore();
    const role = context.params.role;
    const usersSnap = await db.collection('allowed_users').where('role', '==', role).get();
    await Promise.all(usersSnap.docs.map((d) => mirrorUser(db, d.id, d.data())));
  });
