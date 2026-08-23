import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import { ScrollText, Search, X, User, Clock, Tag, LayoutGrid } from 'lucide-react';

const LOG_LIMIT = 300;

export default function AdminAuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    const q = query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc'), limit(LOG_LIMIT));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Error loading audit logs:', err);
      setError('You do not have permission to view audit logs, or they failed to load.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const modules = useMemo(() => Array.from(new Set(logs.map(l => l.module).filter(Boolean))).sort(), [logs]);
  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action).filter(Boolean))).sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return logs.filter(l => {
      if (moduleFilter !== 'all' && l.module !== moduleFilter) return false;
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (!term) return true;
      const haystack = `${l.action || ''} ${l.module || ''} ${l.targetName || ''} ${l.targetId || ''} ${l.performedBy || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [logs, searchTerm, moduleFilter, actionFilter]);

  const formatTimestamp = (ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleString() : '-';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 bg-brand-card rounded-xl border border-brand-card-border">
        <div className="text-center">
          <X className="mx-auto text-red-500 mb-4" size={48} />
          <h3 className="text-xl font-bold text-brand-text mb-2">Access Denied</h3>
          <p className="text-brand-text-dim">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-auto flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-dim" size={16} />
          <input
            type="text"
            placeholder="Search action, target, or user..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          >
            <option value="all">All Modules</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
          >
            <option value="all">All Actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-brand-card-border flex justify-between items-center bg-black/5 dark:bg-white/5">
          <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
            <ScrollText size={18} className="text-brand-primary" /> Audit Log
          </h2>
          <span className="text-xs font-bold text-brand-text-dim uppercase tracking-wide">
            Showing {filteredLogs.length} of {logs.length} (most recent {LOG_LIMIT})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-brand-text-dim">
            <thead className="text-xs uppercase bg-brand-bg text-brand-text border-b border-brand-card-border">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Module</th>
                <th className="px-6 py-4">Target</th>
                <th className="px-6 py-4">Performed By</th>
                <th className="px-6 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-brand-text-dim">
                    No audit log entries match your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((l) => (
                  <tr key={l.id} className="border-b border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5"><Clock size={12} /> {formatTimestamp(l.timestamp)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-md border border-brand-card-border font-medium text-xs uppercase tracking-wider text-brand-text">
                        {l.action || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {l.module ? <span className="inline-flex items-center gap-1.5"><LayoutGrid size={12} /> {l.module}</span> : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-brand-text">{l.targetName || l.targetId || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5"><User size={12} /> {l.performedBy || 'unknown'}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedLog(l)}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium transition-colors"
                      >
                        <Tag size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-bg rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-brand-card-border">
            <div className="px-6 py-4 border-b border-brand-card-border flex justify-between items-center bg-brand-card">
              <h2 className="text-lg font-bold text-brand-text">{selectedLog.action || 'Audit Log Entry'}</h2>
              <button onClick={() => setSelectedLog(null)} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Timestamp</span>
                <span className="text-brand-text font-bold text-sm">{formatTimestamp(selectedLog.timestamp)}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Performed By</span>
                <span className="text-brand-text font-bold text-sm">{selectedLog.performedBy || 'unknown'}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Module</span>
                <span className="text-brand-text font-bold text-sm">{selectedLog.module || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm">Target</span>
                <span className="text-brand-text font-bold text-sm">{selectedLog.targetName || selectedLog.targetId || '-'}</span>
              </div>
              {selectedLog.details && (
                <div>
                  <span className="text-brand-text-dim text-sm block mb-2">Details</span>
                  <pre className="bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg p-3 text-xs text-brand-text overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
