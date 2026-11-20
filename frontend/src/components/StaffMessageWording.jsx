import { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Send, Trash2, Lock } from 'lucide-react';
import { EVENTS, DEFAULT_MESSAGES, renderMessage, editedSinceSubmission } from '../../../functions/src/shared/staffMessages.mjs';

// The editor for one staff notification, shown in Settings > Staff Notifications
// (AdminStaffNotifications.jsx lists the events and owns the data).
//
// Each message is an Arattai template. Wording edits are saved to configs/staff_messages as
// { [eventKey]: { title, body } }; the template's state is written by the server under
// `arattai` (functions/src/arattai/staffTemplates.js) and only read here.

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text disabled:opacity-60';

const TONES = {
  green: { badge: 'bg-green-500/10 text-green-600 dark:text-green-400', dot: 'bg-green-500' },
  amber: { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  red: { badge: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  gray: { badge: 'bg-black/5 dark:bg-white/5 text-brand-text-dim', dot: 'bg-brand-text-dim/40' },
};

/** Short recipient for the event list: "Admins" or "Teacher". */
export const recipientOf = (eventKey) => (/teacher/i.test(EVENTS[eventKey].audience) ? 'Teacher' : 'Admins');

/**
 * { label, tone, edited, reason } for an event's template: its saved wording against the
 * state the server recorded (undefined when nothing was submitted).
 */
export function templateStatus(wording, state) {
  if (!state?.templateId && !state?.status) return { label: 'Not submitted', tone: 'gray', edited: false };
  const edited = editedSinceSubmission(wording, state.submittedText);
  switch (state.status) {
    case 'approved': return edited ? { label: 'Edited since approval', tone: 'amber', edited } : { label: 'Approved', tone: 'green', edited };
    case 'under_review': return { label: 'Under review', tone: 'amber', edited };
    case 'rejected': return { label: 'Rejected', tone: 'red', edited, reason: state.rejectedReason };
    case 'update_required': return { label: 'Needs update', tone: 'amber', edited };
    default: return { label: 'Draft', tone: 'gray', edited };
  }
}

export const StatusDot = ({ tone }) => <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${TONES[tone].dot}`} />;

export const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${TONES[status.tone].badge}`}>
    <StatusDot tone={status.tone} /> {status.label}
  </span>
);

export const formatWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : '');

export default function StaffMessageEditor({ eventKey, saved, state, mode, onSave, onSubmit, onDelete }) {
  const ev = EVENTS[eventKey];
  const def = DEFAULT_MESSAGES[eventKey];
  const [title, setTitle] = useState(saved.title);
  const [body, setBody] = useState(saved.body);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const lastField = useRef('body');
  const titleRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { setTitle(saved.title); setBody(saved.body); setNote(null); }, [eventKey, saved.title, saved.body]);

  const status = templateStatus(saved, state);
  const locked = state?.status === 'under_review';
  const dirty = title !== saved.title || body !== saved.body;
  const isDefault = title === def.title && body === def.body;

  // Insert at the cursor of whichever field was last used.
  const insert = (name) => {
    const token = `{${name}}`;
    const isTitle = lastField.current === 'title';
    const el = (isTitle ? titleRef : bodyRef).current;
    const value = isTitle ? title : body;
    const set = isTitle ? setTitle : setBody;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    set(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const run = async (fn, okText) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote({ ok: true, text: okText });
    } catch (err) {
      setNote({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => onSave(eventKey, { title, body }), 'Wording saved.');
  const reset = () => run(() => onSave(eventKey, null), 'Back to the default wording.');
  const submit = () => run(async () => {
    if (dirty) await onSave(eventKey, { title, body });
    await onSubmit(eventKey);
  }, mode === 'live' ? 'Sent to Arattai for review.' : 'Approved (sandbox: nothing was really sent to Arattai).');
  const remove = () => {
    if (!window.confirm(`Delete the Arattai template for "${ev.label}"? This notification won't be sent until a new template is submitted and approved. Your wording is kept.`)) return;
    run(() => onDelete(eventKey), 'Template deleted.');
  };

  const preview = { title: renderMessage(title, ev.sample), text: renderMessage(body, ev.sample) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-brand-text">{ev.label}</h4>
          <p className="text-xs text-brand-text-dim mt-0.5">{ev.description} <span className="font-medium">Goes to: {ev.audience}.</span></p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={status} />
          {status.edited && status.label !== 'Edited since approval' && <span className="text-[11px] text-amber-600 dark:text-amber-400">Edited since submission</span>}
        </div>
      </div>

      {status.reason && <p className="text-xs text-red-600 dark:text-red-400">Arattai rejected it: {status.reason}</p>}
      {state?.lastError && <p className="text-xs text-red-600 dark:text-red-400">Last error: {state.lastError}</p>}
      {state?.submittedAt && <p className="text-[11px] text-brand-text-dim">Submitted {formatWhen(state.submittedAt)}{state.approvedAt ? ` · approved ${formatWhen(state.approvedAt)}` : ''}</p>}
      {status.label !== 'Approved' && status.label !== 'Edited since approval' && (
        <p className="text-xs text-brand-text-dim">Until it is approved, this notification isn’t sent.</p>
      )}
      {status.label === 'Edited since approval' && (
        <p className="text-xs text-brand-text-dim">The approved version is still what gets sent. Resubmit to have the new wording reviewed.</p>
      )}
      {locked && (
        <p className="flex items-start gap-2 text-xs text-brand-text bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
          <Lock size={14} className="shrink-0 mt-0.5" /> Arattai is reviewing this template, so it can’t be edited or resubmitted until the review is done (usually within a day). Use “Refresh statuses” to check.
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor={`${eventKey}-title`} className="text-xs font-medium text-brand-text">Title</label>
        <input id={`${eventKey}-title`} ref={titleRef} type="text" disabled={locked} value={title} onFocus={() => { lastField.current = 'title'; }} onChange={e => setTitle(e.target.value)} className={inputClass} />
        <label htmlFor={`${eventKey}-body`} className="text-xs font-medium text-brand-text block">Body</label>
        <textarea id={`${eventKey}-body`} ref={bodyRef} rows={4} disabled={locked} value={body} onFocus={() => { lastField.current = 'body'; }} onChange={e => setBody(e.target.value)} className={inputClass} />
      </div>

      <div>
        <p className="text-xs font-medium text-brand-text mb-1.5">Placeholders (click to insert at the cursor)</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ev.placeholders).map(([name, help]) => (
            <button key={name} type="button" title={help} disabled={locked} onClick={() => insert(name)}
              className="px-2 py-1 rounded bg-brand-bg border border-brand-card-border text-xs font-mono text-brand-text hover:border-brand-primary disabled:opacity-50">
              {`{${name}}`}
            </button>
          ))}
        </div>
        <details className="mt-2">
          <summary className="text-[11px] text-brand-text-dim cursor-pointer">What each placeholder means</summary>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(ev.placeholders).map(([name, help]) => (
              <li key={name} className="text-[11px] text-brand-text-dim"><span className="font-mono">{`{${name}}`}</span> {help}</li>
            ))}
          </ul>
        </details>
        <p className="text-[11px] text-brand-text-dim mt-2">Arattai templates can’t drop a line, and a value is never empty (it becomes “-”), so put optional things on a line of their own using one placeholder such as {'{noteLine}'}. Plain text only. Keep the title under 60 characters.</p>
      </div>

      <div>
        <p className="text-xs font-medium text-brand-text mb-1.5">Preview (with sample values)</p>
        <div className="rounded-lg bg-brand-bg border border-brand-card-border p-3 text-sm text-brand-text whitespace-pre-wrap break-words">
          <p className="font-bold">{preview.title}{preview.title.length > 60 && <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">{preview.title.length} characters, long for a title</span>}</p>
          <p>{preview.text}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || locked || !dirty || !body.trim()} onClick={save}
          className="flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
          <Save size={14} /> Save wording
        </button>
        <button type="button" disabled={busy || locked || !body.trim()} onClick={submit}
          className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-bold text-sm transition-colors disabled:opacity-50">
          <Send size={14} /> {state?.status ? 'Resubmit' : 'Submit for approval'}
        </button>
        {state?.templateId && (
          <button type="button" disabled={busy || locked} onClick={remove}
            className="flex items-center gap-2 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
            <Trash2 size={14} /> Delete template
          </button>
        )}
        <button type="button" disabled={busy || locked || (isDefault && !saved.custom)} onClick={reset}
          className="flex items-center gap-1.5 text-brand-text-dim hover:text-brand-text px-2 py-2 text-xs transition-colors disabled:opacity-50">
          <RotateCcw size={12} /> Reset to default
        </button>
      </div>
      {!body.trim() && <p className="text-xs text-amber-600 dark:text-amber-400">The body can’t be empty.</p>}
      {note && <p className={`text-xs font-medium ${note.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{note.text}</p>}
    </div>
  );
}
