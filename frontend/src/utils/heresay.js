// Heresay, the in-app Report button. Its script tag in index.html is deferred and runs
// after the app starts, so calls made early wait for the tag's load event.

/** Runs fn(window.Heresay) now, or once the SDK has loaded. Returns a cancel function. */
export function withHeresay(fn) {
  if (window.Heresay) {
    fn(window.Heresay);
    return () => {};
  }
  const tag = document.querySelector('script[src*="/sdk/v1.js"][data-key]');
  if (!tag) return () => {};
  const onLoad = () => { if (window.Heresay) fn(window.Heresay); };
  tag.addEventListener('load', onLoad, { once: true });
  return () => tag.removeEventListener('load', onLoad);
}

/** Tells Heresay who is signed in (so reporters aren't asked their name); none clears it. */
export function identifyForHeresay(user, userData) {
  return withHeresay((h) => {
    if (!user) return h.identify();
    h.identify({
      id: user.uid,
      label: userData?.displayName || user.displayName || user.email || user.phoneNumber || undefined,
      email: user.email || undefined,
    });
  });
}
