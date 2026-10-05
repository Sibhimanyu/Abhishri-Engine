// Admin approval for the weekly menu and the daily report, shared by both editors.
//
// Anyone on staff can write a menu or a report, but only an admin's approval lets a
// non-admin export it as an image to send to parents. The document carries
// approval: { status, requestedBy, requestedAt, reviewedBy, reviewedByName, reviewedAt, note }, and
// firestore.rules stops a non-admin writing any status other than draft or pending,
// so nobody can approve their own work. An admin's own save counts as approved.
//
// Export is judged against the SAVED document: a non-admin can export only when the
// editor holds exactly what was approved. Editing after approval and saving drops the
// status back to draft, so the changed version goes through approval again.
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../../firebase';
import { logAudit } from '../../utils/auditLog';
import { outcomeEntries } from '../../../../functions/src/shared/notifications.mjs';
import { KINDS } from '../../../../functions/src/shared/cliqMessages.mjs';

export const DRAFT = 'draft';
export const PENDING = 'pending';
export const APPROVED = 'approved';
export const RETURNED = 'changes_requested';

export const isAdminUser = (userData) => !!(userData?.isAdmin || userData?.role === 'admin');

/** Documents saved before approval existed have no status: they count as drafts. */
export const statusOf = (savedDoc) => savedDoc?.approval?.status || DRAFT;

/**
 * The approval to write with a save. Merged into the document (setDoc merge), so the
 * previous reviewer and note stay on record until the next review replaces them.
 */
export function approvalForSave({ isAdmin, email, submit, reviewerName }) {
  // An admin saving a teacher's pending request approves it: the teacher's bell names them.
  if (isAdmin) return { status: APPROVED, reviewedBy: email || 'unknown', reviewedByName: reviewerName || email || 'An admin', reviewedAt: serverTimestamp(), note: '' };
  if (submit) return { status: PENDING, requestedBy: email || 'unknown', requestedAt: serverTimestamp(), note: '' };
  return { status: DRAFT };
}

/** Live count of items waiting for an admin in one collection (0 for non-admins). */
function usePendingCount(collectionName, enabled) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(firestore, collectionName), where('approval.status', '==', PENDING));
    return onSnapshot(q, snap => setCount(snap.size), err => console.warn(`Failed to count pending ${collectionName}:`, err));
  }, [collectionName, enabled]);
  return enabled ? count : 0;
}

export function usePendingApprovals(enabled) {
  const menus = usePendingCount('weekly_menus', enabled);
  const reports = usePendingCount('daily_reports', enabled);
  return { menus, reports, total: menus + reports };
}

/**
 * The signed-in person's own requests that were approved recently or sent back, for the
 * bell: the same outcomes Cliq DMs them (see functions/src/shared/notifications.mjs).
 */
export function useMyApprovalOutcomes(email) {
  const [byCollection, setByCollection] = useState({});
  // When the data last changed; an approval drops off APPROVED_SHOWS_FOR_MS after its review.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!email) return;
    const unsubs = Object.keys(KINDS).map(collectionName => onSnapshot(
      query(collection(firestore, collectionName), where('approval.requestedBy', '==', email)),
      snap => {
        setNow(Date.now());
        setByCollection(prev => ({
        ...prev,
        [collectionName]: snap.docs.map(d => {
          const data = d.data();
          return {
            collection: collectionName,
            id: d.id,
            noun: KINDS[collectionName].noun,
            label: KINDS[collectionName].title(d.id, data).replace(/^[^:]+:\s*/, ''),
            approval: { ...data.approval, reviewedAtMs: data.approval?.reviewedAt?.toMillis?.() || 0 },
          };
        }),
        }));
      },
      err => console.warn(`Failed to load your ${collectionName} approvals:`, err),
    ));
    return () => unsubs.forEach(u => u());
  }, [email]);
  return email ? outcomeEntries(Object.values(byCollection).flat(), now) : [];
}

/** Admin review of a saved document: approve it, or send it back with a note. */
export async function reviewDocument({ collectionName, id, approve, note, email, reviewerName, auditPrefix, targetName }) {
  await updateDoc(doc(firestore, collectionName, id), {
    'approval.status': approve ? APPROVED : RETURNED,
    'approval.reviewedBy': email || 'unknown',
    // Stored so the teacher's bell can say who decided; teachers can't read other users' records.
    'approval.reviewedByName': reviewerName || email || 'An admin',
    'approval.reviewedAt': serverTimestamp(),
    'approval.note': approve ? '' : note,
  });
  logAudit({
    action: `${auditPrefix}_${approve ? 'APPROVED' : 'SENT_BACK'}`,
    module: 'school_calendar',
    targetId: id,
    targetName,
    performedBy: email,
    details: approve ? {} : { note },
  });
}
