import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { RecaptchaVerifier } from 'firebase/auth';
import { normalizePhone } from '../../../functions/src/shared/phone.mjs';
import { AlertCircle, Smartphone, KeyRound } from 'lucide-react';

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
 * code: enter the number, get the code, type it in. `start(e164, verifier)` sends the
 * code and returns Firebase's ConfirmationResult; `onConfirmed` runs once the code is
 * accepted. Web only: phone auth needs reCAPTCHA, which the iOS app's bundled web view
 * can't load, and the iOS app is for staff.
 */
export default function PhoneCodeForm({ start, onConfirmed, hint, confirmLabel = 'Sign In', idPrefix = 'phone' }) {
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
        verifierRef.current = new RecaptchaVerifier(auth, `${idPrefix}-recaptcha-${captchaKey}`, { size: 'invisible' });
      }
      const result = await start(e164, verifierRef.current);
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
      const result = await confirmation.confirm(code.trim());
      setBusy(false);
      onConfirmed?.(result);
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
            <label htmlFor={`${idPrefix}-number`} className="block text-sm font-semibold mb-2">Mobile number</label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
              <input
                id={`${idPrefix}-number`}
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
            <p className="text-xs text-brand-text-dim mt-2">{hint}</p>
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
            <label htmlFor={`${idPrefix}-code`} className="block text-sm font-semibold mb-2">Code sent to {sentTo.replace(/^\+91/, '+91 ')}</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
              <input
                id={`${idPrefix}-code`}
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
            {busy ? 'Checking...' : confirmLabel}
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
      <div key={captchaKey} id={`${idPrefix}-recaptcha-${captchaKey}`} />
    </div>
  );
}
