// node --test src/shared/templateRules.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { CATEGORIES, placeholdersIn, templateProblems, buildPayload, sanitizeSample, suggestName, placeholderName } from './templateRules.mjs';

const good = () => ({
  name: 'fee_reminder_notice', type: 'transaction', language: 'en',
  description: 'Reminds a parent that a fee payment is due soon for their child.',
  title: 'Fee reminder', body: 'Hello {{parent_name}}, the fee for {{student_name}} is due. Thank you.', footer: 'Abhishri Academy',
  placeholders: [{ name: 'parent_name', sample: 'Meena' }, { name: 'student_name', sample: 'Arun' }],
});

test('categories', () => assert.deepEqual(Object.keys(CATEGORIES), ['transaction', 'promotion', 'authentication']));

test('placeholdersIn finds {{x}} once each', () => {
  assert.deepEqual(placeholdersIn('Hi {{a}} and {{ b }}, {{a}} {single}'), ['a', 'b']);
  assert.deepEqual(placeholdersIn(null), []);
});

test('a good template has no problems', () => assert.deepEqual(templateProblems(good()), []));

test('name and description limits', () => {
  assert.equal(templateProblems({ ...good(), name: 'short' }).length, 1);
  assert.match(templateProblems({ ...good(), name: 'Has Capitals Here' })[0], /lowercase/);
  assert.match(templateProblems({ ...good(), description: 'too short' })[0], /description/);
});

test('start, end and whole-message variables are refused', () => {
  assert.match(templateProblems({ ...good(), body: '{{parent_name}} hello there {{student_name}}' }).join(' '), /start with a variable/);
  assert.match(templateProblems({ ...good(), body: 'Hello there {{student_name}}' }).join(' '), /end with a variable/);
  assert.match(templateProblems({ ...good(), body: '{{student_name}}' }).join(' '), /whole body/);
  assert.match(templateProblems({ ...good(), title: '{{parent_name}}' }).join(' '), /whole title/);
});

test('samples are checked', () => {
  const p = (sample) => templateProblems({ ...good(), placeholders: [{ name: 'parent_name', sample }, { name: 'student_name', sample: 'Arun' }] });
  assert.match(p('')[0], /Add a sample/);
  assert.match(p('Meena!')[0], /letters, digits/);
  assert.match(p('abhishri.com')[0], /link/);
  assert.match(p('a'.repeat(51))[0], /50/);
  assert.match(templateProblems({ ...good(), placeholders: [] })[0], /sample/);
});

test('at most 10 variables', () => {
  const names = Array.from({ length: 11 }, (_, i) => `v${i}`);
  const body = `Start ${names.map((n) => `{{${n}}}`).join(' ')} end`;
  const t = { ...good(), body, placeholders: names.map((name) => ({ name, sample: 'x' })) };
  assert.match(templateProblems(t).join(' '), /at most 10/);
});

test('buildPayload declares only used variables with clean samples', () => {
  const p = buildPayload({ ...good(), footer: '', placeholders: [...good().placeholders, { name: 'unused', sample: 'z' }].map((x) => (x.name === 'parent_name' ? { ...x, sample: 'Meena!' } : x)) });
  assert.equal(p.type, 'transaction');
  assert.deepEqual(p.message, { title: 'Fee reminder', body: good().body });
  assert.deepEqual(p.place_holders, [{ name: 'parent_name', type: 'string', sample_value: 'Meena' }, { name: 'student_name', type: 'string', sample_value: 'Arun' }]);
});

test('sanitizeSample, suggestName, placeholderName', () => {
  assert.equal(sanitizeSample('Dr. Rao (Sr) / 5'), 'Dr. Rao Sr 5');
  assert.ok(sanitizeSample('word '.repeat(30)).length <= 50);
  assert.equal(suggestName('Fee Reminder: Term 2'), 'fee_reminder_term_2');
  assert.equal(suggestName('Fee'), 'fee_template');
  assert.equal(suggestName('  '), '');
  assert.equal(placeholderName('Student Name!'), 'student_name');
  assert.equal(placeholderName('1st day'), 'st_day');
});
