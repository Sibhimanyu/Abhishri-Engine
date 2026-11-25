// node --test src/arattai/staffTemplates.test.js
// Turning staff wording into Arattai templates, and the template approval webhook.
const test = require("node:test");
const assert = require("node:assert");
const { parseTemplateEvent, parseTemplate } = require("./live");

const load = () => import("../shared/staffMessages.mjs");

test("every default becomes a valid template payload", async () => {
  const m = await load();
  for (const key of Object.keys(m.EVENTS)) {
    const p = m.buildTemplatePayload(key, m.DEFAULT_MESSAGES[key]);
    assert.strictEqual(p.type, "transaction");
    assert.strictEqual(p.language, "en");
    assert.ok(p.name.length >= 10 && p.name.length <= 120, `${key} name`);
    assert.strictEqual(p.name, `abhishri_staff_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`);
    assert.ok(p.description.length >= 30 && p.description.length <= 1000, `${key} description`);
    assert.ok(p.place_holders.length <= 10);
    assert.ok(!/(^|[^{])\{[A-Za-z]/.test(p.message.body + " " + (p.message.title || "")), `${key} has single-brace leftovers`);
    for (const ph of p.place_holders) {
      assert.ok(ph.sample_value.length > 0, `${key}.${ph.name} sample is empty`);
      assert.match(ph.name, /^[a-z][a-z0-9_]*$/);
      assert.ok((p.message.body + (p.message.title || "")).includes(`{{${ph.name}}}`));
    }
  }
});

test("curly placeholders become {{snake_case}} and are listed once with samples", async () => {
  const m = await load();
  const p = m.buildTemplatePayload("approvalOutcomeReturned", { title: "Sent back: {Kind} now", body: "Changes: {reviewer} sent back {itemTitle}.\n{noteLine}\nEdit it: {link}\nFrom {reviewer}, thanks." });
  assert.strictEqual(p.message.title, "Sent back: {{kind_cap}} now");
  // {link} is fixed template text (Arattai rejects links as samples), so it isn't a placeholder.
  assert.strictEqual(p.message.body, "Changes: {{reviewer}} sent back {{item_title}}.\n{{note_line}}\nEdit it: https://abhishri-academy.web.app/menu-report\nFrom {{reviewer}}, thanks.");
  assert.deepStrictEqual(p.place_holders.map((x) => x.name), ["kind_cap", "reviewer", "item_title", "note_line"]);
  // Arattai accepts only type "string" and samples of letters, digits, spaces, commas and full stops.
  assert.ok(p.place_holders.every((x) => x.type === "string" && /^[A-Za-z0-9 ,.]+$/.test(x.sample_value)));
  assert.strictEqual(p.place_holders.find((x) => x.name === "note_line").sample_value, "Note Add photos");
});

test("a fixed title is allowed, a bad placeholder or empty body is refused", async () => {
  const m = await load();
  assert.strictEqual(m.buildTemplatePayload("test", { title: "", body: "Hello" }).message.title, undefined);
  assert.throws(() => m.buildTemplatePayload("test", { title: "x", body: "Hi {typo} there" }), /typo/);
  assert.throws(() => m.buildTemplatePayload("test", { title: "x", body: "  " }), /empty/);
});

test("a body starting or ending with a placeholder is refused, ending with {link} is fine", async () => {
  const m = await load();
  assert.throws(() => m.buildTemplatePayload("approvalOutcomeReturned", { title: "T", body: "{reviewer} sent it. {link}" }), /starts with a placeholder \(\{reviewer\}\)/);
  assert.throws(() => m.buildTemplatePayload("approvalOutcomeReturned", { title: "T", body: "Review {itemTitle}" }), /ends with a placeholder \(\{itemTitle\}\)/);
  assert.throws(() => m.buildTemplatePayload("approvalOutcomeReturned", { title: "{reviewer} asked", body: "Hi {itemTitle}. {link}" }), /title/);
  assert.ok(m.buildTemplatePayload("approvalOutcomeReturned", { title: "", body: "Hi {itemTitle}. {link}" }));
});

test("values are never empty and stay on one line", async () => {
  const m = await load();
  const w = { title: "T", body: "{reviewer} {note} {noteLine} {people}" };
  assert.deepStrictEqual(m.templateValues(w, { reviewer: "A", note: "", noteLine: "No note added.", people: "a\nb" }),
    { reviewer: "A", note: "-", note_line: "No note added.", people: "a / b" });
  assert.strictEqual(m.templateValues({ body: "{reviewer}" }, {}).reviewer, "-");
});

test("name and description are padded to the minimum length", async () => {
  const m = await load();
  assert.ok(m.templateName("a").length >= 10);
  assert.ok(m.templateName("test").length >= 10);
  assert.strictEqual(m.editedSinceSubmission({ title: "a", body: "b" }, { title: "a", body: "b" }), false);
  assert.strictEqual(m.editedSinceSubmission({ title: "a", body: "c" }, { title: "a", body: "b" }), true);
  assert.strictEqual(m.editedSinceSubmission({ title: "a", body: "c" }, undefined), false);
});

test("messagetemplate.approval.updated webhook parsing", () => {
  assert.deepStrictEqual(parseTemplateEvent({ event: "messagetemplate.approval.updated", entity: { template_id: 55, status: "approved" } }), { templateId: "55", status: "approved", reason: null });
  assert.deepStrictEqual(parseTemplateEvent({ event: "messagetemplate.approval.updated", entity: { template_id: "t1", status: "rejected", reason: "Unclear" } }), { templateId: "t1", status: "rejected", reason: "Unclear" });
  assert.strictEqual(parseTemplateEvent({ event: "messagetemplate.approval.updated", entity: { template_id: "t1", status: "pending" } }), null);
  assert.strictEqual(parseTemplateEvent({ event: "chat.message.sent", entity: {} }), null);
});

test("template responses are read from data or the top level", () => {
  assert.deepStrictEqual(parseTemplate({ data: { id: 7, status: "enabled", translations: [{ language: "en", status: "under_review" }] } }), { id: "7", status: "under_review", reason: null, enabled: true });
  assert.strictEqual(parseTemplate({ id: "8" }).status, "draft");
  // The real shape: the status sits on the translation's draft.
  assert.deepStrictEqual(parseTemplate({ data: { id: "9", status: "enabled", translations: [{ language: "en", draft: { status: "approved" }, published: {} }] } }), { id: "9", status: "approved", reason: null, enabled: true });
  assert.strictEqual(parseTemplate({ data: { id: "9", translations: [{ language: "en", draft: { status: "rejected", rejection_reason: "Starts with a variable" } }] } }).reason, "Starts with a variable");
});
