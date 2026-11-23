// The messaging channels on the Communications screen. The chat, broadcast, list and
// history screens (components/WhatsApp*.jsx) take one of these and read every collection,
// callable and label from it, so WhatsApp and Arattai share one set of screens.
export const CHANNELS = {
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    permKey: 'whatsapp_sender',
    basePath: '/whatsapp',
    auditPrefix: 'WHATSAPP',
    conversations: 'whatsapp_conversations',
    broadcastLogs: 'whatsapp_broadcast_logs',
    lists: 'whatsapp_lists',
    history: 'whatsapp_history',
    configDoc: 'whatsapp_main',
    headersFolder: 'whatsapp_headers',
    fn: { send: 'sendWhatsAppMessage', broadcast: 'sendWhatsAppBroadcast', react: 'sendWhatsAppReaction' },
    // The server writes the outgoing message itself; the screen adds its own copy.
    passesMessageKey: false,
    // Fast2SMS's per-message rates, for the estimate before sending.
    rates: { UTILITY: 0.25, MARKETING: 0.95 },
    billingNote: 'Final billing is determined by Fast2SMS and may vary based on open 24-hour conversation windows.',
    numberLabel: 'WhatsApp Number',
  },
  arattai: {
    id: 'arattai',
    label: 'Arattai',
    permKey: 'arattai_sender',
    basePath: '/whatsapp/arattai',
    auditPrefix: 'ARATTAI',
    conversations: 'arattai_conversations',
    broadcastLogs: 'arattai_broadcast_logs',
    lists: 'arattai_lists',
    history: 'arattai_history',
    configDoc: 'arattai_main',
    headersFolder: null,
    // No react: Arattai's Business API has no documented reaction call; reactions only display.
    fn: { send: 'sendArattaiMessage', broadcast: 'sendArattaiBroadcast' },
    // The screen creates the message and the server fills in the result at the same key.
    passesMessageKey: true,
    // Arattai's list prices (arattaibusiness.in/pricing.html, Nov 2026). Schools get 1 million
    // free transactional/authentication messages a month, so most estimates are really ₹0.
    rates: { UTILITY: 0.06, AUTHENTICATION: 0.06, MARKETING: 0.5 },
    billingNote: 'Educational institutions get 1 million free Transactional messages a month (every account gets 5,000); Promotional messages are always paid. Replies within 48 hours of a parent’s message are free.',
    numberLabel: 'Arattai (mobile) Number',
  },
};

/** The channel's permissions for this user: { any, access, broadcast, manage }. */
export function channelPerms(channel, userData) {
  const p = userData?.permissions?.[channel.permKey];
  const all = !!userData?.isAdmin || p === true;
  const access = all || !!p?.access;
  const broadcast = all || !!p?.broadcast;
  const manage = all || !!p?.manage;
  return { any: access || broadcast || manage, access, broadcast, manage };
}

/** Where the Communications link should land for this user: the first channel they can use. */
export function communicationsPath(userData) {
  // Arattai first: it's the school's main channel; WhatsApp is the fallback.
  const first = [CHANNELS.arattai, CHANNELS.whatsapp].find(c => channelPerms(c, userData).any);
  return first ? first.basePath : CHANNELS.whatsapp.basePath;
}
