import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { logAudit } from '../utils/auditLog';
import { localKey } from '../utils/reportUtils';
import { MessageSquareText, Plus, Pencil, Trash2, Loader } from 'lucide-react';

// Remarks on a child: what staff observed, or what parents said, each with a date.
// Stored in students/{id}/remarks (firestore.rules: staff who can see the student read
// and add; the author or an admin edits and deletes). Staff only: the parent portal
// reads its fields through the server and never includes these.

const REMARK_KINDS = [
  { id: 'observation', label: 'Observation' },
  { id: 'parents', label: 'From parents' },
];
const kindLabel = (id) => REMARK_KINDS.find(k => k.id === id)?.label || '';
const TEXT_MAX = 2000;

const prettyDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary';

const emptyForm = () => ({ id: null, date: localKey(new Date()), kind: '', text: '' });

export default function StudentRemarks({ studentId, studentName }) {
  const { currentUser, userData } = useAuth();
  const email = (currentUser?.email || '').toLowerCase();
  const isAdmin = !!(userData?.isAdmin || userData?.role === 'admin');

  const [remarks, setRemarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // open when adding or editing
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(firestore, 'students', studentId, 'remarks'), orderBy('date', 'desc'));
    return onSnapshot(q, (snap) => {
      // Newest date first; on the same day, the latest written first.
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.date === b.date ? (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity) : 0));
      setRemarks(rows);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load remarks:', err);
      setLoading(false);
    });
  }, [studentId]);

  const canChange = (r) => isAdmin || (!!email && (r.createdBy || '').toLowerCase() === email);

  const save = async () => {
    const text = form.text.trim().slice(0, TEXT_MAX);
    if (!form.date || !text) return;
    setSaving(true);
    try {
      const fields = { date: form.date, kind: form.kind || '', text };
      if (form.id) {
        await updateDoc(doc(firestore, 'students', studentId, 'remarks', form.id), { ...fields, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(firestore, 'students', studentId, 'remarks'), {
          ...fields,
          createdBy: email,
          createdByName: userData?.displayName || email,
          createdAt: serverTimestamp(),
        });
      }
      // The remark itself stays out of the audit log; it may be private.
      logAudit({ action: form.id ? 'STUDENT_REMARK_UPDATED' : 'STUDENT_REMARK_ADDED', module: 'student_directory', targetId: studentId, targetName: studentName, performedBy: email, details: { date: form.date } });
      setForm(null);
    } catch (err) {
      console.error('Failed to save remark:', err);
      alert('Could not save the remark. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete this remark from ${prettyDate(r.date)}? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(firestore, 'students', studentId, 'remarks', r.id));
      logAudit({ action: 'STUDENT_REMARK_DELETED', module: 'student_directory', targetId: studentId, targetName: studentName, performedBy: email, details: { date: r.date } });
      if (form?.id === r.id) setForm(null);
    } catch (err) {
      console.error('Failed to delete remark:', err);
      alert('Could not delete the remark. Please try again.');
    }
  };

  const editor = (
    <div className="space-y-3 rounded-xl border border-brand-card-border bg-brand-bg/50 dark:bg-black/10 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-bold text-brand-text-dim mb-1">Date</span>
          <input type="date" value={form?.date || ''} max={localKey(new Date())} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className={inputClass} />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-brand-text-dim mb-1">Type (optional)</span>
          <select value={form?.kind || ''} onChange={(e) => setForm(f => ({ ...f, kind: e.target.value }))} className={inputClass}>
            <option value="">None</option>
            {REMARK_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-xs font-bold text-brand-text-dim mb-1">Remark</span>
        <textarea
          autoFocus
          rows={4}
          maxLength={TEXT_MAX}
          value={form?.text || ''}
          onChange={(e) => setForm(f => ({ ...f, text: e.target.value }))}
          placeholder="What you observed, or what the parents said"
          className={inputClass}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setForm(null)} disabled={saving} className="px-3 py-2 rounded-md text-sm font-medium text-brand-text-dim hover:text-brand-text disabled:opacity-50">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !form?.date || !form?.text.trim()} className="px-4 py-2 rounded-md text-sm font-bold bg-brand-primary hover:bg-brand-primary-hover text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving && <Loader size={14} className="animate-spin" />} {form?.id ? 'Save changes' : 'Add remark'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-brand-card border border-brand-card-border p-6 rounded-2xl lg:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-6 border-b border-brand-card-border pb-3">
        <h3 className="text-lg font-bold text-brand-text flex items-center gap-2">
          <MessageSquareText size={20} className="text-brand-text-dim" /> Remarks
        </h3>
        {!form && (
          <button type="button" onClick={() => setForm(emptyForm())} className="flex items-center gap-1.5 text-sm font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 px-3 py-1.5 rounded-lg">
            <Plus size={16} /> Add remark
          </button>
        )}
      </div>

      <div className="space-y-3">
        {form && !form.id && editor}
        {loading ? (
          <p className="text-brand-text-dim text-sm">Loading…</p>
        ) : remarks.length === 0 ? (
          !form && <p className="text-brand-text-dim text-sm">No remarks yet. Add what you notice about {studentName || 'this child'}, or what the parents tell you. Parents don't see these.</p>
        ) : (
          <ul className="divide-y divide-brand-card-border">
            {remarks.map(r => (
              <li key={r.id} className="py-3 first:pt-0">
                {form?.id === r.id ? editor : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-brand-text-dim mb-1">
                        <span className="font-bold text-brand-text">{prettyDate(r.date)}</span>
                        {kindLabel(r.kind) && (
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${r.kind === 'parents' ? 'bg-brand-secondary/10 text-brand-secondary' : 'bg-brand-primary/10 text-brand-primary'}`}>{kindLabel(r.kind)}</span>
                        )}
                        <span>by {r.createdByName || r.createdBy || 'someone'}</span>
                      </div>
                      <p className="text-sm text-brand-text whitespace-pre-wrap break-words">{r.text}</p>
                    </div>
                    {canChange(r) && !form && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setForm({ id: r.id, date: r.date, kind: r.kind || '', text: r.text || '' })} className="p-2 text-brand-text-dim hover:text-brand-text" title="Edit remark" aria-label="Edit remark"><Pencil size={15} /></button>
                        <button type="button" onClick={() => remove(r)} className="p-2 text-brand-text-dim hover:text-red-500" title="Delete remark" aria-label="Delete remark"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
