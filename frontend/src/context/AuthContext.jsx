import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../firebase';
import { writeSessionHint } from '../utils/sessionHint';
import { identifyForHeresay } from '../utils/heresay';
import { getDoc as readDoc } from '../utils/firestoreRead';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

const LOOKUP_GIVE_UP_MS = 15000;

function defaultPermissions(role) {
  const isTeach = role === 'teacher';
  const isPro = role === 'pro';
  return {
    staff_directory: { view: !isTeach, manage: isPro, delete: false },
    student_directory: { view: true, manage: isPro, delete: false },
    attendance: { view: true, mark: isTeach || isPro, edit: isPro },
    fees_accounting: {
      view: false, view_dashboard: false, config: false,
      ledger: false, trans_add: false, trans_delete: false,
      exp_own: !isTeach, exp_all: false, wallet_view_own: !isTeach, wallet_edit_own: false
    },
    whatsapp_sender: { access: false, broadcast: false, manage: false },
    smart_campus: { view: isPro, control: isPro, scenes: false, config: false }
  };
}

// Admin sign-ins create any missing default permission groups. Background, in parallel:
// awaiting three server reads here held every admin on the splash screen for seconds on
// each load. Reads the server (not readDoc's cache fallback) so a stale cache can't
// overwrite a group.
function seedPermissionGroups() {
  Promise.all(['teacher', 'pro', 'staff'].map(async (r) => {
    const rRef = doc(firestore, 'permission_groups', r);
    const rSnap = await getDoc(rRef);
    if (!rSnap.exists()) {
      await setDoc(rRef, { role: r, description: `Default ${r} permissions`, permissions: defaultPermissions(r) });
    }
  })).catch(err => console.warn('Failed to seed permission groups', err));
}

async function resolvePermissions(data) {
  const role = data.role || 'staff';
  if (data.isAdmin || role === 'admin') return true;
  const roleDoc = await readDoc(doc(firestore, 'permission_groups', role));
  return roleDoc.exists() ? (roleDoc.data().permissions || {}) : defaultPermissions(role);
}

// Finds the user's access record — allowed_users/{uid}, else allowed_users/{email} — and
// reports it through onResult, again whenever it changes. Returns a cleanup function.
//
// Both documents are *listened to*, not read once. Records are keyed by email (a few older
// ones by UID), and the UID listener never fires again for those, so a one-time email
// read that failed — a slow first connection right after sign-in — used to leave
// staff who do have access stuck on "Access Unauthorized" until they reloaded. Listeners
// retry on their own and pick up the record as soon as the server answers.
//
// "Unauthorized" is only reported once the server itself (not the local cache) has said
// neither document exists. If nothing has been heard after LOOKUP_GIVE_UP_MS the lookup
// reports 'error' (a "couldn't load" screen, not "no access"), and still keeps listening:
// a late answer replaces it.
//
// Two sign-ins never get as far as the record, matching what the security rules allow:
// staff who signed in by phone (phone sign-in is for parents; the record must be reached
// through the email) get 'staff-phone', and email/password accounts that haven't proven
// they own the inbox get 'unverified' (anyone can create one for any address).
function watchAccessRecord(user, onResult) {
  const snaps = { uid: null, email: null };
  let seq = 0;
  let settled = false;
  let seeded = false;
  let stopped = false;
  const unsubs = [];

  const report = (next) => {
    settled = true;
    clearTimeout(giveUp);
    onResult(next);
  };

  const evaluate = async () => {
    const mine = ++seq;
    const found = [snaps.uid, snaps.email].find(snap => snap?.exists());
    if (!found) {
      const serverSaysMissing = (snap) => snap && !snap.metadata.fromCache;
      if (serverSaysMissing(snaps.uid) && (!user.email || serverSaysMissing(snaps.email))) {
        report({ role: 'unauthorized', permissions: {} });
      }
      return;
    }

    const data = found.data();
    const isAdmin = data.isAdmin || data.role === 'admin';
    if (isAdmin && !seeded) {
      seeded = true;
      seedPermissionGroups();
    }
    try {
      const permissions = await resolvePermissions(data);
      if (mine === seq) report({ ...data, permissions });
    } catch (err) {
      console.error('Failed to load permissions:', err);
      if (mine === seq && !settled) report({ role: 'error', permissions: {} });
    }
  };

  const listen = (key, id) => onSnapshot(
    doc(firestore, 'allowed_users', id),
    { includeMetadataChanges: true }, // so the cache -> server confirmation re-evaluates
    (snap) => { snaps[key] = snap; evaluate(); },
    (err) => {
      console.error(`allowed_users/${id} listener failed:`, err);
      if (!settled) report({ role: 'error', permissions: {} });
    },
  );

  const giveUp = setTimeout(() => {
    if (!settled) report({ role: 'error', permissions: {} });
  }, LOOKUP_GIVE_UP_MS);

  user.getIdTokenResult().then(t => t.signInProvider).catch(() => null).then((provider) => {
    if (stopped) return;
    if (provider === 'phone') return report({ role: 'staff-phone', permissions: {} });
    if (user.email && !user.emailVerified) return report({ role: 'unverified', permissions: {} });
    unsubs.push(listen('uid', user.uid));
    if (user.email) unsubs.push(listen('email', user.email.toLowerCase()));
  });

  return () => {
    stopped = true;
    seq++;
    clearTimeout(giveUp);
    unsubs.forEach(unsub => unsub());
  };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cleanup for the signed-in user's listeners and timer; replaced on every auth change.
    let stopLookup = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      stopLookup();
      stopLookup = () => {};

      if (!user) {
        writeSessionHint('');
        setCurrentUser(null);
        setUserData(null);
        setLoading(false);
        return;
      }

      // Back to loading until this user's access record is read. After a sign-out
      // `loading` is already false and `userData` null, so without this the app
      // flashed "Access Unauthorized" at staff who do have access while it looked
      // them up (and queued a bogus access request if the lookup took over 5s).
      setLoading(true);
      setUserData(null);
      setCurrentUser(user);

      // Parents sign in with their phone number and have no staff record. Which
      // children they may see is checked by the server on every request
      // (functions/src/students/portal.js), so there is nothing to look up here.
      if (!user.email && user.phoneNumber) {
        setUserData({ role: 'parent', dashboardType: 'parent', phoneNumber: user.phoneNumber, permissions: {} });
        setLoading(false);
        return;
      }

      stopLookup = watchAccessRecord(user, (next) => {
        setUserData(next);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      stopLookup();
    };
  }, []);

  // Persist the hint whenever we learn what kind of user this is.
  useEffect(() => {
    if (loading || !userData) return;
    const isPortal = userData.dashboardType === 'parent' || userData.role === 'parent';
    const isStaff = userData.isAdmin || ['admin', 'staff', 'teacher', 'pro'].includes(userData.role)
      || Object.keys(userData.permissions || {}).length > 0;
    writeSessionHint(isPortal ? 'portal' : isStaff ? 'shell' : '');
  }, [loading, userData]);

  // Heresay follows whoever is signed in on this device, and forgets them on sign-out.
  useEffect(() => {
    if (loading) return;
    return identifyForHeresay(currentUser, userData);
  }, [loading, currentUser, userData]);

  const value = {
    currentUser,
    userData,
    loading
  };

  // Children always render: App.jsx shows the app-shell skeleton while `loading`
  // is true, instead of the blank page a withheld tree produced.
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
