// Classes for the daily report. Staff can share one login, so the report says which
// class it's for; each class has its own report per date. Staff-only: the exported
// poster never shows it. The list lives in configs/daily_report (admins edit it in the
// report editor); this default stands in until it's saved.

export const DEFAULT_CLASSES = ['Little Steps 1', 'Little Steps 2', 'Happy Explorers 1', 'Happy Explorers 2', 'Wonder Wings'];

/** "little-steps-1" from "Little Steps 1". */
export function classSlug(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The daily_reports doc id: the date, plus the class when there is one. Reports saved
 * before classes existed keep their plain-date id.
 */
export function reportId(date, className) {
  const slug = classSlug(className);
  return slug ? `${date}--${slug}` : date;
}

/** The class list as saved: trimmed, no blanks, no repeats (by id). */
export function cleanClasses(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    const name = String(item || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const slug = classSlug(name);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(name);
    }
  });
  return out;
}

/** Newest date first; one date's classes in alphabetical order, the class-less one first. */
export function compareReports(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return String(a.className || '').localeCompare(String(b.className || ''));
}
