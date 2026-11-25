import { useState, useRef } from 'react';
import { Save, Send, Trash2, RotateCcw, Lock, Plus, X, Check, ArrowLeft } from 'lucide-react';
import { CATEGORIES, LANGUAGES, templateProblems, suggestName } from '../../../functions/src/shared/templateRules.mjs';
import { EVENTS, DEFAULT_MESSAGES, templateProblems as staffProblems, templateName } from '../../../functions/src/shared/staffMessages.mjs';
import { StatusBadge } from './StaffMessageWording';
import TemplatePreview from './TemplatePreview';
import { variablesOf, rulesInput, insertAt, newVariableName, doubleBraces } from '../utils/templateUi';

// The template builder: a form on the left, the rule checklist under it, a chat preview on the
// right. Two modes:
//   - normal: any Arattai template; variables are {{snake_name}} with sample values.
//   - staff (`staff` prop): one staff notification event. Name, category and language are
//     fixed, the variables are the event's {camelName} placeholders and the samples are the
//     event's own. AdminTemplates.jsx supplies the data and the save/submit/delete callbacks.

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text disabled:opacity-60';
const labelClass = 'text-xs font-medium text-brand-text block mb-1';
const ghostBtn = 'flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50';
const primaryBtn = 'flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-md font-bold text-sm transition-colors disabled:opacity-50';
const dangerBtn = 'flex items-center gap-2 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50';

export default function TemplateBuilder({ form0, staff, mode, status, reason, info, lastError, flash, underReview, canDelete, onSave, onSubmit, onDelete, onReset, onCancel }) {
  const [form, setForm] = useState(form0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [varInput, setVarInput] = useState('');
  const nameTouched = useRef(!!form0.name);
  const lastField = useRef('body');
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const footerRef = useRef(null);
  const isStaff = !!staff;
  const ev = isStaff ? EVENTS[staff.key] : null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const dirty = JSON.stringify({ ...form, extra: [] }) !== JSON.stringify({ ...form0, extra: [] });

  const setTitle = (title) => {
    const patch = { title };
    if (!isStaff && !nameTouched.current) patch.name = suggestName(title);
    set(patch);
  };

  const problems = isStaff ? staffProblems(staff.key, form) : templateProblems(rulesInput(form));
  const variables = isStaff ? Object.keys(ev.placeholders) : variablesOf(form);
  const used = new Set(variablesOf({ ...form, extra: [] }));

  // Insert text at the cursor of whichever of title / body / footer was used last.
  const insert = (token) => {
    const field = isStaff && lastField.current === 'footer' ? 'body' : lastField.current;
    const el = { title: titleRef, body: bodyRef, footer: footerRef }[field].current;
    const r = insertAt(form[field] || '', el?.selectionStart, el?.selectionEnd, token);
    set({ [field]: r.value });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.cursor, r.cursor);
    });
  };

  const addVariable = () => {
    const name = newVariableName(varInput);
    if (!name) return;
    setForm((f) => ({ ...f, extra: f.extra.includes(name) ? f.extra : [...f.extra, name], samples: { ...f.samples, [name]: f.samples[name] ?? '' } }));
    insert(`{{${name}}}`);
    setVarInput('');
  };

  const removeVariable = (name) => setForm((f) => {
    const samples = { ...f.samples };
    delete samples[name];
    return { ...f, extra: f.extra.filter((n) => n !== name), samples };
  });

  const run = async (fn) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (err) {
      setNote({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const confirmReplace = (what) => !underReview || window.confirm(`Arattai is reviewing "${isStaff ? ev.label : form.name}". ${what} replaces it with your new wording and restarts the review. Continue?`);
  const save = () => confirmReplace('Saving') && run(() => onSave(form, { submit: false }));
  const submit = () => confirmReplace('Submitting') && run(() => onSubmit(form));
  const remove = () => run(() => onDelete());
  const reset = () => run(() => onReset());

  const previewSamples = isStaff ? ev.sample : form.samples;
  const pv = (t) => (isStaff ? doubleBraces(t) : t);
  const title = isStaff ? ev.label : form.name || 'New template';
  const canSubmit = !busy && problems.length === 0;
  const canSave = isStaff ? !busy && dirty && !!form.body.trim() : canSubmit && (dirty || !form.id);
  const def = isStaff ? DEFAULT_MESSAGES[staff.key] : null;
  const isDefault = isStaff && form.title === def.title && form.body === def.body;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button type="button" onClick={onCancel} aria-label="Back to templates" className="mt-0.5 p-1.5 rounded-md text-brand-text-dim hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5"><ArrowLeft size={18} /></button>
          <div className="min-w-0">
            <h3 className="font-semibold text-brand-text text-lg truncate">{title}</h3>
            <p className="text-xs text-brand-text-dim mt-0.5">
              {isStaff ? <>{ev.description} <span className="font-medium">Goes to: {ev.audience}.</span></> : form0.id ? 'Edit this template.' : 'Write a new Arattai message template.'}
            </p>
          </div>
        </div>
        {status && <StatusBadge status={status} />}
      </div>

      {reason && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-2.5">Arattai rejected it: {reason}</p>}
      {lastError && <p className="text-xs text-red-600 dark:text-red-400">Last error: {lastError}</p>}
      {info && <p className="text-[11px] text-brand-text-dim">{info}</p>}
      {underReview && (
        <p className="flex items-start gap-2 text-xs text-brand-text bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
          <Lock size={14} className="shrink-0 mt-0.5" /> Arattai is reviewing this template. Saving or submitting again replaces it with your new wording and restarts the review.
        </p>
      )}
      {mode === 'sandbox' && <p className="text-[11px] text-brand-text-dim">Sandbox mode: submitting approves the template straight away and nothing is sent to Arattai.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          {/* Name, category, language, description */}
          {isStaff ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[['Name', templateName(staff.key)], ['Category', CATEGORIES.transaction.label], ['Language', LANGUAGES.en]].map(([l, v]) => (
                <div key={l}>
                  <span className={labelClass}>{l}</span>
                  <p className="flex items-center gap-1.5 text-sm text-brand-text-dim bg-black/5 dark:bg-white/5 rounded-md py-2 px-3 truncate"><Lock size={12} className="shrink-0" /> <span className="truncate">{v}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="tpl-name" className={labelClass}>Name</label>
                <input id="tpl-name" type="text" value={form.name} onChange={(e) => { nameTouched.current = true; set({ name: e.target.value }); }} placeholder="fee_reminder_notice" className={`${inputClass} font-mono`} />
                <p className="text-[11px] text-brand-text-dim mt-1">10 to 120 characters: lowercase letters, digits and underscores.</p>
              </div>
              <div>
                <span id="tpl-cat" className={labelClass}>Category</span>
                <div role="group" aria-labelledby="tpl-cat" className="inline-flex flex-wrap rounded-md border border-brand-card-border bg-brand-bg p-0.5">
                  {Object.entries(CATEGORIES).map(([k, c]) => (
                    <button key={k} type="button" aria-pressed={form.type === k} onClick={() => set({ type: k })}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${form.type === k ? 'bg-brand-primary text-white' : 'text-brand-text-dim hover:text-brand-text'}`}>{c.label}</button>
                  ))}
                </div>
                <p className="text-[11px] text-brand-text-dim mt-1">{CATEGORIES[form.type]?.help}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="tpl-lang" className={labelClass}>Language</label>
                  <select id="tpl-lang" value={form.language} onChange={(e) => set({ language: e.target.value })} className={inputClass}>
                    {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="tpl-desc" className={labelClass}>Description</label>
                <textarea id="tpl-desc" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What this message is for, in a sentence or two (30 to 1000 characters)." className={inputClass} />
                <p className="text-[11px] text-brand-text-dim mt-1">{form.description.trim().length} characters. Only you and Arattai's reviewers see this.</p>
              </div>
            </>
          )}

          {/* Wording */}
          <div className="space-y-3">
            <div>
              <label htmlFor="tpl-title" className={labelClass}>Title (optional)</label>
              <input id="tpl-title" ref={titleRef} type="text" value={form.title} onFocus={() => { lastField.current = 'title'; }} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="tpl-body" className={labelClass}>Body</label>
              <textarea id="tpl-body" ref={bodyRef} rows={6} value={form.body} onFocus={() => { lastField.current = 'body'; }} onChange={(e) => set({ body: e.target.value })} className={inputClass} />
            </div>
            {!isStaff && (
              <div>
                <label htmlFor="tpl-footer" className={labelClass}>Footer (optional)</label>
                <input id="tpl-footer" ref={footerRef} type="text" value={form.footer} onFocus={() => { lastField.current = 'footer'; }} onChange={(e) => set({ footer: e.target.value })} className={inputClass} />
              </div>
            )}
          </div>

          {/* Variables */}
          <div>
            <p className={labelClass}>{isStaff ? 'Placeholders (click to insert at the cursor)' : 'Variables (click to insert at the cursor)'}</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((name) => (
                <span key={name} className="inline-flex items-center rounded bg-brand-bg border border-brand-card-border text-xs font-mono text-brand-text">
                  <button type="button" title={isStaff ? ev.placeholders[name] : undefined} onClick={() => insert(isStaff ? `{${name}}` : `{{${name}}}`)} className="px-2 py-1 hover:text-brand-primary">
                    {isStaff ? `{${name}}` : `{{${name}}}`}
                  </button>
                  {!isStaff && !used.has(name) && (
                    <button type="button" aria-label={`Remove ${name}`} title="Not used, remove" onClick={() => removeVariable(name)} className="pr-1.5 text-brand-text-dim hover:text-red-500"><X size={12} /></button>
                  )}
                </span>
              ))}
              {variables.length === 0 && <span className="text-xs text-brand-text-dim">None yet.</span>}
            </div>
            {isStaff ? (
              <details className="mt-2">
                <summary className="text-[11px] text-brand-text-dim cursor-pointer">What each placeholder means</summary>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(ev.placeholders).map(([name, help]) => <li key={name} className="text-[11px] text-brand-text-dim"><span className="font-mono">{`{${name}}`}</span> {help}</li>)}
                </ul>
              </details>
            ) : (
              <div className="flex gap-2 mt-2">
                <input type="text" aria-label="New variable name" value={varInput} onChange={(e) => setVarInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariable(); } }} placeholder="student_name" className={`${inputClass} font-mono max-w-[220px]`} />
                <button type="button" onClick={addVariable} disabled={!newVariableName(varInput)} className={ghostBtn}><Plus size={14} /> Add variable</button>
              </div>
            )}
            {isStaff && <p className="text-[11px] text-brand-text-dim mt-2">Arattai templates can't drop a line, and a value is never empty (it becomes "-"), so put optional things on a line of their own using one placeholder such as {'{noteLine}'}. Plain text only.</p>}
          </div>

          {/* Samples */}
          {variables.length > 0 && (
            <div>
              <p className={labelClass}>Sample values{isStaff ? '' : ' (Arattai needs one for each variable)'}</p>
              <ul className="space-y-2">
                {variables.map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 text-xs font-mono text-brand-text truncate" title={name}>{isStaff ? `{${name}}` : `{{${name}}}`}</span>
                    {isStaff
                      ? <span className="text-xs text-brand-text-dim truncate">{String(ev.sample[name] ?? '')}</span>
                      : <input type="text" aria-label={`Sample for ${name}`} value={form.samples[name] ?? ''} onChange={(e) => set({ samples: { ...form.samples, [name]: e.target.value } })} className={inputClass} />}
                  </li>
                ))}
              </ul>
              {!isStaff && <p className="text-[11px] text-brand-text-dim mt-1">Letters, digits, spaces, commas and full stops only, up to 50 characters, and not a link.</p>}
            </div>
          )}

          {/* Rule checks */}
          <div aria-live="polite" className="rounded-lg border border-brand-card-border bg-brand-bg p-3">
            <p className="text-xs font-medium text-brand-text mb-2">Checks</p>
            {problems.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400"><Check size={14} /> Ready to submit.</p>
            ) : (
              <ul className="space-y-1">
                {problems.map((p) => <li key={p} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400"><X size={14} className="shrink-0 mt-px" /> {p}</li>)}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!canSave} onClick={save} className={ghostBtn}><Save size={14} /> {isStaff ? 'Save wording' : 'Save draft'}</button>
            <button type="button" disabled={!canSubmit} onClick={submit} className={primaryBtn}><Send size={14} /> {isStaff ? (status?.label && status.label !== 'Not submitted' ? 'Resubmit' : 'Submit for approval') : 'Submit for review'}</button>
            {canDelete && <button type="button" disabled={busy} onClick={remove} className={dangerBtn}><Trash2 size={14} /> Delete template</button>}
            <button type="button" disabled={busy} onClick={onCancel} className="text-brand-text-dim hover:text-brand-text px-2 py-2 text-sm transition-colors">Cancel</button>
            {isStaff && (
              <button type="button" disabled={busy || (isDefault && !staff.custom)} onClick={reset} className="flex items-center gap-1.5 text-brand-text-dim hover:text-brand-text px-2 py-2 text-xs transition-colors disabled:opacity-50">
                <RotateCcw size={12} /> Reset to default
              </button>
            )}
          </div>
          {problems.length > 0 && !isStaff && <p className="text-[11px] text-brand-text-dim -mt-3">Fix the checks above to save or submit.</p>}
          {note && <p className="text-xs font-medium text-red-600 dark:text-red-400">{note.text}</p>}
          {!note && flash && <p className={`text-xs font-medium ${flash.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{flash.text}</p>}
        </div>

        <div className="lg:sticky lg:top-4">
          <TemplatePreview title={pv(form.title)} body={pv(form.body)} footer={isStaff ? '' : form.footer} samples={previewSamples} />
        </div>
      </div>
    </div>
  );
}
