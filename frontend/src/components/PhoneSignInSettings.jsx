import React, { useState } from 'react';
import { linkWithPhoneNumber, unlink } from 'firebase/auth';
import { X, Smartphone, AlertCircle } from 'lucide-react';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import PhoneCodeForm, { phoneErrorMessage } from './PhoneCodeForm';

/**
 * Lets a staff member add a mobile number to their account, so they can also sign in
 * with an SMS code. The number is linked to the same Firebase account their Google
 * sign-in uses, so the email and every permission check stay exactly as they are.
 *
 * Not for admins: an SMS code is only as safe as the SIM (SIM swaps, recycled numbers),
 * and admins hold fees, accounting and permissions. onAllowedUserWrite also removes the
 * number when someone is made an admin or loses access.
 */
export default function PhoneSignInSettings({ onClose }) {
  const { userData } = useAuth();
  const user = auth.currentUser;
  const [phone, setPhone] = useState(user?.phoneNumber || null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = userData?.isAdmin || userData?.role === 'admin';

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await unlink(user, 'phone');
      setPhone(null);
    } catch (err) {
      setError(phoneErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-signin-title"
        className="w-full max-w-md bg-brand-card border border-brand-card-border rounded-2xl shadow-xl p-6 text-brand-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="phone-signin-title" className="text-lg font-bold flex items-center gap-2">
            <Smartphone size={18} className="text-brand-primary" /> Phone sign-in
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-start gap-2 border border-red-100 dark:border-red-800/50">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isAdmin ? (
          <p className="text-sm text-brand-text-dim">
            Admins sign in with Google only. A texted code is only as safe as the SIM card, and admin accounts control fees, accounting and permissions.
          </p>
        ) : phone ? (
          <div className="space-y-4">
            <p className="text-sm text-brand-text-dim">
              You can sign in with <span className="font-semibold text-brand-text">{phone.replace(/^\+91/, '+91 ')}</span>: on the sign-in page choose Staff, then Mobile number.
            </p>
            <button
              onClick={remove}
              disabled={busy}
              className="w-full py-2.5 border border-brand-card-border rounded-lg font-semibold text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-70"
            >
              {busy ? 'Removing...' : 'Remove this number'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-brand-text-dim">
              Add your mobile number to also sign in with a code sent by SMS. Google sign-in keeps working as before.
            </p>
            <PhoneCodeForm
              idPrefix="link"
              start={(e164, verifier) => linkWithPhoneNumber(user, e164, verifier)}
              onConfirmed={() => setPhone(auth.currentUser?.phoneNumber || null)}
              hint="We'll text you a 6-digit code to confirm it's yours."
              confirmLabel="Add number"
            />
          </div>
        )}
      </div>
    </div>
  );
}
