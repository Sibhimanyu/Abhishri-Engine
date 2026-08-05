const functions = require('firebase-functions/v1');
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

async function mirrorUser(db, docId, userData) {
  if (!userData) {
    await admin.database().ref(`rtdb_permissions/${docId}`).remove();
    return;
  }
  const mirrored = await resolvePermissions(db, userData);
  await admin.database().ref(`rtdb_permissions/${docId}`).set(mirrored);
}

exports.resolvePermissions = resolvePermissions;
exports.mirrorUser = mirrorUser;

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
