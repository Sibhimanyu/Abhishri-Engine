// Staff notifications are written once, as Cliq messages (./cliqMessages.mjs). Other
// channels, Arattai first, send them as a plain message: this turns one into the other,
// so every channel says the same thing and links to the same screens.
//
//   { title, text, links: [{ label, url }], actions: [{ label, key }] }
//
// `actions` are Cliq's Approve / Send back buttons. A channel that can't run them still
// gets the "Review in app" link that every request message carries.

/** The plain form of a Cliq message ({ text, card?, buttons? }). */
export function plainFromCliq(msg) {
  let title = String(msg?.card?.title || '').trim();
  let text = String(msg?.text || '').trim();
  // Messages without a card (the channel's "approved"/"sent back" notes) start "*Title*\n".
  const bold = /^\*([^*\n]+)\*\n/.exec(text);
  if (!title && bold) {
    title = bold[1].trim();
    text = text.slice(bold[0].length).trim();
  }
  const links = [];
  const actions = [];
  for (const b of Array.isArray(msg?.buttons) ? msg.buttons : []) {
    if (b?.action?.type === 'open.url' && b.action.data?.web) links.push({ label: b.label, url: b.action.data.web });
    else if (b?.action?.type === 'invoke.function' && b.key) actions.push({ label: b.label, key: b.key });
  }
  return { title, text, links, actions };
}

/** One block of text for channels without cards or buttons (and for the notification log). */
export function plainText({ title, text, links = [] }) {
  return [
    title ? `*${title}*` : '',
    text,
    ...links.map(l => `${l.label}: ${l.url}`),
  ].filter(Boolean).join('\n');
}
