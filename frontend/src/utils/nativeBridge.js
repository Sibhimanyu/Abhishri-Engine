// The hooks the native iOS app calls into its embedded web view.
//
// The iOS app's everyday screens (attendance, students, fees) are SwiftUI and sign in
// with the native Firebase SDK; everything else is this web app, shown inside it. The
// two SDKs keep separate sessions, so the native side hands its sign-in over here
// once, right after the user signs in, and the web session then persists on its own
// (IndexedDB). See frontend/ios/App/AbhishriKit and docs/ios-app.md.
//
// Only installed inside the iOS app. The native side checks `version` and does
// nothing when the hooks are missing (an older deploy), so either can ship first.
import { signInWithCredential, signInWithEmailAndPassword, signOut, GoogleAuthProvider } from 'firebase/auth';

export function installNativeBridge(auth) {
  window.AbhishriNative = {
    version: 1,

    /** uid of the web session, or null. Lets the native side skip a redundant hand-off. */
    currentUid: () => auth.currentUser?.uid || null,

    /** Hand over a native Google sign-in. Resolves to the web session's uid. */
    signInWithGoogle: async (idToken, accessToken) => {
      const cred = GoogleAuthProvider.credential(idToken || null, accessToken || null);
      const { user } = await signInWithCredential(auth, cred);
      return user.uid;
    },

    /** Hand over a native email/password sign-in (held only in memory on the native side). */
    signInWithEmail: async (email, password) => {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      return user.uid;
    },

    signOut: () => signOut(auth),

    /**
     * Open a route without reloading, e.g. '/fee-collection/preschool/<id>'.
     * BrowserRouter listens for popstate, so pushing state and firing it is a
     * client-side navigation.
     */
    navigate: (path) => {
      if (window.location.pathname + window.location.search === path) return;
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
  };
}
