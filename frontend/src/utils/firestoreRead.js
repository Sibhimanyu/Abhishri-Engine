import {
  getDoc as serverGetDoc,
  getDocs as serverGetDocs,
  getDocFromCache,
  getDocsFromCache,
} from 'firebase/firestore';
import { reconnectFirestore } from '../firebase';

// Drop-in getDoc/getDocs for screens that only display data.
//
// The SDK's own getDoc/getDocs wait for the server, and only fall back to the local cache
// once it decides the device is offline. A connection that silently stalls — after the
// laptop sleeps, on a Wi-Fi switch, on patchy mobile data — never looks offline, so the
// read just hangs and the screen spins forever, even though the data is sitting in the
// IndexedDB cache. These wait SLOW_MS for the server, then answer from the cache and
// rebuild the stuck connection so the next read is fresh again. With nothing cached they
// give up after GIVE_UP_MS with an error, so a screen can show "try again" instead.
//
// Not for read-before-write checks (voids, uniqueness): those must see the server.

const SLOW_MS = 2500;
const GIVE_UP_MS = 15000;

const WAITED = Symbol('waited');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms, WAITED));

async function readWithFallback(fromServer, fromCache, hasData, what) {
  const server = fromServer();
  // Keep a late rejection from surfacing as "unhandled" once we've moved on.
  server.catch(() => {});

  const first = await Promise.race([server, wait(SLOW_MS)]);
  if (first !== WAITED) return first;

  const cached = await fromCache().catch(() => null);
  const reconnected = reconnectFirestore();
  if (cached && hasData(cached)) return cached;

  // Taking the connection down makes the pending read fail as "client is offline"; that
  // is our doing, not an answer, so ask the server again once it is back up.
  const retried = server.catch(() => reconnected.then(fromServer));
  retried.catch(() => {});
  const late = await Promise.race([retried, wait(GIVE_UP_MS - SLOW_MS)]);
  if (late !== WAITED) return late;
  throw new Error(`Timed out loading ${what} — check your connection and try again.`);
}

export function getDoc(ref) {
  return readWithFallback(
    () => serverGetDoc(ref),
    () => getDocFromCache(ref),
    () => true, // a cached "doesn't exist" is still an answer
    ref.path,
  );
}

export function getDocs(query) {
  return readWithFallback(
    () => serverGetDocs(query),
    () => getDocsFromCache(query),
    // An empty cache result usually means "never fetched", not "no documents".
    (snap) => !snap.empty,
    query.path || 'data',
  );
}
