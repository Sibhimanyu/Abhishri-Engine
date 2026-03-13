
/**
 * WhatsApp Sender Module - State and Configuration
 * Manages the global state for window.whatsAppSender
 */

window.whatsAppSender = {
    // Current View State
    currentView: 'chats', // chats, broadcast, lists, connect

    // Data Stores
    conversations: {},
    templates: [], // Store fetched templates
    lists: {}, // Store custom lists

    // Active Selection State
    activeConversationId: null, // phoneNumber
    activeMessages: [],

    // Configuration
    config: null,

    // Listeners (to be managed)
    configListener: null,
    currentMessageListener: null
};


