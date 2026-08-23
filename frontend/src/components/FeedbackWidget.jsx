import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { MessageSquarePlus, X, AlertCircle, Lightbulb, Wrench, Check, Loader2 } from 'lucide-react';

const TYPES = [
  { key: 'complaint', label: 'Complaint', icon: AlertCircle, color: 'text-red-500' },
  { key: 'suggestion', label: 'Suggestion', icon: Lightbulb, color: 'text-amber-500' },
  { key: 'modification', label: 'Modification Request', icon: Wrench, color: 'text-brand-secondary' },
];

export default function FeedbackWidget({ isAdmin, newCount }) {
  const { currentUser, userData } = useAuth();
  const location = useLocation();
  const [showPanel, setShowPanel] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const email = currentUser?.email?.toLowerCase();

  const resetAndClose = () => {
    setShowForm(false);
    setShowPanel(false);
    setType('suggestion');
    setMessage('');
    setSubmitted(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || submitting || !email) return;
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(firestore, 'feedback'), {
        type,
        message: message.trim(),
        page: location.pathname,
        submittedBy: email,
        submittedByName: userData?.displayName || email,
        status: 'new',
        timestamp: serverTimestamp(),
      });

      logAudit({
        action: 'FEEDBACK_SUBMITTED',
        module: 'app_feedback',
        targetId: ref.id,
        targetName: `${type} from ${userData?.displayName || email}`,
        performedBy: email,
        details: { type, page: location.pathname }
      });

      setSubmitted(true);
      setTimeout(resetAndClose, 1800);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(v => !v)}
        className="relative text-brand-text-dim hover:text-brand-text transition-colors p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
        title="Feedback"
      >
        <MessageSquarePlus size={20} className={isAdmin && newCount > 0 ? 'text-brand-primary' : ''} />
        {isAdmin && newCount > 0 && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary border-2 border-brand-sidebar"></span>
          </span>
        )}
      </button>

      {showPanel && !showForm && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)}></div>
          <div className="absolute right-0 mt-3 w-72 bg-brand-card border border-brand-card-border rounded-xl shadow-lg py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-2 border-b border-brand-card-border mb-1">
              <p className="text-xs font-bold text-brand-text-dim uppercase">Feedback</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="w-full text-left px-4 py-3 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-3"
            >
              <MessageSquarePlus size={16} className="text-brand-primary" />
              <span>Report a complaint, suggestion, or request a change</span>
            </button>
            {isAdmin && (
              <Link
                to="/settings/feedback"
                onClick={() => setShowPanel(false)}
                className="w-full text-left px-4 py-3 text-sm text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-3 border-t border-brand-card-border"
              >
                <div className="mt-0.5 text-orange-500 shrink-0"><AlertCircle size={16} /></div>
                <div>
                  <p className="font-semibold text-brand-text">Review Feedback</p>
                  <p className="text-xs text-brand-text-dim mt-0.5">
                    {newCount > 0 ? `${newCount} new submission${newCount > 1 ? 's' : ''} awaiting review` : 'No new submissions'}
                  </p>
                </div>
              </Link>
            )}
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-bg rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-brand-card-border">
            <div className="px-6 py-4 border-b border-brand-card-border flex justify-between items-center bg-brand-card">
              <h2 className="text-lg font-bold text-brand-text">Send Feedback</h2>
              <button onClick={resetAndClose} className="text-brand-text-dim hover:text-brand-text transition-colors">
                <X size={20} />
              </button>
            </div>

            {submitted ? (
              <div className="p-10 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                  <Check size={24} />
                </div>
                <p className="font-bold text-brand-text">Thanks — sent to the admin team.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-brand-text mb-2">What is this about? *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map(t => {
                      const Icon = t.icon;
                      const active = type === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setType(t.key)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-bold transition-colors ${active ? 'border-brand-primary bg-brand-primary/10 text-brand-text' : 'border-brand-card-border text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                          <Icon size={18} className={active ? t.color : ''} />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-brand-text mb-1.5">Details *</label>
                  <textarea
                    required
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what's wrong, what you'd like to see, or what should change..."
                    className="w-full bg-brand-card border border-brand-card-border rounded-lg py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary resize-none"
                  />
                  <p className="text-[11px] text-brand-text-dim mt-1.5">This is sent with your name and the page you're currently on ({location.pathname}), visible only to admins.</p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetAndClose} className="px-4 py-2 rounded-lg font-bold text-brand-text-dim hover:bg-black/5 dark:hover:bg-white/5 transition-colors" disabled={submitting}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="px-5 py-2 rounded-lg font-bold bg-brand-primary text-white hover:bg-brand-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {submitting ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send Feedback'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
