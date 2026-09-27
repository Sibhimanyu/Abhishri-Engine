import React, { useState, useEffect, useRef } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithEmailAndPassword, signInWithPopup, signInWithCredential, GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { isNative } from '../utils/native';
import { normalizePhone } from '../../../functions/src/shared/phone.mjs';
import { Mail, Lock, AlertCircle, Smartphone, KeyRound } from 'lucide-react';

const RESEND_AFTER = 30; // seconds

// Firebase's phone-auth errors, in words a parent can act on.
function phoneErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-phone-number': return "That doesn't look like a mobile number. Enter the 10-digit number the school has on file.";
    case 'auth/invalid-verification-code': return "That code isn't right. Check the SMS and try again.";
    case 'auth/code-expired': return 'That code has expired. Send a new one.';
    case 'auth/too-many-requests': return 'Too many attempts from this device. Please wait a while and try again.';
    case 'auth/quota-exceeded': return 'The school has reached its SMS limit for today. Please try again tomorrow or contact the school office.';
    case 'auth/operation-not-allowed': return "Phone sign-in isn't switched on yet. Please contact the school office.";
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    default: return "Couldn't sign you in. Check your connection and try again.";
  }
}

/**
 * Parents sign in with the mobile number on their child's record and a one-time SMS
 * code; which children they then see is decided by the server (getParentPortal).
 * Web only: phone auth needs reCAPTCHA, which the iOS app's bundled web view can't
 * load, and the iOS app is for staff.
 */
function ParentPhoneLogin() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [sentTo, setSentTo] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const verifierRef = useRef(null);
  // A fresh element per attempt: a reCAPTCHA can't be rendered twice into one.
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => () => verifierRef.current?.clear(), []);

  const resetVerifier = () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
    setCaptchaKey(k => k + 1);
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError(null);
    const e164 = normalizePhone(phone);
    if (!e164) {
      setError(phoneErrorMessage({ code: 'auth/invalid-phone-number' }));
      return;
    }
    setBusy(true);
    try {
      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(auth, `recaptcha-${captchaKey}`, { size: 'invisible' });
      }
      const result = await signInWithPhoneNumber(auth, e164, verifierRef.current);
      setConfirmation(result);
      setSentTo(e164);
      setCode('');
      setResendIn(RESEND_AFTER);
    } catch (err) {
      console.error('Phone sign-in: sending the code failed', err);
      setError(phoneErrorMessage(err));
      resetVerifier();
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      // Signing in hands over to AuthContext, which opens the parent portal.
      await confirmation.confirm(code.trim());
    } catch (err) {
      setError(phoneErrorMessage(err));
      setBusy(false);
    }
  };

  const changeNumber = () => {
    setConfirmation(null);
    setCode('');
    setError(null);
    resetVerifier();
  };

  const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-lg py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text';

  return (
    <div>
      {error && (
        <div role="alert" className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 border border-red-100 dark:border-red-800/50">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!confirmation ? (
        <form onSubmit={sendCode} className="space-y-5">
          <div>
            <label htmlFor="parent-phone" className="block text-sm font-semibold mb-2">Mobile number</label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
              <input
                id="parent-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="98765 43210"
                required
              />
            </div>
            <p className="text-xs text-brand-text-dim mt-2">Use the number you gave the school. We'll text you a 6-digit code.</p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70"
          >
            {busy ? 'Sending code...' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-5">
          <div>
            <label htmlFor="parent-code" className="block text-sm font-semibold mb-2">Code sent to {sentTo.replace(/^\+91/, '+91 ')}</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
              <input
                id="parent-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} tracking-[0.4em] font-mono`}
                placeholder="••••••"
                autoFocus
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70"
          >
            {busy ? 'Checking...' : 'Sign In'}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={changeNumber} className="text-brand-text-dim hover:text-brand-text font-semibold">Change number</button>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy || resendIn > 0}
              className="text-brand-primary font-semibold disabled:text-brand-text-dim disabled:opacity-70"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
      <div key={captchaKey} id={`recaptcha-${captchaKey}`} />
    </div>
  );
}

export default function Login() {
  // Parents are the many; staff are few and know where to look. The iOS app is staff-only.
  const [mode, setMode] = useState(isNative ? 'staff' : 'parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

        {mode === 'parent' ? <ParentPhoneLogin /> : (
          <>
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 border border-red-100 dark:border-red-800/50">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{error}</span>
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
