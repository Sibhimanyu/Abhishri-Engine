// Pure helpers for the Templates page (components/AdminTemplates.jsx and friends).
import { usedPlaceholders, placeholderName, CATEGORIES } from '../../../functions/src/shared/templateRules.mjs';

/** { label, tone } for an Arattai status; tones match StatusBadge in StaffMessageWording.jsx. */
export function statusInfo(status) {
  switch (status) {
    case 'approved': return { label: 'Approved', tone: 'green' };
    case 'under_review': return { label: 'Under review', tone: 'amber' };
    case 'rejected': return { label: 'Rejected', tone: 'red' };
    case 'update_required': return { label: 'Needs update', tone: 'amber' };
    default: return { label: 'Draft', tone: 'gray' };
  }
}

export const STATUS_FILTERS = ['draft', 'under_review', 'approved', 'rejected', 'update_required'];

/** Filter the list by search text (name, description, wording), category and status ('' = all). */
export function filterTemplates(list, { q = '', category = '', status = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return list.filter((t) => {
    if (category && t.type !== category) return false;
    if (status && t.status !== status) return false;
    if (!needle) return true;
    return [t.name, t.description, t.title, t.body].some((x) => String(x || '').toLowerCase().includes(needle));
  });
}

export const categoryLabel = (type) => CATEGORIES[type]?.label || type;

export const emptyForm = () => ({ id: '', name: '', type: 'transaction', language: 'en', description: '', title: '', body: '', footer: '', samples: {}, extra: [] });

/** Builder form values from a list row. */
export function formFromRow(t) {
  return {
    id: t.id, name: t.name, type: t.type, language: t.language, description: t.description,
    title: t.title, body: t.body, footer: t.footer,
    samples: Object.fromEntries((t.placeholders || []).map((p) => [p.name, p.sample])),
    extra: [],
  };
}

/** A new unsaved template with the same wording: no id, name ends _copy, always a draft. */
export function duplicateForm(t) {
  const f = formFromRow(t);
  const suffix = '_copy';
  return { ...f, id: '', name: `${f.name.slice(0, 120 - suffix.length)}${suffix}` };
}

/** The variables of a form: those in the text, then any added but not yet used. */
export function variablesOf(f) {
  const used = usedPlaceholders(f);
  return [...used, ...(f.extra || []).filter((n) => !used.includes(n))];
}

/** The object templateProblems / the save callable expect. */
export function rulesInput(f) {
  return {
    name: f.name, type: f.type, language: f.language, description: f.description,
    title: f.title, body: f.body, footer: f.footer,
    placeholders: variablesOf(f).map((name) => ({ name, sample: f.samples?.[name] ?? '' })),
  };
}

/** Put `token` into `value` replacing the selection; returns { value, cursor }. */
export function insertAt(value, start, end, token) {
  const s = start ?? value.length;
  const e = end ?? s;
  return { value: value.slice(0, s) + token + value.slice(e), cursor: s + token.length };
}

/** Add a variable by a free-typed name: its clean name, or '' when nothing usable. */
export const newVariableName = (raw) => placeholderName(raw);

/** Split text into [{ text, variable? }] so variables can be highlighted with their samples filled in. */
export function previewSegments(text, samples = {}) {
  const out = [];
  const re = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
  let last = 0;
  for (const m of String(text ?? '').matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: String(samples[m[1]] || '').trim() || `{{${m[1]}}}`, variable: m[1] });
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) out.push({ text: text.slice(last) });
  return out;
}

/** Staff wording ({camelName}) as {{camelName}}, so the same preview can show it. */
export const doubleBraces = (text) => String(text ?? '').replace(/(?<!\{)\{([A-Za-z][A-Za-z0-9_]*)\}(?!\})/g, '{{$1}}');

export function formatModified(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
