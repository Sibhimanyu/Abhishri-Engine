import { useState, useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { firestore } from '../firebase';
import { MessageSquareText, Save, RotateCcw } from 'lucide-react';
import { EVENTS, DEFAULT_MESSAGES, mergeMessages, renderMessage } from '../../../functions/src/shared/staffMessages.mjs';

// "Message wording" in Settings > Staff Notifications. Edits are saved to
// configs/staff_messages as { [eventKey]: { title, body } } (admins only) and picked up by
// functions/src/notify within a minute. Placeholders are explained in
// functions/src/shared/staffMessages.mjs.

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text';

function EventCard({ eventKey, saved, onSaved }) {
  const ev = EVENTS[eventKey];
  const def = DEFAULT_MESSAGES[eventKey];
  const [title, setTitle] = useState(saved.title);
  const [body, setBody] = useState(saved.body);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const lastField = useRef('body');
  const titleRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { setTitle(saved.title); setBody(saved.body); }, [saved.title, saved.body]);

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

  const persist = async (next, okText) => {
    setBusy(true);
    setNote(null);
    try {
      await onSaved(eventKey, next);
      setNote({ ok: true, text: okText });
    } catch (err) {
      setNote({ ok: false, text: 'Failed to save: ' + err.message });
    } finally {
      setBusy(false);
    }
  };

  const preview = { title: renderMessage(title, ev.sample), text: renderMessage(body, ev.sample) };

  return (
    <div className="border border-brand-card-border rounded-lg p-5 space-y-4">
      <div>
        <h4 className="font-semibold text-brand-text">{ev.label}</h4>
        <p className="text-xs text-brand-text-dim mt-0.5">{ev.description} <span className="font-medium">Goes to: {ev.audience}.</span></p>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${eventKey}-title`} className="text-xs font-medium text-brand-text">Title</label>
        <input id={`${eventKey}-title`} ref={titleRef} type="text" value={title} onFocus={() => { lastField.current = 'title'; }} onChange={e => setTitle(e.target.value)} className={inputClass} />
        <label htmlFor={`${eventKey}-body`} className="text-xs font-medium text-brand-text block">Body</label>
        <textarea id={`${eventKey}-body`} ref={bodyRef} rows={4} value={body} onFocus={() => { lastField.current = 'body'; }} onChange={e => setBody(e.target.value)} className={inputClass} />
      </div>

      <div>
        <p className="text-xs font-medium text-brand-text mb-1.5">Placeholders (click to insert at the cursor)</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ev.placeholders).map(([name, help]) => (
            <button key={name} type="button" title={help} onClick={() => insert(name)}
              className="px-2 py-1 rounded bg-brand-bg border border-brand-card-border text-xs font-mono text-brand-text hover:border-brand-primary">
              {`{${name}}`}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-0.5">
          {Object.entries(ev.placeholders).map(([name, help]) => (
            <li key={name} className="text-[11px] text-brand-text-dim"><span className="font-mono">{`{${name}}`}</span> {help}</li>
          ))}
        </ul>
        <p className="text-[11px] text-brand-text-dim mt-2">A line whose placeholders are all empty is left out, so “Note: {'{note}'}” disappears when there is no note. Plain text only: Arattai doesn’t show bold or other formatting. Keep the title under 60 characters.</p>
      </div>

      <div>
        <p className="text-xs font-medium text-brand-text mb-1.5">Preview (with sample values)</p>
        <div className="rounded-lg bg-brand-bg border border-brand-card-border p-3 text-sm text-brand-text whitespace-pre-wrap break-words">
          <p className="font-bold">{preview.title}{preview.title.length > 60 && <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">{preview.title.length} characters, long for a title</span>}</p>
          <p>{preview.text}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !dirty || !body.trim()} onClick={() => persist({ title, body }, 'Saved. Messages use it within a minute.')}
          className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-bold text-sm transition-colors disabled:opacity-50">
          <Save size={14} /> Save
        </button>
        <button type="button" disabled={busy || (isDefault && !saved.custom)} onClick={() => persist(null, 'Back to the default wording.')}
          className="flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
          <RotateCcw size={14} /> Reset to default
        </button>
        {!body.trim() && <span className="text-xs text-amber-600 dark:text-amber-400">The body can’t be empty.</span>}
        {note && <span className={`text-xs font-medium ${note.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{note.text}</span>}
      </div>
    </div>
  );
}

export default function StaffMessageWording() {
  const [overrides, setOverrides] = useState(null);

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'staff_messages'))
      .then(snap => setOverrides(snap.exists() ? snap.data() : {}))
      .catch(err => { console.warn('Failed to load staff message wording', err); setOverrides({}); });
  }, []);

  // `next` null resets that event to its default.
  const save = async (eventKey, next) => {
    const out = { ...overrides };
    if (next) out[eventKey] = { title: next.title, body: next.body };
    else delete out[eventKey];
    await setDoc(doc(firestore, 'configs', 'staff_messages'), out);
    setOverrides(out);
  };

  const merged = mergeMessages(overrides);

  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-8 space-y-6">
      <div>
        <h3 className="font-semibold text-brand-text text-lg flex items-center gap-2"><MessageSquareText size={18} className="text-brand-primary" /> Message wording</h3>
        <p className="text-xs text-brand-text-dim mt-1">Edit what each staff notification says. Changes are used within a minute of saving.</p>
      </div>
      {overrides === null ? <p className="text-sm text-brand-text-dim">Loading…</p> : (
        <div className="space-y-5">
          {Object.keys(EVENTS).map(key => (
            <EventCard key={key} eventKey={key} saved={{ ...merged[key], custom: !!overrides[key] }} onSaved={save} />
          ))}
        </div>
      )}
    </div>
  );
}
