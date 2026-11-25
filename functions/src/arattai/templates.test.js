// node --test src/arattai/templates.test.js
const test = require("node:test");
const assert = require("node:assert");
const { parseRow, staffEventOf, toMillis } = require("./templates");

const full = {
  data: {
    id: 77, name: "fee_reminder_notice", type: "transaction", language: "en", status: "enabled",
    description: "Reminds a parent that a fee payment is due.",
    modified_time: 1790000000,
    translations: [{
      language: "en",
      draft: {
        status: "rejected", rejection_reason: "Too promotional",
        message: { title: "Fee reminder", body: "Hello {{name}}, fee due.", footer: "Abhishri" },
        place_holders: [{ name: "name", type: "string", sample_value: "Meena" }],
      },
      published: { status: "approved", message: { body: "Old body" }, place_holders: [] },
    }],
  },
};

test("parseRow reads the draft and the rejection reason", () => {
  const r = parseRow(full);
  assert.equal(r.id, "77");
  assert.equal(r.status, "rejected");
  assert.equal(r.reason, "Too promotional");
  assert.equal(r.body, "Hello {{name}}, fee due.");
  assert.equal(r.footer, "Abhishri");
  assert.deepEqual(r.placeholders, [{ name: "name", sample: "Meena" }]);
  assert.equal(r.enabled, true);
  assert.equal(r.modifiedAt, 1790000000000);
});

test("parseRow falls back to the published version", () => {
  const r = parseRow({ data: { id: "5", name: "x", type: "promotion", language: "ta", translations: [{ language: "ta", published: { message: { body: "வணக்கம்" }, place_holders: [] } }] } });
  assert.equal(r.status, "approved");
  assert.equal(r.body, "வணக்கம்");
  assert.equal(r.type, "promotion");
  assert.equal(r.reason, null);
});

test("parseRow copes with a bare summary", () => {
  const r = parseRow({ id: 9, name: "n" });
  assert.equal(r.status, "draft");
  assert.deepEqual(r.placeholders, []);
});

test("staffEventOf matches the recorded template id", () => {
  const doc = { birthdays: { arattai: { templateId: "77" } }, test: { title: "x" } };
  assert.equal(staffEventOf(doc, "77"), "birthdays");
  assert.equal(staffEventOf(doc, "78"), null);
  assert.equal(staffEventOf({}, ""), null);
});

test("toMillis", () => {
  assert.equal(toMillis(1790000000), 1790000000000);
  assert.equal(toMillis(1790000000000), 1790000000000);
  assert.equal(toMillis("2026-11-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z"));
  assert.equal(toMillis(null), null);
});
