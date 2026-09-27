// Helpers for reading JSON that an admin pasted back from ChatGPT.

/** Lower-case letters only, for matching loosely-written keys ("Morning Drink" → "morningdrink"). */
export const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Pull the JSON object out of a pasted chat reply (chat text and code fences around it are ignored). */
export const extractJson = (text, what) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(`No ${what} found in the pasted text. Paste the whole reply from ChatGPT.`);
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
      throw new Error(`The pasted ${what} isn't valid JSON. Ask ChatGPT to reply again with only the JSON code block.`);
    }
  }
};

