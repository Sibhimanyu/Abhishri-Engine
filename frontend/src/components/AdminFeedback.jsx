import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { MessageSquare, Search, X, AlertCircle, Lightbulb, Wrench, Clock, User, FileText, Trash2, Check } from 'lucide-react';

const FEEDBACK_LIMIT = 300;

const TYPES = {
  complaint: { label: 'Complaint', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' },
  suggestion: { label: 'Suggestion', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
  modification: { label: 'Modification', icon: Wrench, color: 'text-brand-secondary', bg: 'bg-brand-secondary/10 border-brand-secondary/20' },
};

const STATUSES = [
  { key: 'new', label: 'New', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  { key: 'in_review', label: 'In Review', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  { key: 'resolved', label: 'Resolved', color: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  { key: 'dismissed', label: 'Dismissed', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
];

export default function AdminFeedback() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(firestore, 'feedback'), orderBy('timestamp', 'desc'), limit(FEEDBACK_LIMIT));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Failed to load feedback:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return items.filter(f => {
      if (typeFilter !== 'all' && f.type !== typeFilter) return false;
      if (statusFilter !== 'all' && (f.status || 'new') !== statusFilter) return false;
      if (!term) return true;
      const haystack = `${f.message || ''} ${f.submittedByName || ''} ${f.submittedBy || ''} ${f.page || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, searchTerm, typeFilter, statusFilter]);

  const newCount = items.filter(f => (f.status || 'new') === 'new').length;

  const formatTimestamp = (ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return d ? d.toLocaleString() : '-';
  };

  const openItem = (item) => {
    setSelected(item);
    setAdminNote(item.adminNote || '');
  };

  const handleStatusChange = async (item, newStatus) => {
    setSaving(true);
    try {
      await updateDoc(doc(firestore, 'feedback', item.id), {
        status: newStatus,
        adminNote: adminNote.trim(),
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser?.email || null,
      });
      logAudit({
        action: 'FEEDBACK_STATUS_UPDATED',
        module: 'app_feedback',
        targetId: item.id,
        targetName: `${item.type} from ${item.submittedByName || item.submittedBy}`,
        performedBy: currentUser?.email,
        details: { status: { from: item.status || 'new', to: newStatus } }
      });
      setSelected(prev => prev ? { ...prev, status: newStatus, adminNote: adminNote.trim() } : prev);
    } catch (err) {
      console.error('Failed to update feedback status:', err);
      alert('Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Delete this feedback entry? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(firestore, 'feedback', item.id));
      logAudit({
        action: 'FEEDBACK_DELETED',
        module: 'app_feedback',
        targetId: item.id,
        targetName: `${item.type} from ${item.submittedByName || item.submittedBy}`,
        performedBy: currentUser?.email,
        details: {}
      });
      if (selected?.id === item.id) setSelected(null);
    } catch (err) {
      console.error('Failed to delete feedback:', err);
      alert('Failed to delete.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
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
            placeholder="Search feedback..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-brand-bg border border-brand-card-border rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-brand-text"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
            <option value="all">All Types</option>
            {Object.entries(TYPES).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary">
            <option value="all">All Statuses</option>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-brand-card-border flex justify-between items-center bg-black/5 dark:bg-white/5">
          <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
            <MessageSquare size={18} className="text-brand-primary" /> User Feedback
          </h2>
          <span className="text-xs font-bold text-brand-text-dim uppercase tracking-wide">
            {newCount > 0 ? `${newCount} new` : 'All caught up'} • Showing {filtered.length} of {items.length}
          </span>
        </div>

        <div className="divide-y divide-brand-card-border max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-brand-text-dim">No feedback matches your filters.</div>
          ) : (
            filtered.map((f) => {
              const typeMeta = TYPES[f.type] || TYPES.suggestion;
              const Icon = typeMeta.icon;
              const status = STATUSES.find(s => s.key === (f.status || 'new')) || STATUSES[0];
              return (
                <button
                  key={f.id}
                  onClick={() => openItem(f)}
                  className="w-full text-left p-4 md:p-5 flex items-start gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${typeMeta.bg}`}>
                    <Icon size={16} className={typeMeta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-brand-text text-sm">{f.submittedByName || f.submittedBy || 'Unknown'}</span>
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${status.color}`}>{status.label}</span>
                    </div>
                    <p className="text-sm text-brand-text-dim truncate">{f.message}</p>
                    <p className="text-[11px] text-brand-text-dim/70 mt-1 flex items-center gap-1"><Clock size={10} /> {formatTimestamp(f.timestamp)} {f.page ? `• ${f.page}` : ''}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-bg rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-brand-card-border">
            <div className="px-6 py-4 border-b border-brand-card-border flex justify-between items-center bg-brand-card">
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                {(() => { const Icon = (TYPES[selected.type] || TYPES.suggestion).icon; return <Icon size={18} className={(TYPES[selected.type] || TYPES.suggestion).color} />; })()}
                {(TYPES[selected.type] || TYPES.suggestion).label}
              </h2>
              <button onClick={() => setSelected(null)} className="text-brand-text-dim hover:text-brand-text transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm flex items-center gap-1.5"><User size={13} /> Submitted by</span>
                <span className="text-brand-text font-bold text-sm">{selected.submittedByName || selected.submittedBy}</span>
              </div>
              <div className="flex justify-between border-b border-brand-card-border pb-2">
                <span className="text-brand-text-dim text-sm flex items-center gap-1.5"><Clock size={13} /> Submitted</span>
                <span className="text-brand-text font-bold text-sm">{formatTimestamp(selected.timestamp)}</span>
              </div>
              {selected.page && (
                <div className="flex justify-between border-b border-brand-card-border pb-2">
                  <span className="text-brand-text-dim text-sm flex items-center gap-1.5"><FileText size={13} /> Page</span>
                  <span className="text-brand-text font-mono text-xs">{selected.page}</span>
                </div>
              )}
              <div>
                <span className="text-brand-text-dim text-sm block mb-2">Message</span>
                <p className="bg-black/5 dark:bg-white/5 border border-brand-card-border rounded-lg p-3 text-sm text-brand-text whitespace-pre-wrap">{selected.message}</p>
              </div>
              <div>
                <label className="text-brand-text-dim text-sm block mb-2">Admin note (visible to admins only)</label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Optional note about how this was handled..."
                  className="w-full bg-brand-card border border-brand-card-border rounded-lg py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary resize-none"
                />
              </div>
              <div>
                <span className="text-brand-text-dim text-sm block mb-2">Status</span>
                <div className="grid grid-cols-2 gap-2">
                  {STATUSES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => handleStatusChange(selected, s.key)}
                      disabled={saving}
                      className={`px-3 py-2 rounded-lg border text-sm font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${(selected.status || 'new') === s.key ? s.color : 'border-brand-card-border text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5'}`}
                    >
                      {(selected.status || 'new') === s.key && <Check size={14} />} {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-brand-card-border bg-brand-card flex justify-end">
              <button
                onClick={() => handleDelete(selected)}
                className="flex items-center gap-2 text-red-500 hover:text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
