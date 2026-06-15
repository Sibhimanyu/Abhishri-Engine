import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, update, set } from 'firebase/database';
import { rtdb } from '../firebase';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { Search, Send, ArrowLeft, Clock, Check, CheckCheck, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function WhatsAppChats() {
  const { currentUser, userData } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [inputMsg, setInputMsg] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Fetch Conversations from RTDB
  useEffect(() => {
    const convosRef = ref(rtdb, 'whatsapp_conversations');
    const unsub = onValue(convosRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const convosList = Object.entries(data)
          .map(([key, val]) => val.metadata)
          .filter(Boolean)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setConversations(convosList);
      } else {
        setConversations([]);
      }
      setInitialLoading(false);
    }, (error) => {
      console.error("WhatsAppChats RTDB Error:", error);
      setInitialLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch Messages for Active Chat
  useEffect(() => {
    if (!activeChat) return;
    
    const safeKey = activeChat.phoneNumber.replace(/[.#$/[\]]/g, '_');
    const msgsRef = ref(rtdb, `whatsapp_conversations/${safeKey}/messages`);
    
    setMessagesLoading(true);
    setMessages([]); // clear old messages while loading

    // Reset unread count
    update(ref(rtdb, `whatsapp_conversations/${safeKey}/metadata`), { unreadCount: 0 });

    const unsub = onValue(msgsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const msgsList = Object.entries(data)
          .map(([key, val]) => ({ id: key, ...val }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setMessages(msgsList);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setMessages([]);
      }
      setMessagesLoading(false);
    }, (error) => {
      console.error("WhatsAppChats messages RTDB Error:", error);
      setMessagesLoading(false);
    });

    return () => unsub();
  }, [activeChat]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || !activeChat || isSending) return;

    const text = inputMsg.trim();
    setInputMsg('');
    setIsSending(true);
    
    const safeKey = activeChat.phoneNumber.replace(/[.#$/[\]]/g, '_');
    const functions = getFunctions();
    const sendWhatsAppMessage = httpsCallable(functions, 'sendWhatsAppMessage');

    try {
      const msgRef = push(ref(rtdb, `whatsapp_conversations/${safeKey}/messages`));
      const ts = Date.now();
      await set(msgRef, {
        message: text,
        direction: 'outbound',
        status: 'processing',
        timestamp: ts,
        to: activeChat.phoneNumber,
        from: 'system' // placeholder
      });

      await update(ref(rtdb, `whatsapp_conversations/${safeKey}/metadata`), {
        lastMessage: text,
        timestamp: ts,
        phoneNumber: activeChat.phoneNumber,
        displayName: activeChat.displayName || activeChat.phoneNumber
      });

      // Call Cloud Function
      const result = await sendWhatsAppMessage({ to: activeChat.phoneNumber, text });
      const realMessageId = result.data?.messages?.[0]?.id || result.data?.message_id || result.data?.id || 'simulated';

      await update(msgRef, { status: 'sent', messageId: realMessageId });

    } catch (err) {
      console.error("Send failed:", err);
      // In a real app we'd show a toast here
    }
    setIsSending(false);
  };

  const filteredConvos = conversations.filter(c => 
    (c.displayName || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.lastMessage || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full bg-brand-bg rounded-xl overflow-hidden border border-brand-card-border m-6 shadow-sm">
      
      {/* Sidebar: Conversations */}
      <div className={`w-full md:w-[320px] bg-brand-card flex flex-col border-r border-brand-card-border ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-brand-card-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Search chats..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {initialLoading ? (
            <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary"></div></div>
          ) : filteredConvos.length === 0 ? (
            <div className="p-8 text-center text-brand-text-dim text-sm">No chats found.</div>
          ) : (
            filteredConvos.map(convo => {
              const isActive = activeChat?.phoneNumber === convo.phoneNumber;
              const date = new Date(convo.timestamp || 0);
              const isToday = date.toLocaleDateString() === new Date().toLocaleDateString();
              const timeStr = isToday ? date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : date.toLocaleDateString();
              
              return (
                <div 
                  key={convo.phoneNumber} 
                  onClick={() => setActiveChat(convo)}
                  className={`flex items-start gap-3 p-4 cursor-pointer border-b border-brand-card-border transition-colors ${isActive ? 'bg-brand-primary/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-brand-secondary/20 flex items-center justify-center text-brand-secondary font-bold text-lg shrink-0">
                    {(convo.displayName?.[0] || convo.phoneNumber?.[0] || '#').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-sm text-brand-text truncate">{convo.displayName || convo.phoneNumber}</span>
                      <span className="text-xs text-brand-text-dim shrink-0 ml-2">{timeStr}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-brand-text-dim truncate pr-2">{convo.lastMessage || 'Media'}</span>
                      {convo.unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {convo.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-brand-text-dim opacity-50">
            <MessageSquare size={64} className="mb-4" />
            <p>Select a chat to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-16 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-brand-card-border flex items-center px-4 shrink-0">
              <button className="md:hidden mr-3 text-brand-text-dim" onClick={() => setActiveChat(null)}>
                <ArrowLeft size={20} />
              </button>
              <div className="w-10 h-10 rounded-full bg-brand-secondary/20 flex items-center justify-center text-brand-secondary font-bold text-lg shrink-0 mr-3">
                {(activeChat.displayName?.[0] || '#').toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-brand-text leading-tight">{activeChat.displayName || activeChat.phoneNumber}</h3>
                <p className="text-xs text-brand-text-dim">{activeChat.phoneNumber}</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 relative" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'contain', backgroundBlendMode: 'multiply' }}>
              {messagesLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                </div>
              ) : messages.map(msg => {
                const isInbound = msg.direction === 'inbound';
                const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                
                return (
                  <div key={msg.id} className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-lg p-2 relative shadow-sm ${isInbound ? 'bg-white dark:bg-[#202c33] text-black dark:text-[#e9edef]' : 'bg-[#d9fdd3] dark:bg-[#005c4b] text-black dark:text-[#e9edef]'}`}>
                      {msg.type === 'revoke' ? (
                        <p className="text-sm italic text-gray-500 pb-3 flex items-center gap-1">
                          <span className="text-xs">🚫</span> This message was deleted
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 pb-3">
                          {(msg.type === 'image' || msg.type === 'photo') && msg.imageData?.url && (
                            <a href={msg.imageData.url} target="_blank" rel="noreferrer">
                              <img src={msg.imageData.url} alt="Attachment" className="max-w-full rounded-md max-h-64 object-cover hover:opacity-90 transition-opacity" loading="lazy" />
                            </a>
                          )}
                          {msg.type === 'sticker' && msg.imageData?.url && (
                            <img src={msg.imageData.url} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" />
                          )}
                          {msg.type === 'video' && msg.imageData?.url && (
                            <video controls src={msg.imageData.url} className="max-w-full rounded-md max-h-64" />
                          )}
                          {msg.type === 'audio' && msg.imageData?.url && (
                            <audio controls src={msg.imageData.url} className="w-full max-w-[240px] h-10" />
                          )}
                          {msg.type === 'document' && msg.imageData?.url && (
                            <a href={msg.imageData.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-2 rounded-lg hover:bg-black/10 transition-colors">
                              <span className="text-xl">📄</span>
                              <span className="text-sm font-medium underline truncate text-brand-primary">View Document</span>
                            </a>
                          )}
                          {msg.message && <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>}
                          {msg.imageData?.caption && <p className="text-sm whitespace-pre-wrap break-words">{msg.imageData.caption}</p>}
                        </div>
                      )}
                      <div className="absolute bottom-1 right-2 flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">{timeStr}</span>
                        {!isInbound && (
                          <span className={`text-[12px] ${msg.status === 'read' ? 'text-blue-500' : 'text-gray-400'}`}>
                            {msg.status === 'processing' ? <Clock size={12}/> : msg.status === 'sent' ? <Check size={12}/> : <CheckCheck size={12}/>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="h-16 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center px-4 gap-3 shrink-0">
              <input 
                type="text" 
                value={inputMsg}
                onChange={e => setInputMsg(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-white dark:bg-[#2a3942] border-none rounded-lg py-2 px-4 focus:outline-none text-brand-text"
              />
              <button 
                type="submit" 
                disabled={!inputMsg.trim() || isSending}
                className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white disabled:opacity-50 transition-opacity"
              >
                {isSending ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                ) : (
                  <Send size={18} className="ml-1" />
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
