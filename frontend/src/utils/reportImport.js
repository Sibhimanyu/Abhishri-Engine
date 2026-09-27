// Daily report ("Connecting the Dots") import: the admin gives ChatGPT REPORT_PROMPT
// plus the day's notes and pastes the reply back. The prompt only pins down the
// format; the parser tolerates chat text, code fences and loosely named keys.
import { extractJson, squash } from './chatJson';

export const REPORT_PROMPT = `Convert the daily report I give you into JSON with exactly this structure:

{
  "date": "2026-09-28",
  "highlights": [
    { "activity": "Activity name", "classroom": "What was done in the classroom", "home": "What to do at home" },
    { "activity": "Activity name", "classroom": "What was done in the classroom", "home": "" }
  ]
}

Format rules:
- "highlights" is a list with one entry per activity, in the order the report lists them.
- "activity" is the activity's name (for example "Circle Time").
- "classroom" is the text about what was done in the classroom.
- "home" is the text of the at-home activity that goes with it; use "" if there isn't one.
- "date" is the report's date as YYYY-MM-DD; use "" if the report doesn't give one.
- Reply with only the JSON, in a single code block.`;

const KEYS = {
  activity: ['activity', 'title', 'name', 'subject', 'topic'],
  classroom: ['classroom', 'inclassroom', 'intheclassroom', 'inclass', 'class', 'school', 'description', 'details', 'text'],
  home: ['home', 'athome', 'homeactivity', 'tryathome', 'parents', 'forparents'],
};

const field = (obj, names) => {
  const entry = Object.entries(obj).find(([k]) => names.includes(squash(k)));
  return entry ? String(entry[1] ?? '').trim() : '';
};

const toHighlight = (raw) => {
  if (typeof raw === 'string') {
    // "Circle Time — We talked about…" / "Circle Time: …"
    const m = raw.match(/^(.+?)\s*(?:\s[—–-]\s|:\s)\s*(.+)$/s);
    return m ? { activity: m[1].trim(), classroom: m[2].trim(), home: '' } : { activity: '', classroom: raw.trim(), home: '' };
  }
  if (!raw || typeof raw !== 'object') return null;
  return { activity: field(raw, KEYS.activity), classroom: field(raw, KEYS.classroom), home: field(raw, KEYS.home) };
};

const validDate = (s) => {
  const m = String(s ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : '';
};

/**
 * Parse a pasted ChatGPT reply into `{ date, highlights: [{ activity, classroom, home }] }`.
 * `date` is '' unless the reply had a valid YYYY-MM-DD. Throws if no highlights were found.
 */
export function parseReportText(text) {
  const data = extractJson(String(text ?? ''), 'report');
  const list = Array.isArray(data)
    ? data
    : data?.highlights ?? data?.activities ?? data?.items ?? [];
  const highlights = (Array.isArray(list) ? list : [])
    .map(toHighlight)
    .filter(h => h && (h.activity || h.classroom || h.home));
  if (!highlights.length) throw new Error('No highlights found in the pasted text.');
  return { date: validDate(data?.date), highlights };
}
