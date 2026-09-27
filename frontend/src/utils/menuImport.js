// Weekly menu import: the admin gives ChatGPT MENU_PROMPT plus their menu, and
// pastes the reply back. The prompt only pins down the format; the parser is
// forgiving about everything around it (chat text, code fences, key casing).

export const MENU_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
export const MENU_SLOTS = ['morningDrink', 'lunch', 'eveningSnack'];

const SLOT_LABELS = { morningDrink: 'Morning Drink', lunch: 'Lunch', eveningSnack: 'Evening Snack' };

export const MENU_PROMPT = `Convert the weekly food menu I give you into JSON with exactly this structure:

{
  "weekLabel": "Week of 28 Sep – 02 Oct 2026",
  "days": {
    "monday": {
      "holiday": "",
      "morningDrink": [{ "name": "Item", "description": "", "translation": "" }],
      "lunch": [
        { "name": "Main item", "description": "", "translation": "" },
        { "name": "Side item", "description": "", "translation": "" }
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
- The first item in a list is the main item. Any further items are side items.
- "name" is the item's English name.
- "description" is the short English line shown under an item's name.
- "translation" is the item's Tamil name. If the menu lists the Tamil names after the English ones, match them to the English items in the same order.
- Use "" for any of these that the menu doesn't have. If a meal has no items, use [].
- "weekLabel" is the menu's week or title line; use "" if there isn't one.
- Reply with only the JSON, in a single code block.`;

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

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

// Pull the JSON object out of a pasted chat reply.
const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No menu found in the pasted text. Paste the whole reply from ChatGPT.');
  const candidate = body.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Smart quotes and trailing commas are the usual copy-paste casualties.
    const repaired = candidate
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error('The pasted menu isn\'t valid JSON. Ask ChatGPT to reply again with only the JSON code block.');
    }
  }
};

/**
 * Parse a pasted ChatGPT reply into
 * `{ weekLabel, days: { monday: { morningDrink: [{name, description, translation}], ..., holiday, holidayNote }, ... }, warnings }`.
 * Always returns every day and slot (empty lists where missing); `warnings` names
 * what was missing so the admin can check the preview. Throws if nothing usable was found.
 */
export function parseMenuText(text) {
  const data = extractJson(String(text ?? ''));
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

  return { weekLabel: String(data?.weekLabel ?? '').trim(), days, warnings };
}
