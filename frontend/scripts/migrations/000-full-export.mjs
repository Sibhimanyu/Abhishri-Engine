/**
 * Complete offload of the Firestore database to local JSON.
 *
 * Run this BEFORE any migration that changes meaning rather than merely adding
 * fields. It is deliberately independent of Firestore's own backup machinery: the
 * output is plain JSON that can be inspected in an editor, diffed, grepped, and
 * restored without GCP tooling or a working Firebase login.
 *
 * Walks every root collection and recurses into every subcollection, so nothing is
 * missed as the schema grows. Records each document's createTime/updateTime as well
 * as its fields, because those metadata are themselves data (recordedAt was derived
 * from createTime in migration 001).
 *
 * USAGE
 *   node 000-full-export.mjs                 # writes .migration-snapshots/full-export-<ts>/
 *   node 000-full-export.mjs --verify <dir>  # re-reads the DB and diffs against an export
 */
import os from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const PROJECT = 'abhishri-academy';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOKEN = JSON.parse(
  readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8')
).tokens.access_token;

async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${method} ${url.slice(0, 120)} :: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/** Raw Firestore value shapes are preserved verbatim — this export is for restore, not display. */
async function listCollectionIds(parentPath = '') {
  const url = `${BASE}${parentPath ? '/' + parentPath : ''}:listCollectionIds`;
  const out = await api(url, 'POST', { pageSize: 300 });
  return out.collectionIds || [];
}

async function listDocuments(collPath) {
  const docs = [];
  let pageToken;
  do {
    const url = `${BASE}/${collPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const out = await api(url);
    (out.documents || []).forEach((d) => docs.push(d));
    pageToken = out.nextPageToken;
  } while (pageToken);
  return docs;
}

async function walk(parentPath, acc, depth = 0) {
  if (depth > 6) return; // guard against pathological nesting
  const collections = await listCollectionIds(parentPath);
  for (const coll of collections) {
    const collPath = parentPath ? `${parentPath}/${coll}` : coll;
    const docs = await listDocuments(collPath);
    for (const d of docs) {
      const relPath = d.name.split('/documents/')[1];
      acc.push({
        path: relPath,
        collection: collPath,
        createTime: d.createTime,
        updateTime: d.updateTime,
        fields: d.fields || {},
      });
      await walk(relPath, acc, depth + 1);
    }
    // An empty collection still matters structurally; note it.
    if (!docs.length) acc.push({ path: collPath, collection: collPath, empty: true });
  }
}

const verifyIdx = process.argv.indexOf('--verify');

const all = [];
process.stdout.write('walking database');
await walk('', all);
process.stdout.write('\n');

const realDocs = all.filter((d) => !d.empty);
const byCollection = {};
realDocs.forEach((d) => {
  byCollection[d.collection] = (byCollection[d.collection] || 0) + 1;
});

console.log('\n--- collections ---');
Object.entries(byCollection)
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => console.log(`  ${String(n).padStart(5)}  ${c}`));
console.log(`\ntotal documents: ${realDocs.length}`);

if (verifyIdx !== -1) {
  const dir = process.argv[verifyIdx + 1];
  const prev = JSON.parse(readFileSync(`${dir}/documents.json`, 'utf8'));
  const prevByPath = new Map(prev.filter((d) => !d.empty).map((d) => [d.path, d]));
  const problems = [];
  for (const d of realDocs) {
    const p = prevByPath.get(d.path);
    if (!p) { problems.push(`NEW since export: ${d.path}`); continue; }
    const lost = Object.keys(p.fields).filter((f) => !(f in d.fields));
    if (lost.length) problems.push(`${d.path} LOST: ${lost.join(', ')}`);
    prevByPath.delete(d.path);
  }
  prevByPath.forEach((_, path) => problems.push(`MISSING since export: ${path}`));
  console.log(`\n--- verify against ${dir} ---`);
  if (!problems.length) console.log('  no documents lost, no fields lost.');
  else problems.slice(0, 40).forEach((p) => console.log('  ! ' + p));
  process.exit(problems.length ? 1 : 0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = `.migration-snapshots/full-export-${stamp}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/documents.json`, JSON.stringify(all, null, 1));
writeFileSync(
  `${dir}/manifest.json`,
  JSON.stringify({ project: PROJECT, exportedAt: new Date().toISOString(), documentCount: realDocs.length, byCollection }, null, 1)
);
console.log(`\nwritten to ${dir}/`);
console.log('  documents.json  full fidelity (raw Firestore value shapes + createTime/updateTime)');
console.log('  manifest.json   counts per collection');
console.log(`\nverify later with:  node 000-full-export.mjs --verify ${dir}`);
