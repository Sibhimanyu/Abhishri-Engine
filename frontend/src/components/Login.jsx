import React, { useState } from 'react';
import { auth, googleProvider, functions } from '../firebase';
import { signInWithEmailAndPassword, signInWithPopup, signInWithCredential, GoogleAuthProvider, signInWithPhoneNumber, sendPasswordResetEmail } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { isNative } from '../utils/native';
import PhoneCodeForm from './PhoneCodeForm';
import { Mail, Lock, AlertCircle } from 'lucide-react';

// Phone sign-in is for parents only; the server decides which children a number may see
// (getParentPortal). Staff sign in with their email (Google or password).
const phoneSignIn = (e164, verifier) => signInWithPhoneNumber(auth, e164, verifier);

// Firebase's email/password errors, in words staff can act on. Firebase reports a wrong
// password, an unknown email and an account with no password alike as invalid-credential,
// so the message has to cover all three.
function passwordErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match. If you haven't set a password yet, or forgot it, use \"Set or reset password\" below. Gmail addresses can use the Google button instead.";
    case 'auth/invalid-email': return "That doesn't look like an email address.";
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes, or reset your password.';
    case 'auth/user-disabled': return 'This account has been switched off. Contact the school office.';
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    default: return "Couldn't sign you in. Check your connection and try again.";
  }
}

export default function Login() {
  // Parents are the many; staff are few and know where to look. The iOS app is staff-only.
  const [mode, setMode] = useState(isNative ? 'staff' : 'parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSentTo, setResetSentTo] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(passwordErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Being given access creates no sign-in account, so first make sure one exists for an
  // address on the access list (prepareStaffPasswordSetup), then have Firebase email the
  // link. Following it sets the password and confirms the email, which is what unlocks
  // the account. Same answer whatever the address, so this can't reveal who has access.
  const handlePasswordReset = async () => {
    const address = email.trim().toLowerCase();
    setError(null);
    setResetSentTo('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Type your email address above first, then press "Set or reset password".');
      return;
    }
    setResetting(true);
    try {
      await httpsCallable(functions, 'prepareStaffPasswordSetup')({ email: address });
      await sendPasswordResetEmail(auth, address);
      setResetSentTo(address);
    } catch (err) {
      console.error('Password reset failed', err);
      setError(err?.code === 'auth/too-many-requests'
        ? 'Too many emails sent. Wait a few minutes and try again.'
        : "Couldn't send the email. Check your connection and try again.");
    } finally {
      setResetting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      if (isNative) {
        // Popups can't open inside the iOS app: sign in with the native Google SDK,
        // then hand its token to the JS SDK so the rest of the app is unchanged.
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const result = await FirebaseAuthentication.signInWithGoogle();
        await signInWithCredential(auth, GoogleAuthProvider.credential(result.credential?.idToken, result.credential?.accessToken));
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      // Closing the Google sheet isn't an error worth showing.
      if (isNative && /cancel/i.test(err?.message || '')) return;
      setError(err.message);
    }
  };

  return (
    <div className="min-h-dvh w-full flex items-center justify-center p-4 bg-brand-bg text-brand-text transition-colors duration-300">
      <div className="w-full max-w-md p-8 bg-brand-card border border-brand-card-border rounded-2xl shadow-lg transition-colors duration-300">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-8">
            <img src="/logo-white.png" alt="Abhishri Logo" className="h-20 object-contain hidden dark:block" />
            <img src="/logo-coral.png" alt="Abhishri Logo" className="h-20 object-contain block dark:hidden" />
          </div>
          <h2 className="text-2xl font-bold">Welcome to Abhishri</h2>
          <p className="text-brand-text-dim mt-2 text-sm">
            {mode === 'parent' ? "Sign in to see your child's attendance and fees" : 'Sign in to your school workspace'}
          </p>
        </div>

        {!isNative && (
          <div role="tablist" className="flex bg-black/5 dark:bg-white/5 p-1 rounded-xl mb-6">
            {[['parent', 'Parent'], ['staff', 'Staff']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => { setMode(key); setError(null); }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === key ? 'bg-brand-card text-brand-primary shadow-sm' : 'text-brand-text-dim hover:text-brand-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === 'parent' ? (
          <PhoneCodeForm key="parent" idPrefix="parent" start={phoneSignIn} hint="Use the number you gave the school. We'll text you a 6-digit code." />
        ) : (
          <>
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 border border-red-100 dark:border-red-800/50">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {resetSentTo && (
              <div role="status" className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm border border-green-100 dark:border-green-800/50">
                If {resetSentTo} has access, we've emailed it a link to set a password. Open it, choose a password, then sign in here. Check spam if it doesn't arrive in a few minutes.
              </div>
            )}

            <form onSubmit={handleEmailLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text"
                    placeholder="you@abhishri.edu.in"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={resetting}
                className="w-full text-sm font-semibold text-brand-primary hover:text-brand-primary-hover disabled:opacity-70"
              >
                {resetting ? 'Sending...' : 'Set or reset password'}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-brand-card-border"></div>
              <span className="text-brand-text-dim text-xs font-semibold uppercase tracking-wider">Or continue with</span>
              <div className="flex-1 h-px bg-brand-card-border"></div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="mt-6 w-full flex items-center justify-center gap-3 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 font-semibold py-2.5 rounded-lg transition-colors text-brand-text"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
