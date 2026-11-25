// Rules for Arattai message templates, shared by the Templates page (live checks while
// typing) and functions/src/arattai/templates.js (checks before anything is sent to Arattai).
// Pure. The rules were found by trying Arattai's API (they are not in its docs):
//   - name 10 to 120 characters (lowercase letters, digits, underscore here); description 30 to 1000;
//   - placeholders are written {{snake_name}}, at most 10;
//   - a sample value has only letters, digits, spaces, commas and full stops, is at most 50
//     characters, and isn't a link;
//   - the title and body can't start or end with a placeholder, and a placeholder can't be the whole message.
// Buttons and media headers are left out: their format isn't known.

export const CATEGORIES = {
  transaction: { label: 'Transactional', help: 'Updates about something the person did or is waiting for, such as a receipt or a reminder.' },
  promotion: { label: 'Promotional', help: 'Offers, news and announcements. Arattai reviews these more strictly.' },
  authentication: { label: 'Authentication', help: 'One-time codes and sign-in messages.' },
};

export const LANGUAGES = { en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada' };

export const LIMITS = { nameMin: 10, nameMax: 120, descMin: 30, descMax: 1000, placeholders: 10, sample: 50 };

const DOUBLE = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const NAME = /^[a-z][a-z0-9_]*$/;

/** The {{names}} a text uses, in order, without repeats. */
export function placeholdersIn(text) {
  return [...new Set([...String(text ?? '').matchAll(DOUBLE)].map((m) => m[1]))];
}

/** Every placeholder used in the title, body or footer. */
export function usedPlaceholders(t) {
  return [...new Set([t?.title, t?.body, t?.footer].flatMap((x) => placeholdersIn(x)))];
}

/** "Fee Reminder!" -> "fee_reminder": a placeholder name Arattai accepts. */
export function placeholderName(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '').slice(0, 40);
}

/** A sample value Arattai accepts: letters, digits, spaces, commas, full stops; at most 50 characters. */
export function sanitizeSample(v) {
  let s = String(v ?? '').replace(/[^A-Za-z0-9 ,.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > LIMITS.sample) s = s.slice(0, LIMITS.sample).replace(/\s+\S*$/, '').trim();
  return s;
}

const LINKISH = /https?|www\.|\b[a-z0-9-]+\.(com|in|app|org|net|io|co|edu|dev)\b/i;

/** A name for the template from its title: "Fee reminder" -> "fee_reminder_template". At least 10 characters. */
export function suggestName(title) {
  let n = String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60).replace(/_+$/, '');
  if (!n) return '';
  if (n.length < LIMITS.nameMin) n += '_template';
  return n;
}

const edge = (text) => {
  const t = String(text ?? '').trim();
  return { first: /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/.exec(t)?.[1], last: /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(t)?.[1], whole: /^\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\}$/.test(t) };
};

/**
 * Plain-English problems that would make Arattai refuse the template; empty when fine.
 * t: { name, type, language, description, title, body, footer, placeholders: [{ name, sample }] }
 */
export function templateProblems(t = {}) {
  const out = [];
  const name = String(t.name ?? '').trim();
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) out.push(`The name needs ${LIMITS.nameMin} to ${LIMITS.nameMax} characters.`);
  else if (!/^[a-z0-9_]+$/.test(name)) out.push('The name can only have lowercase letters, digits and underscores.');
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, t.type)) out.push('Choose a category.');
  if (!Object.prototype.hasOwnProperty.call(LANGUAGES, t.language)) out.push('Choose a language.');
  const desc = String(t.description ?? '').trim();
  if (desc.length < LIMITS.descMin || desc.length > LIMITS.descMax) out.push(`The description needs ${LIMITS.descMin} to ${LIMITS.descMax} characters (now ${desc.length}).`);
  if (!String(t.body ?? '').trim()) out.push('The body can\'t be empty.');

  const used = usedPlaceholders(t);
  if (used.length > LIMITS.placeholders) out.push(`Arattai allows at most ${LIMITS.placeholders} variables (now ${used.length}).`);
  const samples = new Map((t.placeholders || []).map((p) => [p.name, p.sample]));
  for (const n of used) {
    if (!NAME.test(n) || n !== n.toLowerCase()) out.push(`{{${n}}}: use lowercase letters, digits and underscores for a variable name.`);
    const s = String(samples.get(n) ?? '').trim();
    if (!s) out.push(`Add a sample value for {{${n}}}.`);
    else if (!/^[A-Za-z0-9 ,.]+$/.test(s)) out.push(`The sample for {{${n}}} can only have letters, digits, spaces, commas and full stops.`);
    else if (s.length > LIMITS.sample) out.push(`The sample for {{${n}}} is longer than ${LIMITS.sample} characters.`);
    else if (LINKISH.test(s)) out.push(`The sample for {{${n}}} can't be a link. Write the link in the text itself.`);
  }

  for (const [part, text] of [['body', t.body], ['title', t.title]]) {
    const { first, last, whole } = edge(text);
    if (whole) { out.push(`A variable can't be the whole ${part}. Add fixed text around it.`); continue; }
    if (first) out.push(`The ${part} can't start with a variable ({{${first}}}). Start with fixed text.`);
    if (last) out.push(`The ${part} can't end with a variable ({{${last}}}). End with fixed text.`);
  }
  return out;
}

/** The Arattai create/update body. Only the variables the text uses are declared. */
export function buildPayload(t) {
  const message = { body: String(t.body ?? '').trim() };
  const title = String(t.title ?? '').trim();
  const footer = String(t.footer ?? '').trim();
  if (title) message.title = title;
  if (footer) message.footer = footer;
  const samples = new Map((t.placeholders || []).map((p) => [p.name, p.sample]));
  return {
    type: t.type,
    language: t.language,
    name: String(t.name ?? '').trim(),
    description: String(t.description ?? '').trim(),
    message,
    place_holders: usedPlaceholders({ title, body: message.body, footer }).map((n) => ({ name: n, type: 'string', sample_value: sanitizeSample(samples.get(n)) })),
  };
}
