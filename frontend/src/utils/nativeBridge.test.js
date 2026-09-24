import { describe, it, expect, vi, beforeEach } from 'vitest';

// The Firebase JS SDK calls the native app replays its sign-in through.
vi.mock('firebase/auth', () => ({
  signInWithCredential: vi.fn(async () => ({ user: { uid: 'google-uid' } })),
  signInWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'email-uid' } })),
  signOut: vi.fn(async () => {}),
  GoogleAuthProvider: { credential: vi.fn((id, access) => ({ id, access })) },
}));

// The suite runs in Node (no DOM library installed), so stand in for the few window
// features the bridge touches: location, history.pushState and a popstate event.
class FakeWindow extends EventTarget {
  location = { pathname: '/', search: '' };
  history = {
    pushState: (_state, _title, path) => {
      const [pathname, query] = String(path).split('?');
      this.location.pathname = pathname;
      this.location.search = query ? `?${query}` : '';
    },
  };
}
globalThis.window = new FakeWindow();
globalThis.PopStateEvent = class PopStateEvent extends Event {};

import { installNativeBridge } from './nativeBridge';
import { signInWithCredential, signInWithEmailAndPassword, signOut, GoogleAuthProvider } from 'firebase/auth';

/**
 * The contract the iOS app relies on (frontend/ios/App/App/CapacitorWebHost.swift):
 * window.AbhishriNative with version >= 1 and these methods. Renaming any of them
 * silently breaks the hand-off, so they are pinned here.
 */
describe('nativeBridge', () => {
  let auth;
  beforeEach(() => {
    vi.clearAllMocks();
    auth = { currentUser: null };
    installNativeBridge(auth);
  });

  it('exposes the versioned contract', () => {
    expect(window.AbhishriNative.version).toBeGreaterThanOrEqual(1);
    for (const m of ['currentUid', 'signInWithGoogle', 'signInWithEmail', 'signOut', 'navigate']) {
      expect(typeof window.AbhishriNative[m]).toBe('function');
    }
  });

  it('reports the web session uid so the native side can skip a redundant hand-off', () => {
    expect(window.AbhishriNative.currentUid()).toBeNull();
    auth.currentUser = { uid: 'abc' };
    expect(window.AbhishriNative.currentUid()).toBe('abc');
  });

  it('signs in with a native Google credential and returns the uid', async () => {
    await expect(window.AbhishriNative.signInWithGoogle('id-token', 'access-token')).resolves.toBe('google-uid');
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('id-token', 'access-token');
    expect(signInWithCredential).toHaveBeenCalledWith(auth, { id: 'id-token', access: 'access-token' });
  });

  it('signs in with email and password', async () => {
    await expect(window.AbhishriNative.signInWithEmail('a@b.c', 'pw')).resolves.toBe('email-uid');
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'a@b.c', 'pw');
  });

  it('signs the web session out', async () => {
    await window.AbhishriNative.signOut();
    expect(signOut).toHaveBeenCalledWith(auth);
  });

  it('navigates client-side through popstate, and ignores the current route', () => {
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);
    window.AbhishriNative.navigate('/fee-collection/preschool/stu1');
    expect(window.location.pathname).toBe('/fee-collection/preschool/stu1');
    expect(onPop).toHaveBeenCalledTimes(1);
    window.AbhishriNative.navigate('/fee-collection/preschool/stu1');
    expect(onPop).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', onPop);
  });
});
