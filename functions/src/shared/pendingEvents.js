// Provider events (delivery receipts, reactions) that arrive before the message they belong to
// has been filed: the send callable only learns the provider id after the provider call returns,
// and a fast webhook can beat it. Parked under `<collection>/<providerId>/<pushKey>` in RTDB
// (server only: database.rules.json denies clients) and replayed by the send code once the
// message and its id are written. Pure helpers, tested in pendingEvents.test.js.

const safeId = (id) => String(id).replace(/[.#$/[\]]/g, "_");

/** Park an event for each of the provider ids it might be known by. kind: "status" | "reaction". */
async function savePending(db, collection, ids, kind, data) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  const event = { kind, data: JSON.parse(JSON.stringify(data)), createdAt: Date.now() };
  await Promise.all(unique.map((id) => db.ref(`${collection}/${safeId(id)}`).push(event)));
  return unique.length > 0;
}

/**
 * Replay what is parked for any of `ids`: `apply(kind, data)` for each, oldest first, then delete
 * it. An event whose apply throws stays parked. Returns how many were applied.
 */
async function drainPending(db, collection, ids, apply) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  let applied = 0;
  for (const id of unique) {
    const snap = await db.ref(`${collection}/${safeId(id)}`).once("value");
    if (!snap.exists()) continue;
    const events = [];
    snap.forEach((c) => { events.push({ ref: c.ref, ...c.val() }); });
    events.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (const ev of events) {
      try {
        await apply(ev.kind, ev.data);
        await ev.ref.remove();
        applied++;
      } catch (err) {
        console.warn("Pending event could not be applied", id, err.message);
      }
    }
  }
  return applied;
}

module.exports = { savePending, drainPending, safeId };
