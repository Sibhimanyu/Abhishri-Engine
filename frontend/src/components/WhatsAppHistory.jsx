import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { firestore, rtdb } from '../firebase';
import { History, CheckCircle2, CheckCheck, XCircle, Clock, ArrowLeft, Loader, Search } from 'lucide-react';

function BroadcastDetailView({ log, onBack }) {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [templateCategory, setTemplateCategory] = useState(null);

  useEffect(() => {
    if (log?.template) {
      import('firebase/firestore').then(({ doc, getDoc }) => {
        getDoc(doc(firestore, 'configs', 'whatsapp_main', 'templates', log.template)).then(snap => {
          if (snap.exists()) setTemplateCategory(snap.data().category);
        }).catch(e => console.warn("Failed to fetch template for cost estimation:", e));
      });
    }
  }, [log]);

  useEffect(() => {
    if (!log?.broadcastId) {
      setLoading(false);
      return;
    }

    const logsRef = ref(rtdb, `whatsapp_broadcast_logs/${log.broadcastId}`);
    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setRecipients(arr);

        // Client-side Sync: Calculate aggregate stats and update Firestore if out of sync
        let queued = 0, processing = 0, sent = 0, delivered = 0, read = 0, failed = 0, excluded = 0;
        arr.forEach(r => {
          const s = (r.status || 'unknown').toLowerCase();
          if (s === 'queued') queued++;
          else if (s === 'processing') processing++;
          else if (s === 'sent') sent++;
          else if (s === 'delivered') delivered++;
          else if (s === 'read') read++;
          else if (s === 'failed' || s === 'error') failed++;
          else if (s === 'excluded') excluded++;
        });

        const total = arr.length;
        if (
          log.sentCount !== sent ||
          log.deliveredCount !== delivered ||
          log.readCount !== read ||
          log.failedCount !== failed ||
          log.recipientsCount !== total
        ) {
          import('firebase/firestore').then(({ doc, updateDoc }) => {
            const docRef = doc(firestore, 'whatsapp_history', log.id);
            updateDoc(docRef, {
              sentCount: sent,
              deliveredCount: delivered,
              readCount: read,
              failedCount: failed,
              excludedCount: excluded,
              processingCount: processing,
              queuedCount: queued,
              processedNumbersCount: total - processing - queued - excluded,
              recipientsCount: total
            }).catch(e => console.warn("Background stats sync failed:", e));
          });
        }
      } else {
        setRecipients([]);
      }
      setLoading(false);
    }, (error) => {
      console.warn("RTDB Sync Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [log]);

  return (
    <div className="flex h-full bg-brand-bg rounded-xl overflow-hidden border border-brand-card-border m-6 shadow-sm flex-col">
      <div className="p-6 border-b border-brand-card-border bg-brand-card shrink-0 flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors border border-brand-card-border">
          <ArrowLeft size={20} className="text-brand-text" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-brand-text">{log.campaignName || 'Broadcast Details'}</h2>
          <p className="text-sm text-brand-text-dim flex items-center gap-1">
            <Clock size={12}/> {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp || Date.now()).toLocaleString()}
          </p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex justify-center items-center h-32 text-brand-text-dim gap-2">
            <Loader className="animate-spin" size={20}/> Syncing live data...
          </div>
        ) : recipients.length === 0 ? (
          <div className="p-8 text-center text-brand-text-dim bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-brand-card-border">
            No detailed recipient logs found for this broadcast.
          </div>
        ) : (
          <>
            {/* Dashboard & Cost Estimation */}
            {(() => {
              let queued = 0, processing = 0, sent = 0, delivered = 0, read = 0, failed = 0, excluded = 0;
              recipients.forEach(r => {
                const s = (r.status || 'unknown').toLowerCase();
                if (s === 'queued') queued++; else if (s === 'processing') processing++;
                else if (s === 'sent') sent++; else if (s === 'delivered') delivered++; else if (s === 'read') read++;
                else if (s === 'failed' || s === 'error') failed++; else if (s === 'excluded') excluded++;
              });
              const totalSent = sent + delivered + read;
              
              const ratePerMsg = templateCategory === 'UTILITY' ? 0.25 : 0.95;
              const estimatedCost = (log.processedNumbersCount || recipients.length) * ratePerMsg;
              
              const costDisplay = log.actualCost !== undefined ? log.actualCost : estimatedCost;
              const costLabel = log.actualCost !== undefined ? "COST" : "EST. COST";

              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-brand-bg rounded-lg p-4 border border-brand-card-border">
                    <div className="text-xs text-brand-text-dim mb-1 font-bold">TOTAL</div>
                    <div className="text-2xl font-bold text-brand-text">{recipients.length}</div>
                  </div>
                  <div className="bg-green-500/5 rounded-lg p-4 border border-green-500/20">
                    <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-bold">SENT</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{totalSent}</div>
                  </div>
                  <div className="bg-red-500/5 rounded-lg p-4 border border-red-500/20">
                    <div className="text-xs text-red-600 dark:text-red-400 mb-1 font-bold">FAILED</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{failed}</div>
                  </div>
                  <div className="bg-gray-500/5 rounded-lg p-4 border border-gray-500/20">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-bold">EXCLUDED</div>
                    <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{excluded}</div>
                  </div>
                  <div className="bg-brand-secondary/5 rounded-lg p-4 border border-brand-secondary/20">
                    <div className="text-xs text-brand-secondary mb-1 font-bold">{costLabel}</div>
                    <div className="text-2xl font-bold text-brand-secondary">₹{costDisplay.toFixed(2)}</div>
                  </div>
                </div>
              );
            })()}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-black/5 dark:bg-white/5 p-4 rounded-xl">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
                <input 
                  type="text" 
                  placeholder="Search recipients..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 pl-9 pr-3 focus:border-brand-primary outline-none text-sm text-brand-text"
                />
              </div>
              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 focus:border-brand-primary outline-none text-sm text-brand-text"
              >
                <option value="all">All Statuses</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="read">Read</option>
                <option value="failed">Failed / Error</option>
                <option value="queued">Queued / Processing</option>
                <option value="excluded">Excluded</option>
              </select>
            </div>

            {/* Recipient List */}
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-bold text-brand-text-dim uppercase tracking-wide px-4">
                <span>Recipient</span>
                <span>Status</span>
              </div>
              {recipients.filter(r => {
                const s = (r.status || 'unknown').toLowerCase();
                if (statusFilter !== 'all') {
                  if (statusFilter === 'failed' && s !== 'failed' && s !== 'error') return false;
                  if (statusFilter === 'queued' && s !== 'queued' && s !== 'processing') return false;
                  if (statusFilter !== 'failed' && statusFilter !== 'queued' && s !== statusFilter) return false;
                }
                if (searchTerm) {
                  const term = searchTerm.toLowerCase();
                  if (!(r.name || '').toLowerCase().includes(term) && !(r.id || '').includes(term)) return false;
                }
                return true;
              }).map(r => {
                const status = (r.status || 'unknown').toLowerCase();
                let statusStyle = 'bg-gray-500/10 text-gray-500 border-gray-500/20';
                let Icon = Clock;
                if (status === 'read') { statusStyle = 'bg-blue-500/10 text-blue-500 border-blue-500/20'; Icon = CheckCheck; }
                else if (status === 'delivered') { statusStyle = 'bg-green-500/10 text-green-500 border-green-500/20'; Icon = CheckCircle2; }
                else if (status === 'sent') { statusStyle = 'bg-green-500/10 text-green-500 border-green-500/20'; Icon = CheckCircle2; }
                else if (status === 'failed' || status === 'error') { statusStyle = 'bg-red-500/10 text-red-500 border-red-500/20'; Icon = XCircle; }

                return (
                  <div key={r.id} className="flex justify-between items-center bg-white dark:bg-brand-sidebar p-4 rounded-xl border border-brand-card-border shadow-sm hover:border-brand-primary/20 transition-colors">
                    <div>
                      <div className="font-bold text-brand-text">{r.name || 'Unknown'}</div>
                      <div className="text-xs text-brand-text-dim font-mono">{r.id}</div>
                      {(status === 'failed' || status === 'error') && r.error && (
                        <div className="text-xs text-red-500 mt-1 font-medium">{r.error}</div>
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold capitalize ${statusStyle}`}>
                      <Icon size={14}/> {status}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function WhatsAppHistory() {
  const [historyLogs, setHistoryLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    const q = query(
      collection(firestore, 'whatsapp_history'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const logs = [];
      snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
      setHistoryLogs(logs);
    });
    return () => unsub();
  }, []);

  if (selectedLog) {
    return <BroadcastDetailView log={selectedLog} onBack={() => setSelectedLog(null)} />;
  }

  return (
    <div className="flex h-full bg-brand-bg rounded-xl overflow-hidden border border-brand-card-border m-6 shadow-sm flex-col">
      <div className="p-6 border-b border-brand-card-border bg-brand-card shrink-0">
        <h2 className="text-xl font-bold text-brand-text flex items-center gap-2"><History size={20} className="text-brand-primary" /> Broadcast History</h2>
        <p className="text-sm text-brand-text-dim">Analytics and logs for past campaigns.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          {historyLogs.length === 0 ? (
            <div className="p-8 text-center text-brand-text-dim bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-brand-card-border">
              No broadcast history found.
            </div>
          ) : (
            historyLogs.map(log => {
              const total = log.processedNumbersCount || log.totalNumbers || 0;
              const read = log.readCount || 0;
              const delivered = log.deliveredCount || 0;
              const justSent = log.sentCount || 0;
              const failed = log.failedCount || 0;
              
              // In the database these counts are exclusive, but on the UI "SENT" represents everything that successfully dispatched.
              const totalSent = justSent + delivered + read;

              return (
                <div 
                  key={log.id} 
                  onClick={() => setSelectedLog(log)}
                  className="bg-white dark:bg-brand-sidebar rounded-xl border border-brand-card-border p-5 shadow-sm cursor-pointer hover:border-brand-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-brand-text text-lg">{log.campaignName || 'Unnamed Campaign'}</h3>
                      <p className="text-xs text-brand-text-dim flex items-center gap-1">
                        <Clock size={12}/> {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp || Date.now()).toLocaleString()} • Template: {log.template || log.templateName || 'N/A'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      log.status === 'completed' || log.status === 'dispatched' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                      log.status === 'dispatching' || log.status === 'processing' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                      'bg-gray-500/10 text-gray-600 dark:text-gray-400'
                    }`}>
                      {log.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-brand-bg rounded-lg p-3 border border-brand-card-border">
                      <div className="text-xs text-brand-text-dim mb-1 font-bold">PROCESSED</div>
                      <div className="text-xl font-bold text-brand-text">{total}</div>
                    </div>
                    
                    <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
                      <div className="text-xs text-green-600 dark:text-green-400 mb-1 font-bold flex items-center gap-1">
                        <CheckCircle2 size={12}/> SENT
                      </div>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">{totalSent}</div>
                    </div>

                    <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-bold flex items-center gap-1">
                        <CheckCheck size={12}/> READ
                      </div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{read}</div>
                    </div>

                    <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20">
                      <div className="text-xs text-red-600 dark:text-red-400 mb-1 font-bold flex items-center gap-1">
                        <XCircle size={12}/> FAILED
                      </div>
                      <div className="text-xl font-bold text-red-600 dark:text-red-400">{failed}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
