// Weekly menu import: the admin gives ChatGPT MENU_PROMPT plus their menu, and
// pastes the reply back. The prompt only pins down the format; the parser is
// forgiving about everything around it (chat text, code fences, key casing).
import { extractJson, squash } from './chatJson';

export const MENU_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
export const MENU_SLOTS = ['morningDrink', 'lunch', 'eveningSnack'];

const SLOT_LABELS = { morningDrink: 'Morning Drink', lunch: 'Lunch', eveningSnack: 'Evening Snack' };

export const MENU_PROMPT = `Convert the weekly food menu I give you into JSON with exactly this structure:

{
  "startDate": "2026-09-28",
  "endDate": "2026-10-02",
  "days": {
    "monday": {
      "holiday": "",
      "morningDrink": [{ "name": "Item", "description": "", "translation": "" }],
      "lunch": [
        { "name": "Item", "description": "", "translation": "" },
        { "name": "Item", "description": "", "translation": "" }
      ],
      "eveningSnack": [{ "name": "Item", "description": "", "translation": "" }]
    },
    "tuesday": { "holiday": "", "morningDrink": [], "lunch": [], "eveningSnack": [] },
    "wednesday": { "holiday": "", "morningDrink": [], "lunch": [], "eveningSnack": [] },
    "thursday": { "holiday": "", "morningDrink": [], "lunch": [], "eveningSnack": [] },
    "friday": { "holiday": "", "morningDrink": [], "lunch": [], "eveningSnack": [] }
  }
}

Format rules:
- Include all five days: "monday", "tuesday", "wednesday", "thursday", "friday".
- Every day has the keys "holiday", "morningDrink", "lunch" and "eveningSnack".
- "holiday" is "" on a normal day. If the menu marks the day as a holiday, set it to the holiday's name (or "Holiday" if no name is given) and use [] for the three meals.
- "morningDrink", "lunch" and "eveningSnack" are each a list of items. Each item has "name", "description" and "translation".
- Put each item in its own entry, in the order the menu lists them. All items in a list are equal.
- "name" is the item's English name.
- "description" is the short English line shown under an item's name.
- "translation" is the item's Tamil name. If the menu lists the Tamil names after the English ones, match them to the English items in the same order.
- Use "" for any of these that the menu doesn't have. If a meal has no items, use [].
- "startDate" and "endDate" are the first and last dates the menu is for, as YYYY-MM-DD (usually that week's Monday and Friday). Use "" if the menu gives no dates.
- Reply with only the JSON, in a single code block.`;

const dayFromKey = (key) => {
  const k = squash(key);
  return k.length >= 3 ? MENU_DAYS.find(d => d.startsWith(k.slice(0, 3))) : undefined;
};

const slotFromKey = (key) => {
  const k = squash(key);
  if (k.includes('lunch')) return 'lunch';
  if (k.includes('snack') || k.includes('evening')) return 'eveningSnack';
  if (k.includes('drink') || k.includes('morning')) return 'morningDrink';
  return undefined;
};

// A day's holiday marker: a name string, `true`, or the whole day given as a string ("Holiday").
const HOLIDAY_WORD = /^\s*(school\s+)?holiday\s*$/i;
const readHoliday = (rawDay) => {
  if (typeof rawDay === 'string') {
    return rawDay.trim() ? { holiday: true, holidayNote: HOLIDAY_WORD.test(rawDay) ? '' : rawDay.trim() } : null;
  }
  const raw = rawDay?.holiday;
  if (raw === true) return { holiday: true, holidayNote: String(rawDay.holidayNote ?? '').trim() };
  if (typeof raw === 'string' && raw.trim() && !/^(false|no|none)$/i.test(raw.trim())) {
    return { holiday: true, holidayNote: HOLIDAY_WORD.test(raw) ? '' : raw.trim() };
  }
  return null;
};

// Menu dates are YYYY-MM-DD strings (IST calendar days), so they compare as text.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isMenuDate = (v) => {
  const m = ISO_DATE.exec(String(v ?? '').trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

export const addDays = (iso, n) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
};

export const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// "28 Sep – 02 Oct 2026"; the year is repeated only when the range crosses one.
export function weekRangeLabel(startDate, endDate) {
  if (!isMenuDate(startDate) || !isMenuDate(endDate)) return '';
  const part = (iso) => { const [y, m, d] = iso.split('-'); return [`${d} ${MONTHS[+m - 1]}`, y]; };
  const [[s, sy], [e, ey]] = [part(startDate), part(endDate)];
  return sy === ey ? `${s} – ${e} ${ey}` : `${s} ${sy} – ${e} ${ey}`;
}

// The menu to show on `today`: the one whose dates cover it, else the next one to start.
// Menus saved before dates existed have none and are never picked.
export function pickMenuFor(menus, today) {
  const dated = menus.filter(m => isMenuDate(m.startDate) && isMenuDate(m.endDate) && m.endDate >= today);
  const current = dated.filter(m => m.startDate <= today).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  return current || dated.sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
}

// Missing or impossible dates come back as ''; an end date alone is ignored,
// and a start date alone runs to that week's Friday (start + 4 days).
const readDates = (data) => {
  const start = isMenuDate(data?.startDate) ? data.startDate.trim() : '';
  if (!start) return { startDate: '', endDate: '' };
  const end = isMenuDate(data?.endDate) ? data.endDate.trim() : '';
  return { startDate: start, endDate: end && end >= start ? end : addDays(start, 4) };
};

const toItem = (raw) => {
  if (typeof raw === 'string') return { name: raw.trim(), description: '', translation: '' };
  if (!raw || typeof raw !== 'object') return null;
  return {
    name: String(raw.name ?? raw.item ?? '').trim(),
    description: String(raw.description ?? raw.note ?? '').trim(),
    translation: String(raw.translation ?? raw.tamil ?? '').trim(),
  };
};

const toItems = (raw) => {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.map(toItem).filter(it => it && (it.name || it.description || it.translation));
};

/**
 * Parse a pasted ChatGPT reply into
 * `{ startDate, endDate, days: { monday: { morningDrink: [{name, description, translation}], ..., holiday, holidayNote }, ... }, warnings }`.
 * Always returns every day and slot (empty lists where missing); `warnings` names
 * what was missing so the admin can check the preview. Throws if nothing usable was found.
 */
export function parseMenuText(text) {
  const data = extractJson(String(text ?? ''), 'menu');
  const rawDays = data?.days ?? data;

  // Accept `days` as an object keyed by day, or as an array of { day, ...slots }.
  const byDay = {};
  if (Array.isArray(rawDays)) {
    rawDays.forEach((entry, i) => {
      const day = dayFromKey(entry?.day) ?? MENU_DAYS[i];
      if (day && !byDay[day]) byDay[day] = entry;
    });
  } else if (rawDays && typeof rawDays === 'object') {
    Object.entries(rawDays).forEach(([key, value]) => {
      const day = dayFromKey(key);
      if (day && !byDay[day]) byDay[day] = value;
    });
  }

  const warnings = [];
  const days = {};
  let itemCount = 0;
  for (const day of MENU_DAYS) {
    const dayLabel = day[0].toUpperCase() + day.slice(1);
    const rawDay = byDay[day];
    days[day] = { holiday: false, holidayNote: '', ...Object.fromEntries(MENU_SLOTS.map(s => [s, []])) };
    const holiday = readHoliday(rawDay);
    if (holiday) {
      Object.assign(days[day], holiday);
      itemCount++;
      continue;
    }
    if (!rawDay || typeof rawDay !== 'object') {
      warnings.push(`${dayLabel} is missing.`);
      continue;
    }
    const seen = new Set();
    Object.entries(rawDay).forEach(([key, value]) => {
      const slot = slotFromKey(key);
      if (!slot || seen.has(slot)) return;
      seen.add(slot);
      days[day][slot] = toItems(value);
      itemCount += days[day][slot].length;
    });
    MENU_SLOTS.filter(s => !seen.has(s)).forEach(s => warnings.push(`${dayLabel}: ${SLOT_LABELS[s]} is missing.`));
  }

  if (itemCount === 0) throw new Error('No menu items found in the pasted text.');

  const dates = readDates(data);
  if (!dates.startDate) warnings.push("The menu's dates are missing. Set them before saving.");
  return { ...dates, days, warnings };
}
