// node --test src/arattai/miniapp.test.js
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

// Keep the module graph loadable without credentials.
const { toE164 } = require(path.join(__dirname, "miniapp.js"));
const { callerPhone } = require(path.join(__dirname, "..", "students", "portal.js"));

test("toE164 converts Arattai's phone format", async () => {
  assert.strictEqual(await toE164("91-9999999911"), "+919999999911");
  assert.strictEqual(await toE164("91-6999999911"), "+916999999911");
  assert.strictEqual(await toE164("+91-9999999911"), "+919999999911");
});

test("toE164 rejects junk", async () => {
  assert.strictEqual(await toE164(""), null);
  assert.strictEqual(await toE164(undefined), null);
  assert.strictEqual(await toE164("91-1234567890"), null);
  assert.strictEqual(await toE164("abc"), null);
});

const tok = (token) => ({ uid: "u", token });

test("callerPhone accepts phone sign-in", () => {
  assert.strictEqual(callerPhone(tok({ phone_number: "+919999999911", firebase: { sign_in_provider: "phone" } })), "+919999999911");
});

test("callerPhone accepts an Arattai custom token", () => {
  assert.strictEqual(callerPhone(tok({ portalPhone: "+919999999911", via: "arattai", firebase: { sign_in_provider: "custom" } })), "+919999999911");
});

test("callerPhone refuses other sessions", () => {
  assert.throws(() => callerPhone(null));
  assert.throws(() => callerPhone(tok({ portalPhone: "+919999999911", firebase: { sign_in_provider: "custom" } })));
  assert.throws(() => callerPhone(tok({ portalPhone: "+919999999911", via: "arattai", firebase: { sign_in_provider: "google.com" } })));
  assert.throws(() => callerPhone(tok({ email: "a@b.c", firebase: { sign_in_provider: "google.com" } })));
});
