// Authentication and Access Control - Firestore Edition

// Global User Data
window.currentUserData = null;

// Splash Screen Logic
window.hideSplash = function () {
    const splash = document.getElementById('splash-screen');
    if (splash && !splash.classList.contains('hidden') && !splash.classList.contains('fading')) {
        splash.classList.add('fading');
        setTimeout(() => {
            splash.classList.add('hidden');
            splash.classList.remove('fading');
        }, 1000);
    }
};

// Splash animation fallback
document.addEventListener('DOMContentLoaded', () => {
    const splashAnimation = document.getElementById('splash-animation');
    if (splashAnimation) {
        splashAnimation.addEventListener('error', () => {
            console.warn('Splash animation failed to load');
        });
    }
    setTimeout(hideSplash, 4500);
});

// Auth State Observer
auth.onAuthStateChanged(user => {
    const authModal = document.getElementById('login-modal');
    const pendingModal = document.getElementById('pending-approval-modal');

    if (user) {
        checkUserAccess(user, authModal, pendingModal);
    } else {
        if (authModal) authModal.classList.remove('hidden');
        if (pendingModal) pendingModal.classList.add('hidden');
        document.getElementById('user-widget').style.display = 'none';
        hideSplash();
    }
});

// Login Handlers
const googleLoginBtn = document.getElementById('google-login-btn');
const emailAuthForm = document.getElementById('email-auth-form');
const authToggleLink = document.getElementById('auth-toggle-link');
const emailSubmitBtn = document.getElementById('email-submit-btn');
const forgotPasswordLink = document.getElementById('forgot-password-link');
let isSignUp = false;

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(res => {
            window.AppLogger.log('LOGIN_GOOGLE', 'auth', { email: res.user.email });
        }).catch(handleAuthError);
    });
}

if (emailAuthForm) {
    emailAuthForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;

        if (isSignUp) {
            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    cred.user.sendEmailVerification();
                    window.AppLogger.log('SIGNUP_EMAIL', 'auth', { email });
                    AppDialog.toast('Account created! Please verify your email.', 'success');
                }).catch(handleAuthError);
        } else {
            auth.signInWithEmailAndPassword(email, password).then(res => {
                window.AppLogger.log('LOGIN_EMAIL', 'auth', { email: res.user.email });
            }).catch(handleAuthError);
        }
    });
}

if (authToggleLink) {
    authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isSignUp = !isSignUp;
        const toggleText = document.getElementById('auth-toggle-text');
        if (isSignUp) {
            toggleText.innerText = 'Already have an account?';
            authToggleLink.innerText = 'Sign In';
            emailSubmitBtn.innerText = 'Sign Up';
        } else {
            toggleText.innerText = "Don't have an account?";
            authToggleLink.innerText = 'Sign Up';
            emailSubmitBtn.innerText = 'Sign In';
        }
    });
}

function handleAuthError(error) {
    console.error("Auth Error", error);
    document.getElementById('login-error').innerText = error.message;
}

// ─── Access Control Engine (Firestore only) ─────────────────────────────────
async function checkUserAccess(user, modal, pendingModal) {
    const email = user.email.toLowerCase();
    const profile = {
        displayName: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL || '',
        lastSignIn: firebase.firestore.FieldValue.serverTimestamp()
    };
    const isAllowedDomain = email.endsWith('@abhishri.edu.in');

    try {
        const userDoc = await firestore.collection('allowedUsers').doc(email).get();

        if (userDoc.exists) {
            // Known account — staff, admin, or student
            if (pendingModal) pendingModal.classList.add('hidden');
            const data = { ...userDoc.data(), ...profile };
            firestore.collection('allowedUsers').doc(email).update(profile).catch(() => {});
            grantAccess(user, modal, data);

        } else if (isAllowedDomain) {
            // Auto-provision staff on allowed domain
            const newUserData = {
                email,
                isAdmin: false,
                role: 'staff',
                permissions: {
                    smart_campus: { view: true, control: false },
                    staff_directory: { view: true, add: false, manage: false, delete: false, attendance: true },
                    student_directory: { view: true, manage: false },
                    whatsapp_sender: { access: true, broadcast: false, manage: false, connect: false },
                    fees_accounting: { view: true, manage: false }
                },
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                addedBy: 'system_auto_provision',
                ...profile
            };
            await firestore.collection('allowedUsers').doc(email).set(newUserData);
            if (pendingModal) pendingModal.classList.add('hidden');
            grantAccess(user, modal, newUserData);

        } else {
            // Not a staff account — check if this email belongs to a student or parent
            const studentMatch = await findStudentByEmail(email);
            if (studentMatch) {
                // Student/parent: grant portal access with session data only — no allowedUsers entry
                if (pendingModal) pendingModal.classList.add('hidden');
                grantAccess(user, modal, {
                    email,
                    isAdmin: false,
                    role: 'student',
                    dashboardType: studentMatch.dashboardType,
                    linkedStudentId: studentMatch.studentId,
                    permissions: {}
                });
            } else {
                // Truly unknown — show pending approval
                firestore.collection('pendingUsers').doc(email).set({
                    email, uid: user.uid, ...profile,
                    firstSeenAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(() => {});

                if (modal) modal.classList.add('hidden');
                if (pendingModal) {
                    pendingModal.classList.remove('hidden');
                    document.getElementById('pending-email').innerText = email;
                    if (window.lucide) lucide.createIcons();
                }
                hideSplash();
            }
        }
    } catch (err) {
        console.error("Access Check Error:", err);
        AppDialog.toast('System Error: Could not verify authorization.', 'error');
        auth.signOut();
    }
}



// Query student directory directly by email — no allowedUsers entry needed for students
async function findStudentByEmail(email) {
    try {
        const col = firestore.collection('modules').doc('student_directory').collection('students');
        let snap = await col.where('studentEmail', '==', email).limit(1).get();
        if (!snap.empty) return { studentId: snap.docs[0].id, dashboardType: 'student' };
        snap = await col.where('motherEmail', '==', email).limit(1).get();
        if (!snap.empty) return { studentId: snap.docs[0].id, dashboardType: 'parent' };
        snap = await col.where('fatherEmail', '==', email).limit(1).get();
        if (!snap.empty) return { studentId: snap.docs[0].id, dashboardType: 'parent' };
    } catch (e) { console.warn('Student directory query failed:', e?.code); }
    return null;
}

function grantAccess(user, modal, userData) {
    if (modal) modal.classList.add('hidden');
    window.currentUserData = userData;

    // Store the permission fingerprint at login time.
    // Checked on each navigation — if it changed, prompt a reload once.
    if (window._permissionListener) { window._permissionListener(); window._permissionListener = null; }
    const _permFingerprint = (d) => [!!d?.isAdmin, d?.permissionGroup || '', d?.isAdmin ? '' : JSON.stringify(d?.permissions || {})].join('|');
    window._sessionPermKey = _permFingerprint(userData);
    window._permCheckEmail = user.email.toLowerCase();

    // Reset Central Data Managers — skip for student/parent accounts,
    // they don't have collection-level access to the student directory.
    const _canReadStudents = userData.isAdmin ||
        (userData.permissions?.student_directory &&
         Object.values(userData.permissions.student_directory).some(Boolean));
    if (window.studentDataManager && _canReadStudents) {
        window.studentDataManager.isSubscribed = false;
        window.studentDataManager.subscribe();
    }

    // Force re-init of modules to pick up new permissions
    if (window.smartCampus && typeof window.smartCampus.initialize === 'function') { 
        window.smartCampus.isSubscribed = false; // Note: SC uses areasListener/scenesListener instead of isSubscribed
        window.smartCampus.areasListener = null;
        window.smartCampus.scenesListener = null;
        window.smartCampus.initialize(); 
    }
    if (window.studentDirectory && typeof window.studentDirectory.initialize === 'function') { 
        window.studentDirectory.isSubscribed = false; 
        window.studentDirectory.initialize(); 
    }
    if (window.staffDirectory && typeof window.staffDirectory.initialize === 'function') { 
        window.staffDirectory.isSubscribed = false; 
        window.staffDirectory.initialize(); 
    }
    if (window.feesManager && typeof window.feesManager.initialize === 'function') { 
        window.feesManager.isSubscribed = false; 
        window.feesManager.initialize(); 
    }

    updateUserWidget(user, userData);
    handleRouting();

    const video = document.getElementById('splash-video');
    if (!(video && !video.paused && video.currentTime < video.duration)) {
        setTimeout(hideSplash, 800);
    }
}

window.addEventListener('hashchange', handleRouting);

function handleRouting() {
    const userData = window.currentUserData || {};
    const hash = window.location.hash.replace('#', '') || 'portal';
    // Student/parent accounts always go to the student portal
    if (userData.role === 'student' && !hash.startsWith('student-portal')) {
        if (typeof navigateTo === 'function') navigateTo('student-portal', true);
        return;
    }
    if (typeof navigateTo === 'function') navigateTo(hash, false);
}

window.logout = () => {
    const email = auth.currentUser?.email;
    window.AppLogger.log('LOGOUT', 'auth', { email });
    if (window._permissionListener) { window._permissionListener(); window._permissionListener = null; }
    window._sessionPermKey = null;
    window._permCheckEmail = null;
    auth.signOut().then(() => {
        window.location.hash = '';
        window.location.reload();
    });
};

function updateUserWidget(user, userData) {
    const widget = document.getElementById('user-widget');
    const emailEl = document.getElementById('widget-user-email');
    const avatarEl = document.getElementById('widget-user-avatar');

    if (!user) { widget.style.display = 'none'; return; }

    widget.style.display = 'block';
    const roleLabel = userData.isAdmin ? 'Admin' : (userData.role === 'student' ? 'Student' : null);
    emailEl.innerText = roleLabel ? `${roleLabel} (${user.email})` : user.email;

    // Point "Portal Home" to the right place depending on role
    const portalLink = document.querySelector('.user-dropdown .portal-link');
    if (portalLink) {
        if (userData.role === 'student') {
            portalLink.setAttribute('onclick', "navigateTo('student-portal')");
        } else {
            portalLink.setAttribute('onclick', "navigateTo('portal')");
        }
    }

    if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Avatar">`;
    } else {
        avatarEl.innerText = (user.email[0] || 'U').toUpperCase();
    }
    lucide.createIcons();
}
