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

// Video Event Listeners & Failsafe
document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('splash-video');
    if (video) {
        video.addEventListener('timeupdate', () => {
            if (video.duration > 0 && video.currentTime >= video.duration - 0.6) hideSplash();
        });
        video.addEventListener('ended', hideSplash);
        video.addEventListener('error', () => {
            console.warn('Splash video failed');
            hideSplash();
        });
    }
    setTimeout(hideSplash, 6000);
});

// Auth State Observer
auth.onAuthStateChanged(user => {
    const authModal = document.getElementById('login-modal');
    const pendingModal = document.getElementById('pending-approval-modal');
    
    if (user) {
        // Always ensure they are in RTDB users node for admin visibility
        db.ref(`users/${user.uid}`).update({
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            lastSignIn: Date.now(),
            photoURL: user.photoURL || ''
        });
        
        // User is signed in, check if they are authorized
        checkUserAccess(user, authModal, pendingModal);
    } else {
        // No user is signed in
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
        auth.signInWithPopup(provider).catch(handleAuthError);
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
                    AppDialog.toast('Account created! Please verify your email.', 'success');
                }).catch(handleAuthError);
        } else {
            auth.signInWithEmailAndPassword(email, password).catch(handleAuthError);
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

// ─── Access Control Engine (Firestore) ──────────────────────────────────────
async function checkUserAccess(user, modal, pendingModal) {
    const email = user.email.toLowerCase();
    const isAllowedDomain = email.endsWith('@abhishriacademy.in') || email.endsWith('@zoho.com') || email.endsWith('@zoho.in');
    const isMasterEmail = email === 'sibhi.gv@gmail.com';

    try {
        const userDoc = await firestore.collection('allowedUsers').doc(email).get();

        if (userDoc.exists) {
            // User exists in whitelist
            if (pendingModal) pendingModal.classList.add('hidden');
            grantAccess(user, modal, userDoc.data());
        } else if (isAllowedDomain || isMasterEmail) {
            // Auto-provision user
            const newUserData = {
                email: email,
                isAdmin: isMasterEmail ? true : false,
                permissions: {
                    smart_campus: { view: true, control: isMasterEmail },
                    staff_directory: { view: true, add: isMasterEmail, manage: isMasterEmail, delete: isMasterEmail, attendance: true },
                    student_directory: { view: true, manage: isMasterEmail },
                    whatsapp_sender: { access: isMasterEmail, broadcast: isMasterEmail, connect: isMasterEmail },
                    fees_accounting: { view: true, manage: isMasterEmail }
                },
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                addedBy: 'system_auto_provision'
            };

            await firestore.collection('allowedUsers').doc(email).set(newUserData);
            if (pendingModal) pendingModal.classList.add('hidden');
            grantAccess(user, modal, newUserData);
        } else {
            // Block access but show pending modal
            if (modal) modal.classList.add('hidden');
            if (pendingModal) {
                pendingModal.classList.remove('hidden');
                document.getElementById('pending-email').innerText = email;
                if (window.lucide) lucide.createIcons();
            }
            hideSplash();
        }
    } catch (err) {
        console.error("Access Check Error:", err);
        AppDialog.toast('System Error: Could not verify authorization.', 'error');
        auth.signOut();
    }
}

function grantAccess(user, modal, userData) {
    if (modal) modal.classList.add('hidden');
    window.currentUserData = userData;

    updateUserWidget(user, userData);
    handleRouting();

    const video = document.getElementById('splash-video');
    if (!(video && !video.paused && video.currentTime < video.duration)) {
        setTimeout(hideSplash, 800);
    }
}

window.addEventListener('hashchange', handleRouting);

function handleRouting() {
    const hash = window.location.hash.replace('#', '') || 'portal';
    if (typeof navigateTo === 'function') navigateTo(hash, false);
}

window.logout = () => {
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
    emailEl.innerText = userData.isAdmin ? `Admin (${user.email})` : user.email;

    if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Avatar">`;
    } else {
        avatarEl.innerText = (user.email[0] || 'U').toUpperCase();
    }
    lucide.createIcons();
}
