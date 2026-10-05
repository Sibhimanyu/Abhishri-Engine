// Daily report ("Connecting the Dots") import. Staff paste either their own text
// (parsePlainReport: one block per activity) or ChatGPT's reply to REPORT_PROMPT plus
// their notes. The prompt only pins down the format; the parser tolerates chat text,
// code fences and loosely named keys.
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

// "At home: …", "Home - …", "Try at home: …" start the at-home part of an activity.
const HOME_LINE = /^(?:try\s+)?(?:at\s+home|home(?:\s+activity)?|for\s+parents)\s*(?:[:\-–—]\s*|$)(.*)$/i;
const CLASSROOM_LABEL = /^(?:in\s+(?:the\s+)?class(?:room)?)\s*[:\-–—]\s*/i;
const DATE_LINE = /^date\s*[:\-–—]?\s*(.+)$/i;
const BULLET = /^(?:[-*•–]|\d+[.)])\s+/;
// A heading-only block like "Daily Report" or "Connecting the Dots" isn't an activity.
const TITLE = /^(?:daily\s+report|connecting\s+the\s+dots|today'?s\s+highlights|highlights)\b/i;

/** YYYY-MM-DD from "2026-10-05", "05/10/2026" or "5-10-2026" (day first, as written in India). */
const looseDate = (s) => {
  const t = String(s ?? '').trim();
  const iso = validDate(t);
  if (iso) return iso;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? validDate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`) : '';
};

/**
 * Staff's own text: one activity per block, blocks separated by a blank line. The first
 * line is the activity's name ("Circle Time", or "Circle Time: what we did" on one line),
 * the lines after it are what happened in the classroom, and a line starting "At home:"
 * begins the at-home part. A "Date: …" line sets the date.
 */
export function parsePlainReport(text) {
  let date = '';
  const blocks = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const highlights = [];
  blocks.forEach(block => {
    const lines = block.split('\n').map(l => l.trim().replace(BULLET, '')).filter(Boolean)
      .filter(l => {
        const d = l.match(DATE_LINE);
        if (d && looseDate(d[1])) { date = date || looseDate(d[1]); return false; }
        return true;
      });
    if (!lines.length) return;
    if (lines.length === 1 && TITLE.test(lines[0])) return;

    const h = { activity: '', classroom: [], home: [] };
    let rest = lines;
    const inline = lines[0].match(/^([^:]{1,60}):\s+(.+)$/);
    if (!HOME_LINE.test(lines[0]) && !CLASSROOM_LABEL.test(lines[0])) {
      if (inline) {
        h.activity = inline[1].trim();
        h.classroom.push(inline[2].trim());
        rest = lines.slice(1);
      } else if (lines.length > 1) {
        h.activity = lines[0].replace(/:$/, '').trim();
        rest = lines.slice(1);
      }
    }
    let target = h.classroom;
    rest.forEach(line => {
      const home = line.match(HOME_LINE);
      if (home) {
        target = h.home;
        if (home[1].trim()) target.push(home[1].trim());
        return;
      }
      target.push(line.replace(CLASSROOM_LABEL, ''));
    });
    const out = { activity: h.activity, classroom: h.classroom.join(' ').trim(), home: h.home.join(' ').trim() };
    if (out.activity || out.classroom || out.home) highlights.push(out);
  });
  if (!highlights.length) throw new Error('No highlights found in the pasted text.');
  return { date, highlights };
}

/** Text that is (or holds) ChatGPT's JSON reply, rather than someone's own notes. */
const looksLikeJson = (text) => /```/.test(text) || /^\s*[[{]/.test(text);

/**
 * Parse pasted text into `{ date, highlights: [{ activity, classroom, home }] }`: a
 * ChatGPT reply if it holds the JSON, otherwise the person's own text (parsePlainReport).
 * `date` is '' unless a valid date was given. Throws if no highlights were found.
 */
export function parseReportText(text) {
  const raw = String(text ?? '');
  let data;
  try {
    data = extractJson(raw, 'report');
  } catch (err) {
    if (looksLikeJson(raw)) throw err;
    return parsePlainReport(raw);
  }
  const list = Array.isArray(data)
    ? data
    : data?.highlights ?? data?.activities ?? data?.items ?? [];
  const highlights = (Array.isArray(list) ? list : [])
    .map(toHighlight)
    .filter(h => h && (h.activity || h.classroom || h.home));
  if (!highlights.length) throw new Error('No highlights found in the pasted text.');
  return { date: validDate(data?.date), highlights };
}
