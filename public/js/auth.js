// Authentication Module

function encodeEmail(email) {
    return email.replace(/\./g, '_').replace(/@/g, '_');
}

// Splash Screen Logic
window.hideSplash = function () {
    const splash = document.getElementById('splash-screen');
    if (splash && !splash.classList.contains('hidden') && !splash.classList.contains('fading')) {
        splash.classList.add('fading');

        // Wait for CSS transition (1s) before applying display: none
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
        // Trigger fade out roughly 0.6s before video ends for a smooth transition
        video.addEventListener('timeupdate', () => {
            if (video.duration > 0 && video.currentTime >= video.duration - 0.6) {
                hideSplash();
            }
        });

        video.addEventListener('ended', hideSplash);
        video.addEventListener('error', () => {
            console.warn('Splash video failed to load or play');
            hideSplash();
        });
    }
    // Failsafe: hide splash after 6 seconds no matter what
    setTimeout(hideSplash, 6000);
});

// Auth State Observer
auth.onAuthStateChanged(user => {
    const modal = document.getElementById('login-modal');

    if (user) {
        checkUserAccess(user, modal);
    } else {
        modal.classList.remove('hidden');
        document.getElementById('user-widget').style.display = 'none';

        // Hide Splash Screen
        hideSplash();

        window.location.hash = '';
    }
});

// Login Handler
const googleLoginBtn = document.getElementById('google-login-btn');
const emailAuthForm = document.getElementById('email-auth-form');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleText = document.getElementById('auth-toggle-text');
const emailSubmitBtn = document.getElementById('email-submit-btn');
const forgotPasswordLink = document.getElementById('forgot-password-link');
let isSignUp = false;

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        clearError();
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider)
            .catch(handleAuthError);
    });
}

if (emailAuthForm) {
    emailAuthForm.addEventListener('submit', (e) => {
        e.preventDefault();
        clearError();

        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;

        if (isSignUp) {
            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Send verification email
                    userCredential.user.sendEmailVerification();
                    alert('Account created! Please check your email for verification before signing in.');
                    // Optionally sign them out immediately until verified, but for now we'll let checkUserAccess handle it
                })
                .catch(handleAuthError);
        } else {
            auth.signInWithEmailAndPassword(email, password)
                .catch(handleAuthError);
        }
    });
}

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('email-input').value;
        if (!email) {
            alert('Please enter your email address first.');
            return;
        }

        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert('Password reset email sent! Please check your inbox.');
            })
            .catch(handleAuthError);
    });
}

if (authToggleLink) {
    authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isSignUp = !isSignUp;
        if (isSignUp) {
            authToggleText.innerText = 'Already have an account?';
            authToggleLink.innerText = 'Sign In';
            emailSubmitBtn.innerText = 'Sign Up';
        } else {
            authToggleText.innerText = "Don't have an account?";
            authToggleLink.innerText = 'Sign Up';
            emailSubmitBtn.innerText = 'Sign In';
        }
        clearError();
    });
}

function clearError() {
    document.getElementById('login-error').innerText = '';
}

function handleAuthError(error) {
    console.error("Auth Error", error);
    document.getElementById('login-error').innerText = error.message;
}

// Updated Access Control
async function checkUserAccess(user, modal) {
    const emailKey = encodeEmail(user.email);
    const email = user.email.toLowerCase();

    // Check allowed domains
    const isAllowedDomain = email.endsWith('@abhishriacademy.in') || email.endsWith('@zoho.com') || email.endsWith('@zoho.in');

    db.ref(`allowedUsers/${emailKey}`).once('value', snap => {
        if (snap.exists()) {
            // User is explicitly allowed (or was auto-created previously)
            grantAccess(user, modal, snap.val());
        } else if (isAllowedDomain) {
            // User is from an allowed domain but not in DB yet -> Auto-create
            const newUserData = {
                email: email,
                isAdmin: false,
                permissions: {
                    smart_campus: { view: false, control: false },
                    staff_directory: { view: false, add: false, manage: false, delete: false, attendance: false },
                    student_directory: { view: false, manage: false },
                    whatsapp_sender: { access: false, broadcast: false, connect: false }
                },
                addedAt: Date.now(),
                addedBy: 'system_auto_domain'
            };

            db.ref(`allowedUsers/${emailKey}`).set(newUserData)
                .then(() => grantAccess(user, modal, newUserData))
                .catch(err => {
                    console.error("Error creating user data", err);
                    alert("System Error: Could not create user profile.");
                    auth.signOut();
                });
        } else {
            // Not allowed
            alert('Access Denied: Your email is not authorized.');
            auth.signOut();
        }
    });
}

function grantAccess(user, modal, userData) {
    modal.classList.add('hidden');

    // Save Login Stats
    db.ref(`users/${user.uid}`).update({
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        lastSignIn: Date.now(),
        photoURL: user.photoURL || ''
    });

    // Store User Permissions Global
    window.currentUserData = userData;

    // Update User Widget
    updateUserWidget(user, userData);

    // Initialize Routing
    handleRouting();

    // Hide Splash Screen with logic
    const video = document.getElementById('splash-video');
    if (video && !video.paused && video.currentTime < video.duration) {
        // Video is playing, let the 'ended' listener handle it
    } else {
        // Video not playing or finished, hide after a small buffer
        setTimeout(hideSplash, 1000);
    }
}

// Routing Logic
window.addEventListener('hashchange', handleRouting);

function handleRouting() {
    const hash = window.location.hash.replace('#', '') || 'portal';
    if (typeof navigateTo === 'function') {
        navigateTo(hash, false);
    }
}

// Logout Handler
window.logout = () => {
    auth.signOut().then(() => {
        window.location.reload();
    });
};

// User Widget
function updateUserWidget(user, userData) {
    const widget = document.getElementById('user-widget');
    const emailEl = document.getElementById('widget-user-email');
    const avatarEl = document.getElementById('widget-user-avatar');

    if (!user) {
        widget.style.display = 'none';
        return;
    }

    widget.style.display = 'block';
    emailEl.innerText = userData.isAdmin ? `Admin (${user.email})` : user.email;

    if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Avatar">`;
    } else {
        const initial = (user.email[0] || 'U').toUpperCase();
        avatarEl.innerHTML = initial;
    }
    lucide.createIcons();
}
