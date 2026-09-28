import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset, applyActionCode, signInWithEmailAndPassword } from 'firebase/auth';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { auth } from '../firebase';

const MIN_PASSWORD = 8;

// Firebase's action-code errors, in words staff can act on.
function linkErrorMessage(err) {
  switch (err?.code) {
    case 'auth/expired-action-code': return 'This link has expired. Links work for about an hour.';
    case 'auth/invalid-action-code': return 'This link has already been used, or a newer one was sent. Only the latest link works.';
    case 'auth/user-disabled': return 'This account has been switched off. Contact the school office.';
    case 'auth/user-not-found': return "This account doesn't exist any more. Contact the school office.";
    case 'auth/weak-password': return `Choose a longer password: at least ${MIN_PASSWORD} characters.`;
    case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
    default: return "Something went wrong. Go back to sign-in and ask for a new link.";
  }
}

function Card({ children }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-brand-bg text-brand-text">
      <div className="w-full max-w-md p-8 bg-brand-card border border-brand-card-border rounded-2xl shadow-lg">
        <div className="flex justify-center mb-8">
          <img src="/logo-white.png" alt="Abhishri Logo" className="h-16 object-contain hidden dark:block" />
          <img src="/logo-coral.png" alt="Abhishri Logo" className="h-16 object-contain block dark:hidden" />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Where the links in Firebase's emails land (/auth/action; the project's email action
 * URL points here instead of Firebase's generic page).
 *
 * - resetPassword: "First time here, or forgot your password?" on the staff sign-in, or an admin's "Send
 *   password setup email". Most people arriving here have never had a password, so it
 *   says "Set your password". Saving also confirms the email (which is what unlocks the
 *   staff record), then signs them straight in.
 * - verifyEmail: the "Confirm your email" screen's link. Confirms, refreshes the session
 *   so the new status reaches the security rules, and opens the workspace.
 */
export default function AuthAction() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const code = params.get('oobCode');

  const usable = !!code && (mode === 'resetPassword' || mode === 'verifyEmail');
  const [phase, setPhase] = useState(usable ? 'checking' : 'failed'); // checking | form | working | done | failed
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(usable ? null : linkErrorMessage({ code: 'auth/invalid-action-code' }));

  useEffect(() => {
    if (!usable) return;
    if (mode === 'resetPassword') {
      verifyPasswordResetCode(auth, code)
        .then((address) => { setEmail(address); setPhase('form'); })
        .catch((err) => { setError(linkErrorMessage(err)); setPhase('failed'); });
    } else if (mode === 'verifyEmail') {
      (async () => {
        try {
          await applyActionCode(auth, code);
          if (auth.currentUser) {
            await auth.currentUser.reload();
            await auth.currentUser.getIdToken(true);
            // A full load so AuthContext looks the record up again with the new token.
            window.location.replace('/');
            return;
          }
          setPhase('done');
        } catch (err) {
          setError(linkErrorMessage(err));
          setPhase('failed');
        }
      })();
    }
  }, [usable, mode, code]);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(linkErrorMessage({ code: 'auth/weak-password' }));
      return;
    }
    setPhase('working');
    try {
      await confirmPasswordReset(auth, code, password);
    } catch (err) {
      setError(linkErrorMessage(err));
      setPhase(err?.code === 'auth/weak-password' ? 'form' : 'failed');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/', { replace: true });
    } catch {
      // The password is saved; only the automatic sign-in failed. Let them do it.
      setPhase('done');
    }
  };

  const toSignIn = () => navigate('/', { replace: true });
  const primaryButton = 'w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-70';

  if (phase === 'checking') {
    return <Card><p className="text-center text-brand-text-dim text-sm">Checking your link...</p></Card>;
  }

  if (phase === 'failed') {
    return (
      <Card>
        <div className="text-center space-y-5">
          <h1 className="text-2xl font-bold">This link didn't work</h1>
          <div role="alert" className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 border border-red-100 dark:border-red-800/50 text-left">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <p className="text-sm text-brand-text-dim">
            {mode === 'verifyEmail'
              ? 'Sign in again and press "Email me a link" for a new one.'
              : 'On the sign-in page choose Staff, type your email and press "First time here, or forgot your password?" for a new link.'}
          </p>
          <button onClick={toSignIn} className={primaryButton}>Go to sign-in</button>
        </div>
      </Card>
    );
  }

  if (phase === 'done') {
    return (
      <Card>
        <div className="text-center space-y-5">
          <CheckCircle2 size={40} className="mx-auto text-green-500" />
          <h1 className="text-2xl font-bold">{mode === 'verifyEmail' ? 'Email confirmed' : 'Password saved'}</h1>
          <p className="text-sm text-brand-text-dim">
            {mode === 'verifyEmail'
              ? 'Sign in to open the workspace.'
              : `Sign in as Staff with ${email} and your new password.`}
          </p>
          <button onClick={toSignIn} className={primaryButton}>Go to sign-in</button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold text-center">Set your password</h1>
      <p className="text-brand-text-dim mt-2 text-sm text-center">for <span className="font-semibold text-brand-text">{email}</span></p>

      {error && (
        <div role="alert" className="mt-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 border border-red-100 dark:border-red-800/50">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={save} className="space-y-5 mt-6">
        <div>
          <label htmlFor="new-password" className="block text-sm font-semibold mb-2">New password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={18} />
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2.5 pl-10 pr-11 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text"
              autoFocus
              required
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-brand-text-dim hover:text-brand-text"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-xs text-brand-text-dim mt-2">At least {MIN_PASSWORD} characters. You'll use this with your email to sign in as Staff.</p>
        </div>
        <button type="submit" disabled={phase === 'working'} className={primaryButton}>
          {phase === 'working' ? 'Saving...' : 'Save and sign in'}
        </button>
      </form>
    </Card>
  );
}
