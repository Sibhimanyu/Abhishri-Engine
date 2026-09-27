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
      "morningDrink": [{ "name": "Item", "description": "" }],
      "lunch": [
        { "name": "Main item", "description": "" },
        { "name": "Side item", "description": "" }
      ],
      "eveningSnack": [{ "name": "Item", "description": "" }]
    },
    "tuesday": { "morningDrink": [], "lunch": [], "eveningSnack": [] },
    "wednesday": { "morningDrink": [], "lunch": [], "eveningSnack": [] },
    "thursday": { "morningDrink": [], "lunch": [], "eveningSnack": [] },
    "friday": { "morningDrink": [], "lunch": [], "eveningSnack": [] }
  }
}

Format rules:
- Include all five days: "monday", "tuesday", "wednesday", "thursday", "friday".
- Every day has the three keys "morningDrink", "lunch" and "eveningSnack".
- Each of those is a list of items. Each item has "name" and "description".
- The first item in a list is the main item. Any further items are side items.
- "description" is the short line shown under an item's name. If there isn't one, set it to "". If a meal has no items, use [].
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

const toItem = (raw) => {
  if (typeof raw === 'string') return { name: raw.trim(), description: '' };
  if (!raw || typeof raw !== 'object') return null;
  return {
    name: String(raw.name ?? raw.item ?? '').trim(),
    description: String(raw.description ?? raw.translation ?? raw.note ?? '').trim(),
  };
};

const toItems = (raw) => {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list.map(toItem).filter(it => it && (it.name || it.description));
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
 * `{ weekLabel, days: { monday: { morningDrink: [{name, description}], ... }, ... }, warnings }`.
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
    days[day] = Object.fromEntries(MENU_SLOTS.map(s => [s, []]));
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
