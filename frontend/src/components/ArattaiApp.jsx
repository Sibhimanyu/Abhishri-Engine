import React, { useEffect, useState, lazy, Suspense } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { AlertCircle, MessageCircle, Globe, Phone, Sparkles, RefreshCw } from 'lucide-react';
import { auth, functions } from '../firebase';

const ParentPortal = lazy(() => import('./ParentPortal'));
const startMiniApp = httpsCallable(functions, 'startArattaiMiniApp');

/**
 * The parent mini app: Arattai opens /arattai-app inside a chat with ?user_data_key=<key>
 * (single use, valid one minute). The server swaps the key for a Firebase custom token for
 * that parent's number (functions/src/arattai/miniapp.js), and the normal parent portal
 * shows. This is the only way parents sign in. Runs in Arattai's in-app webview, so everything is mobile-first.
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
      if (!res.ok && res.reason === 'no-phone') return { state: 'no-phone' };
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

function Logo({ className = 'h-10' }) {
  return (
    <>
      <img src="/logo-coral.png" alt="Abhishri Academy" className={`${className} w-auto object-contain block dark:hidden`} />
      <img src="/logo-white.png" alt="Abhishri Academy" className={`${className} w-auto object-contain hidden dark:block`} />
    </>
  );
}

// Branded splash: the same frame as the inline one in index.html, so the hand-off is invisible.
function Splash() {
  return (
    <div className="h-dvh flex items-center justify-center bg-brand-bg" aria-busy="true" aria-label="Opening">
      <div className="animate-splash"><Logo className="h-[72px]" /></div>
    </div>
  );
}

function Screen({ children }) {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-brand-bg text-brand-text px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className="min-h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto animate-portal-in">{children}</div>
    </div>
  );
}

function Message({ icon: Icon, tone = 'text-red-500', title, code, children }) {
  return (
    <Screen>
      <Logo className="h-10 mb-8" />
      <div className="size-16 rounded-full bg-brand-card border border-brand-card-border flex items-center justify-center mb-5 shadow-sm"><Icon className={tone} size={30} /></div>
      <h1 className="text-xl font-bold mb-2 tracking-tight">{title}</h1>
      <p className="text-brand-text-dim text-base leading-relaxed selectable">{children}</p>
      <button onClick={() => window.location.reload()} className="mt-8 min-h-12 px-6 rounded-full bg-brand-primary text-white font-bold flex items-center gap-2 active:scale-95 transition-transform">
        <RefreshCw size={18} /> Try again
      </button>
      {code && <p className="mt-6 text-[11px] text-brand-text-dim/70 font-mono selectable">Code: {code}</p>}
    </Screen>
  );
}

// Shown to anyone whose Arattai number isn't a parent's: a warm welcome and a way into admissions.
const SCHOOL = { site: 'https://abhishriacademy.in', phone: '+919566562440', phoneLabel: '+91 95665 62440' };

function Welcome({ name }) {
  return (
    <Screen>
      <Logo className="h-10 mb-8" />
      <div className="size-16 rounded-full bg-brand-primary/10 flex items-center justify-center mb-5"><Sparkles className="text-brand-primary" size={30} /></div>
      <h1 className="text-2xl font-black tracking-tight mb-2">{name ? `Welcome, ${name}!` : 'Welcome!'}</h1>
      <p className="text-brand-text-dim text-base leading-relaxed selectable">
        This is the parent portal for families at Abhishri Academy. Once your child is enrolled, you'll see their attendance, school calendar and weekly menu right here.
      </p>
      <section className="mt-8 w-full rounded-3xl border border-brand-card-border bg-brand-card p-5 text-left shadow-sm">
        <h2 className="font-bold">Planning admissions?</h2>
        <p className="text-sm text-brand-text-dim mt-1 selectable">Tamil Nadu's first neuroeducation-based preschool, in Dharapuram. Come and see us.</p>
        <div className="mt-4 flex flex-col gap-2">
          <a href={SCHOOL.site} target="_blank" rel="noreferrer" className="min-h-12 flex items-center justify-center gap-2 rounded-2xl bg-brand-primary text-white font-bold active:scale-[0.97] transition-transform">
            <Globe size={18} /> Visit our website
          </a>
          <a href={`tel:${SCHOOL.phone}`} className="min-h-12 flex items-center justify-center gap-2 rounded-2xl border border-brand-card-border font-bold active:scale-[0.97] transition-transform">
            <Phone size={18} /> Call {SCHOOL.phoneLabel}
          </a>
        </div>
      </section>
      <p className="mt-6 text-xs text-brand-text-dim selectable">
        Already enrolled? Your Arattai number may differ from the one the school has. Message us in this chat and we'll update it.
      </p>
    </Screen>
  );
}

export default function ArattaiApp() {
  const [result, setResult] = useState(null);

  useEffect(() => {
    let live = true;
    begin().then((r) => { if (live) setResult(r); });
    return () => { live = false; };
  }, []);

  // Follow the phone's light/dark setting live; there is no in-app toggle.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle('dark', mq.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mq.matches ? '#0d1117' : '#F8FAFC');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  if (!result) {
    return <Splash />;
  }
  if (result.state === 'portal') {
    return <Suspense fallback={<Splash />}><ParentPortal /></Suspense>;
  }
  if (result.state === 'no-phone') {
    return (
      <Message icon={Phone} tone="text-brand-primary" title="We need your phone number">
        Arattai didn't share your phone number. Close the app, open it again and allow Abhishri Academy to see your number.
      </Message>
    );
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
