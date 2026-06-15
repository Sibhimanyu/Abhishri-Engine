import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../firebase';

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
        try {
          const uidRef = doc(firestore, 'allowed_users', user.uid);
          
          unsubUserDoc = onSnapshot(uidRef, async (uidSnap) => {
            try {
              if (uidSnap.exists()) {
                const data = uidSnap.data();
                const role = data.role || 'staff';
                
                if (data.isAdmin || role === 'admin') {
                  const rolesToSeed = ['teacher', 'pro', 'staff'];
                  for (const r of rolesToSeed) {
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
                  }
                }

                // Fetch dynamic permissions
                let dynamicPerms = {};
                if (data.isAdmin || role === 'admin') {
                  dynamicPerms = true;
                } else {
                  const roleDoc = await getDoc(doc(firestore, 'permission_groups', role));
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
                  const emailSnap = await getDoc(emailRef);
                  
                  if (emailSnap.exists()) {
                    const data = emailSnap.data();
                    const role = data.role || 'staff';
                    
                    let dynamicPerms = {};
                    if (data.isAdmin || role === 'admin') {
                      dynamicPerms = true;
                    } else {
                      const roleDoc = await getDoc(doc(firestore, 'permission_groups', role));
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
                // We'll give the backend 5 seconds to complete any migrations before checking students
                setTimeout(async () => {
                  try {
                    // If the snapshot fired again and set userData successfully, don't overwrite it
                    const doubleCheckUid = await getDoc(uidRef);
                    if (doubleCheckUid.exists()) return;

                    const email = user.email ? user.email.toLowerCase() : '';
                    const studentsRef = collection(firestore, 'students');
                    
                    let foundStudent = null;
                    let studentRole = null;

                    const checkRef = async (ref) => {
                      if (foundStudent || !email) return;
                      let snap = await getDocs(query(ref, where('studentEmail', '==', email)));
                      if (!snap.empty) { foundStudent = snap.docs[0]; studentRole = 'student'; return; }
                      snap = await getDocs(query(ref, where('motherEmail', '==', email)));
                      if (!snap.empty) { foundStudent = snap.docs[0]; studentRole = 'parent'; return; }
                      snap = await getDocs(query(ref, where('fatherEmail', '==', email)));
                      if (!snap.empty) { foundStudent = snap.docs[0]; studentRole = 'parent'; return; }
                    };

                    await checkRef(studentsRef);
                    
                    // Double check user data wasn't updated by onSnapshot while we were querying
                    const tripleCheckUid = await getDoc(uidRef);
                    if (tripleCheckUid.exists()) return;

                    if (foundStudent) {
                      setUserData({ 
                        role: studentRole, 
                        dashboardType: studentRole === 'parent' ? 'parent' : 'student', 
                        studentId: foundStudent.id, 
                        ...foundStudent.data() 
                      });
                    } else {
                      setUserData({ role: 'unauthorized', permissions: {} });
                    }
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

  const value = {
    currentUser,
    userData,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
