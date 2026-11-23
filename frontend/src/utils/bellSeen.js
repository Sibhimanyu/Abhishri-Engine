// Which bell notifications the person has already looked at, remembered per device.
// Opening the bell marks everything in it as seen: the notifications stay listed, but the
// bell stops calling (no coloured pill, no blink) until something new or changed arrives.
// An entry is "the same" only if its key and its text match, so "2 unread chats" becoming
// "3 unread chats" calls again.

const STORAGE_KEY = 'bell-seen-v1';

/** What identifies one notification's current state. */
export const fingerprint = (entry) => `${entry.key}\u0000${entry.text ?? ''}`;

/** Entries the person hasn't seen yet. */
export const unseenEntries = (entries, seen) => entries.filter(e => !seen.has(fingerprint(e)));

/** The seen set after opening the bell: exactly what's showing now (older ones drop off). */
export const markAllSeen = (entries) => new Set(entries.map(fingerprint));

export function loadSeen(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function saveSeen(seen, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Private mode or full storage: the bell just calls again next time.
  }
}
