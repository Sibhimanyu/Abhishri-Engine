// node --test src/shared/pendingEvents.test.js
const test = require("node:test");
const assert = require("node:assert");
const { savePending, drainPending } = require("./pendingEvents");

// Tiny RTDB fake: push/once/remove over a path -> value map.
function fakeDb() {
  const data = {};
  let n = 0;
  const refAt = (path) => ({
    child: (k) => refAt(`${path}/${k}`),
    push: async (v) => { data[`${path}/k${String(++n).padStart(4, "0")}`] = v; },
    remove: async () => { delete data[path]; },
    once: async () => {
      const keys = Object.keys(data).filter((k) => k.startsWith(`${path}/`));
      return { exists: () => keys.length > 0, forEach: (fn) => keys.forEach((k) => fn({ ref: refAt(k), val: () => data[k] })) };
    },
  });
  return { ref: refAt, data };
}

test("parked events are replayed oldest first, then deleted", async () => {
  const db = fakeDb();
  await savePending(db, "p", ["wamid.A", "REQ1"], "status", { status: "read" });
  await savePending(db, "p", ["wamid.A"], "reaction", { emoji: "x" });
  const seen = [];
  const n = await drainPending(db, "p", ["wamid.A"], (kind, d) => seen.push(kind));
  assert.strictEqual(n, 2);
  assert.deepStrictEqual(seen, ["status", "reaction"]);
  assert.ok(!Object.keys(db.data).some((k) => k.startsWith("p/wamid_A/")));
  assert.ok(Object.keys(db.data).some((k) => k.startsWith("p/REQ1/")));
});

test("an event whose apply throws stays parked", async () => {
  const db = fakeDb();
  await savePending(db, "p", ["A"], "status", { status: "sent" });
  assert.strictEqual(await drainPending(db, "p", ["A"], () => { throw new Error("boom"); }), 0);
  assert.strictEqual(Object.keys(db.data).length, 1);
  assert.strictEqual(await drainPending(db, "p", ["B"], () => {}), 0);
});
