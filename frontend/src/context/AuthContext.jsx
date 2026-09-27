import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../firebase';
import { writeSessionHint } from '../utils/sessionHint';
import { getDoc as readDoc } from '../utils/firestoreRead';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (user) {
        setCurrentUser(user);

        // Parents sign in with their phone number and have no staff record. Which
        // children they may see is checked by the server on every request
        // (functions/src/students/portal.js), so there is nothing to look up here.
        if (!user.email && user.phoneNumber) {
          setUserData({ role: 'parent', dashboardType: 'parent', phoneNumber: user.phoneNumber, permissions: {} });
          setLoading(false);
          return;
        }

        try {
          const uidRef = doc(firestore, 'allowed_users', user.uid);
          
          unsubUserDoc = onSnapshot(uidRef, async (uidSnap) => {
            try {
              if (uidSnap.exists()) {
                const data = uidSnap.data();
                const role = data.role || 'staff';
                
                if (data.isAdmin || role === 'admin') {
                  // Background, in parallel: awaiting three server reads here held every
                  // admin on the splash screen for seconds on each load. Reads the server
                  // (not readDoc's cache fallback) so a stale cache can't overwrite a group.
                  Promise.all(['teacher', 'pro', 'staff'].map(async (r) => {
                    const rRef = doc(firestore, 'permission_groups', r);
                    const rSnap = await getDoc(rRef);
                    if (!rSnap.exists()) {
                      const isTeach = r === 'teacher';
                      const isPro = r === 'pro';
                      await setDoc(rRef, {
                        role: r,
                        description: `Default ${r} permissions`,
                        permissions: {
                          staff_directory: { view: true, manage: isPro, delete: false },
                          student_directory: { view: true, manage: isPro, delete: false },
                          attendance: { view: true, mark: isTeach || isPro, edit: isPro },
                          fees_accounting: { 
                            view: false, view_dashboard: false, config: false, 
                            ledger: false, trans_add: false, trans_delete: false, 
                            exp_own: true, exp_all: false, wallet_view_own: true, wallet_edit_own: false
                          },
                          whatsapp_sender: { access: false, broadcast: false, manage: false },
                          smart_campus: { view: isPro, control: isPro, scenes: false, config: false }
                        }
                      });
                    }
                  })).catch(err => console.warn('Failed to seed permission groups', err));
                }

                // Fetch dynamic permissions
                let dynamicPerms = {};
                if (data.isAdmin || role === 'admin') {
                  dynamicPerms = true;
                } else {
                  const roleDoc = await readDoc(doc(firestore, 'permission_groups', role));
                  if (roleDoc.exists()) {
                    dynamicPerms = roleDoc.data().permissions || {};
                  } else {
                    const isTeach = role === 'teacher';
                    const isPro = role === 'pro';
                    dynamicPerms = {
                      staff_directory: { view: true, manage: isPro, delete: false },
                      student_directory: { view: true, manage: isPro, delete: false },
                      attendance: { view: true, mark: isTeach || isPro, edit: isPro },
                      fees_accounting: { 
                        view: false, view_dashboard: false, config: false, 
                        ledger: false, trans_add: false, trans_delete: false, 
                        exp_own: true, exp_all: false, wallet_view_own: true, wallet_edit_own: false
                      },
                      whatsapp_sender: { access: false, broadcast: false, manage: false },
                      smart_campus: { view: isPro, control: isPro, scenes: false, config: false }
                    };
                  }
                }
                
                setUserData({ ...data, permissions: dynamicPerms });
                setLoading(false);

              } else {
                // UID doc doesn't exist yet. Fallback to email or student check.
                if (user.email) {
                  const emailRef = doc(firestore, 'allowed_users', user.email.toLowerCase());
                  const emailSnap = await readDoc(emailRef);
                  
                  if (emailSnap.exists()) {
                    const data = emailSnap.data();
                    const role = data.role || 'staff';
                    
                    let dynamicPerms = {};
                    if (data.isAdmin || role === 'admin') {
                      dynamicPerms = true;
                    } else {
                      const roleDoc = await readDoc(doc(firestore, 'permission_groups', role));
                      if (roleDoc.exists()) {
                        dynamicPerms = roleDoc.data().permissions || {};
                      } else {
                        const isTeach = role === 'teacher';
                        const isPro = role === 'pro';
                        dynamicPerms = {
                          staff_directory: { view: true, manage: isPro, delete: false },
                          student_directory: { view: true, manage: isPro, delete: false },
                          attendance: { view: true, mark: isTeach || isPro, edit: isPro },
                          fees_accounting: { 
                            view: false, view_dashboard: false, config: false, 
                            ledger: false, trans_add: false, trans_delete: false, 
                            exp_own: true, exp_all: false, wallet_view_own: true, wallet_edit_own: false
                          },
                          whatsapp_sender: { access: false, broadcast: false, manage: false },
                          smart_campus: { view: isPro, control: isPro, scenes: false, config: false }
                        };
                      }
                    }
                    
                    setUserData({ ...data, permissions: dynamicPerms });
                    setLoading(false);
                    return;
                  }
                }

                // If we reach here, neither UID nor email allowed_users doc exists.
                // Give the backend a moment to complete any migrations before giving up.
                setTimeout(async () => {
                  try {
                    // If the snapshot fired again and set userData successfully, don't overwrite it
                    const doubleCheckUid = await getDoc(uidRef);
                    if (doubleCheckUid.exists()) return;

                    setUserData({ role: 'unauthorized', permissions: {} });
                    setLoading(false);
                  } catch (err) {
                    console.error("Error in fallback timeout:", err);
                    setUserData({ role: 'error', permissions: {} });
                    setLoading(false);
                  }
                }, 2000);
              }
            } catch (innerErr) {
              console.error("Error inside onSnapshot callback:", innerErr);
              setUserData({ role: 'error', permissions: {} });
              setLoading(false);
            }
          }, (snapshotError) => {
            console.error("Snapshot listener error:", snapshotError);
            setUserData({ role: 'error', permissions: {} });
            setLoading(false);
          });

        } catch (error) {
          console.error("Error fetching user data:", error);
          setUserData({ role: 'error', permissions: {} });
          setLoading(false);
        }
      } else {
        writeSessionHint('');
        setCurrentUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
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
