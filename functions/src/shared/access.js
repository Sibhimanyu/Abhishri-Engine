const admin = require("firebase-admin");

/**
 * Permission checks for callables, resolved exactly as firestore.rules' getPerm does,
 * because the Admin SDK bypasses those rules and each callable must re-apply them:
 *   admin (isAdmin or role 'admin')  -> everything
 *   otherwise any of: a direct grant on the allowed_users document, the role's
 *   permission_groups document, or (when that group document doesn't exist) the
 *   built-in defaults for the role.
 * The user document is allowed_users/{uid}, falling back to allowed_users/{email}.
 */
const FALLBACK = (role) => ({
  staff_directory: { view: role !== "teacher", manage: role === "pro", delete: false },
  student_directory: { view: true, manage: role === "pro", delete: false },
  attendance: { view: true, mark: role === "teacher" || role === "pro", edit: role === "pro" },
  fees_accounting: {
    view: false, view_dashboard: false, config: false, ledger: false, trans_add: false, trans_delete: false,
    exp_own: role !== "teacher", exp_all: false, wallet_view_own: role !== "teacher", wallet_edit_own: false,
  },
  whatsapp_sender: { access: false, broadcast: false, manage: false },
  smart_campus: { view: role === "pro", control: role === "pro", scenes: false, config: false },
});

/**
 * The caller's email, lowercased, or "" unless the account has proven it owns the inbox.
 * Anyone can create an unverified email/password account for any address through the
 * public API, so an unverified email must never unlock the allowed_users record keyed by
 * it (same rule as authEmail() in firestore.rules). Google accounts are always verified;
 * password accounts become verified by setting their password from the emailed link.
 */
function verifiedEmail(auth) {
  const email = auth?.token?.email;
  if (isPhoneSession(auth)) return "";
  return email && auth.token.email_verified === true ? String(email).toLowerCase() : "";
}

/** Phone sign-in is for parents only; a phone session never counts as staff. */
function isPhoneSession(auth) {
  return auth?.token?.firebase?.sign_in_provider === "phone";
}

async function loadUser(auth) {
  if (isPhoneSession(auth)) return null;
  const db = admin.firestore();
  const byUid = await db.collection("allowed_users").doc(auth.uid).get();
  if (byUid.exists) return byUid.data();
  const email = verifiedEmail(auth);
  if (!email) return null;
  const byEmail = await db.collection("allowed_users").doc(email).get();
  return byEmail.exists ? byEmail.data() : null;
}

/** { isAdmin, can(module, action) } for the caller, or null if they have no staff record. */
async function resolveAccess(auth) {
  if (!auth) return null;
  const user = await loadUser(auth);
  if (!user) return null;
  const role = user.role || "staff";
  const isAdmin = user.isAdmin === true || role === "admin";
  const group = await admin.firestore().collection("permission_groups").doc(role).get();
  const groupPerms = group.exists ? (group.data().permissions || {}) : null;
  const can = (module, action) => {
    if (isAdmin) return true;
    if (user.permissions?.[module]?.[action] === true) return true;
    const source = groupPerms || FALLBACK(role);
    return source?.[module]?.[action] === true;
  };
  return { isAdmin, role, email: verifiedEmail(auth) || null, can };
}

module.exports = { resolveAccess, verifiedEmail };
