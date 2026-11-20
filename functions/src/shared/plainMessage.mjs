// A staff notification as one block of plain text, for channels without cards or buttons
// (Arattai templates with one placeholder) and for the notification log.
//
//   { title, text, links: [{ label, url }] }
//
// Wording lives in ./staffMessages.mjs; links are normally already inside `text` as {link}.

/** Title on its own line, then the text, then any extra links. */
export function plainText({ title, text, links = [] }) {
  return [
    title || '',
    text,
    ...links.map(l => `${l.label}: ${l.url}`),
  ].filter(Boolean).join('\n');
}
