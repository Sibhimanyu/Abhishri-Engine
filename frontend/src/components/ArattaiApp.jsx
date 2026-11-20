import React, { useEffect, useState, lazy, Suspense } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { AlertCircle, MessageCircle, Globe, Phone, Sparkles } from 'lucide-react';
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
  // Read the session key from ? or #, under the name Arattai uses or a near one.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  // Arattai actually sends ?miniappsession_id= (its docs say user_data_key).
  const NAMES = ['miniappsession_id', 'user_data_key', 'userDataKey', 'user_data', 'key'];
  const found = NAMES.map((n) => url.searchParams.get(n) || hash.get(n)).find(Boolean) || '';
  const key = found.trim();
  // Only the parameter names (never values) go on the error screen, to diagnose a bad link.
  const seen = [...url.searchParams.keys(), ...hash.keys()];
  if (seen.length) window.history.replaceState(window.history.state, '', url.pathname);
  startup = (async () => {
    if (!key) {
      await auth.authStateReady();
      const why = `no-key${seen.length ? ` (${seen.join(', ')})` : ''}`;
      if (!auth.currentUser) return { state: 'expired', why };
      const claims = (await auth.currentUser.getIdTokenResult()).claims;
      return claims.via === 'arattai' ? { state: 'portal' } : { state: 'expired', why };
    }
    try {
      const res = (await startMiniApp({ key })).data;
      if (!res.ok) return { state: 'not-registered', name: res.name || '' };
      await signInWithCustomToken(auth, res.token);
      return { state: 'portal' };
    } catch (err) {
      const code = err?.code || '';
      if (code === 'functions/not-found') return { state: 'expired', why: 'key-not-found' };
      if (code === 'functions/invalid-argument') return { state: 'expired', why: `bad-key (${key.length})` };
      console.error('Arattai mini app failed', err);
      return { state: 'error', why: [code, err?.message].filter(Boolean).join(': ') || 'unknown' };
    }
  })();
  return startup;
}

function Message({ icon: Icon, tone = 'text-red-500', title, code, children }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-brand-bg text-brand-text px-6 py-10 text-center">
      <img src="/logo-coral.png" alt="Abhishri Academy" className="h-12 object-contain mb-8 block dark:hidden" />
      <img src="/logo-white.png" alt="Abhishri Academy" className="h-12 object-contain mb-8 hidden dark:block" />
      <Icon className={`${tone} mb-4`} size={52} />
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-brand-text-dim max-w-sm text-base leading-relaxed">{children}</p>
      {code && <p className="mt-6 text-[11px] text-brand-text-dim/70 font-mono">Code: {code}</p>}
    </div>
  );
}

// Shown to anyone whose Arattai number isn't a parent's: a warm welcome and a way into admissions.
const SCHOOL = { site: 'https://abhishriacademy.in', phone: '+919566562440', phoneLabel: '+91 95665 62440' };

function Welcome({ name }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-brand-bg text-brand-text px-6 py-10 text-center">
      <img src="/logo-coral.png" alt="Abhishri Academy" className="h-12 object-contain mb-8 block dark:hidden" />
      <img src="/logo-white.png" alt="Abhishri Academy" className="h-12 object-contain mb-8 hidden dark:block" />
      <Sparkles className="text-brand-primary mb-4" size={44} />
      <h1 className="text-2xl font-bold mb-2">{name ? `Welcome, ${name}!` : 'Welcome!'}</h1>
      <p className="text-brand-text-dim max-w-sm text-base leading-relaxed">
        This is the parent portal for families at Abhishri Academy. Once your child is enrolled, you'll see their attendance, fees, school calendar and weekly menu right here.
      </p>
      <div className="mt-8 w-full max-w-sm rounded-2xl border border-brand-card-border bg-brand-card p-5 text-left">
        <p className="font-bold">Planning admissions?</p>
        <p className="text-sm text-brand-text-dim mt-1">Tamil Nadu's first neuroeducation-based preschool, in Dharapuram. Come and see us.</p>
        <div className="mt-4 flex flex-col gap-2">
          <a href={SCHOOL.site} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-brand-primary text-white font-bold py-3">
            <Globe size={18} /> Visit our website
          </a>
          <a href={`tel:${SCHOOL.phone}`} className="flex items-center justify-center gap-2 rounded-xl border border-brand-card-border font-bold py-3">
            <Phone size={18} /> Call {SCHOOL.phoneLabel}
          </a>
        </div>
      </div>
      <p className="mt-6 text-xs text-brand-text-dim max-w-sm">
        Already enrolled? Your Arattai number may differ from the one the school has. Message us in this chat and we'll update it.
      </p>
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
      <Welcome name={result.name} />
    );
  }
  if (result.state === 'expired') {
    return (
      <Message icon={MessageCircle} tone="text-brand-primary" title="This link has expired" code={result.why}>
        Please open the app again from the Abhishri Academy chat in Arattai.
      </Message>
    );
  }
  return (
    <Message icon={AlertCircle} title="Something went wrong" code={result.why}>
      We couldn't open your details. Check your internet connection, then open the app again from the Abhishri Academy chat in Arattai.
    </Message>
  );
}
