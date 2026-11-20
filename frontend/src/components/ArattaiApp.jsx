import React, { useEffect, useState, lazy, Suspense } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { AlertCircle, XCircle, MessageCircle } from 'lucide-react';
import { auth, functions } from '../firebase';
import { Spinner } from './Spinner';

const ParentPortal = lazy(() => import('./ParentPortal'));
const startMiniApp = httpsCallable(functions, 'startArattaiMiniApp');

/**
 * The parent mini app: Arattai opens /arattai-app inside a chat with ?user_data_key=<key>
 * (single use, valid one minute). The server swaps the key for a Firebase custom token for
 * that parent's number (functions/src/arattai/miniapp.js), and the normal parent portal
 * shows with no SMS code. Runs in Arattai's in-app webview, so everything is mobile-first.
 */

// The key is read and removed from the address bar once per page load, outside React, so
// StrictMode's second effect run (and any re-render) doesn't see an empty URL and give up.
let startup = null;
function begin() {
  if (startup) return startup;
  const url = new URL(window.location.href);
  const key = url.searchParams.get('user_data_key');
  if (url.searchParams.has('user_data_key')) {
    url.searchParams.delete('user_data_key');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  startup = (async () => {
    if (!key) {
      await auth.authStateReady();
      if (!auth.currentUser) return { state: 'expired' };
      const claims = (await auth.currentUser.getIdTokenResult()).claims;
      return claims.via === 'arattai' ? { state: 'portal' } : { state: 'expired' };
    }
    try {
      const res = (await startMiniApp({ key })).data;
      if (!res.ok) return { state: 'not-registered', name: res.name || '' };
      await signInWithCustomToken(auth, res.token);
      return { state: 'portal' };
    } catch (err) {
      const code = err?.code || '';
      if (code === 'functions/not-found' || code === 'functions/invalid-argument') return { state: 'expired' };
      console.error('Arattai mini app failed', err);
      return { state: 'error' };
    }
  })();
  return startup;
}

function Message({ icon: Icon, tone = 'text-red-500', title, children }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-brand-bg text-brand-text px-6 py-10 text-center">
      <img src="/logo-coral.png" alt="Abhishri Academy" className="h-12 object-contain mb-8 block dark:hidden" />
      <img src="/logo-white.png" alt="Abhishri Academy" className="h-12 object-contain mb-8 hidden dark:block" />
      <Icon className={`${tone} mb-4`} size={52} />
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-brand-text-dim max-w-sm text-base leading-relaxed">{children}</p>
    </div>
  );
}

export default function ArattaiApp() {
  const [result, setResult] = useState(null);

  useEffect(() => {
    let live = true;
    begin().then((r) => { if (live) setResult(r); });
    return () => { live = false; };
  }, []);

  // Signing out of the portal returns to the "open it again from Arattai" screen.
  useEffect(() => {
    if (result?.state !== 'portal') return undefined;
    return onAuthStateChanged(auth, (user) => { if (!user) setResult({ state: 'expired' }); });
  }, [result?.state]);

  if (!result) {
    return <div className="h-dvh flex items-center justify-center bg-brand-bg"><Spinner /></div>;
  }
  if (result.state === 'portal') {
    return <Suspense fallback={<div className="h-dvh flex items-center justify-center bg-brand-bg"><Spinner /></div>}><ParentPortal /></Suspense>;
  }
  if (result.state === 'not-registered') {
    return (
      <Message icon={XCircle} title={result.name ? `Hi ${result.name}` : 'Hi'}>
        This Arattai number isn't linked to a student at Abhishri Academy. Please contact the school.
      </Message>
    );
  }
  if (result.state === 'expired') {
    return (
      <Message icon={MessageCircle} tone="text-brand-primary" title="This link has expired">
        Please open the app again from the Abhishri Academy chat in Arattai.
      </Message>
    );
  }
  return (
    <Message icon={AlertCircle} title="Something went wrong">
      We couldn't open your details. Check your internet connection, then open the app again from the Abhishri Academy chat in Arattai.
    </Message>
  );
}
