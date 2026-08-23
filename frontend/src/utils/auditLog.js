import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';

/**
 * Write an audit_logs entry. Best-effort and non-blocking: a failure here must never
 * break the user's actual action (the write they came here to do), so errors are
 * swallowed after a console warning rather than thrown.
 *
 * `performedBy` must be the caller's own email — firestore.rules requires
 * `performedBy` to match request.auth.token.email on create, so pass the current
 * user's email here, not a target user's email or anything else.
 */
export async function logAudit({ action, module, targetId, targetName, performedBy, details }) {
  if (!action || !performedBy) {
    console.warn('logAudit called without required action/performedBy — skipping', { action, module, performedBy });
    return;
  }
  try {
    await addDoc(collection(firestore, 'audit_logs'), {
      action,
      module: module || null,
      targetId: targetId || null,
      targetName: targetName || null,
      performedBy: performedBy.toLowerCase(),
      timestamp: serverTimestamp(),
      details: details || {}
    });
  } catch (err) {
    console.warn('Failed to write audit log entry (action continued regardless):', action, err);
  }
}
