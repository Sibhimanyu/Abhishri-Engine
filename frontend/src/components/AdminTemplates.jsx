import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, setDoc, deleteField, onSnapshot } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { FileText } from 'lucide-react';
import { EVENTS, mergeMessages } from '../../../functions/src/shared/staffMessages.mjs';
import TemplateList from './TemplateList';
import TemplateBuilder from './TemplateBuilder';
import { templateStatus, formatWhen } from './StaffMessageWording';
import { statusInfo, formFromRow, duplicateForm, emptyForm, rulesInput } from '../utils/templateUi';

// Settings > Templates (/settings/templates). The routes below it:
//   /settings/templates                   the list
//   /settings/templates/new               an empty builder (/new?copy=<id> starts from a copy)
//   /settings/templates/edit/<id>         the builder on an Arattai template
//   /settings/templates/staff/<eventKey>  the builder in staff mode, on a staff notification
// Server side: functions/src/arattai/templates.js (list/save/delete) and staffTemplates.js.

const callable = (name) => httpsCallable(functions, name);
const BASE = '/settings/templates';

/** Staff mode: wording lives in configs/staff_messages, the template state is written by the server. */
function StaffBuilder({ eventKey, go, flash, setFlash }) {
  const [overrides, setOverrides] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const off = onSnapshot(doc(firestore, 'configs', 'staff_messages'),
      (snap) => setOverrides(snap.exists() ? snap.data() : {}),
      (err) => { console.warn('Failed to load staff message wording', err); setOverrides({}); });
    getDoc(doc(firestore, 'configs', 'arattai_main')).then((snap) => setMode(snap.exists() && snap.data().mode === 'live' ? 'live' : 'sandbox')).catch(() => {});
    return off;
  }, []);

  const merged = overrides ? mergeMessages(overrides)[eventKey] : null;
  const state = overrides?.[eventKey]?.arattai;
  const form0 = useMemo(() => (merged ? { ...emptyForm(), title: merged.title, body: merged.body } : null), [merged?.title, merged?.body]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!EVENTS[eventKey]) return <p className="text-sm text-brand-text-dim">That notification doesn't exist.</p>;
  if (!form0) return <p className="text-sm text-brand-text-dim">Loading…</p>;

  // Wording is merged field by field so the server's `arattai` state is never overwritten.
  const saveWording = (next) => setDoc(doc(firestore, 'configs', 'staff_messages'),
    { [eventKey]: next ? { title: next.title, body: next.body } : { title: deleteField(), body: deleteField() } }, { merge: true });
  const wording = (f) => ({ title: f.title, body: f.body });
  const dirty = (f) => f.title !== merged.title || f.body !== merged.body;
  const status = templateStatus(merged, state);
  const info = state?.submittedAt ? `Submitted ${formatWhen(state.submittedAt)}${state.approvedAt ? ` · approved ${formatWhen(state.approvedAt)}` : ''}` : null;
  const custom = typeof overrides[eventKey]?.title === 'string' || typeof overrides[eventKey]?.body === 'string';

  return (
    <TemplateBuilder
      key={`${merged.title}\n${merged.body}`}
      form0={form0} staff={{ key: eventKey, custom }} mode={mode} status={status} reason={status.reason}
      info={info} lastError={state?.lastError} flash={flash}
      underReview={state?.status === 'under_review'} canDelete={!!state?.templateId}
      onSave={async (f) => { await saveWording(wording(f)); setFlash({ ok: true, text: 'Wording saved.' }); }}
      onSubmit={async (f) => {
        if (dirty(f)) await saveWording(wording(f));
        await callable('submitStaffTemplate')({ key: eventKey });
        setFlash({ ok: true, text: mode === 'live' ? 'Sent to Arattai for review.' : 'Approved (sandbox: nothing was really sent to Arattai).' });
      }}
      onDelete={async () => {
        if (!window.confirm(`Delete the Arattai template for "${EVENTS[eventKey].label}"? This notification won't be sent until a new template is submitted and approved. Your wording is kept.`)) return;
        await callable('deleteStaffTemplate')({ key: eventKey });
        setFlash({ ok: true, text: 'Template deleted.' });
      }}
      onReset={async () => { await saveWording(null); setFlash({ ok: true, text: 'Back to the default wording.' }); }}
      onCancel={() => go(BASE)}
    />
  );
}

export default function AdminTemplates() {
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const rest = location.pathname.split('/').slice(3); // after /settings/templates
  const view = rest[0] || 'list';
  const arg = rest[1] ? decodeURIComponent(rest[1]) : '';
  const copyId = new URLSearchParams(location.search).get('copy') || '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData((await callable('listArattaiTemplates')()).data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const go = (path, keepFlash = false) => {
    if (!keepFlash) setFlash(null);
    navigate(path);
  };

  const remove = async (t) => {
    const staff = t.staffEvent ? `\n\nThis is the template for the "${EVENTS[t.staffEvent]?.label || t.staffEvent}" staff notification. That notification stops until a new template is submitted and approved.` : '';
    if (!window.confirm(`Delete the template "${t.name}"?${staff}`)) return;
    setBusyId(t.id);
    try {
      await callable('deleteArattaiTemplate')({ id: t.id });
      setFlash({ ok: true, text: `Deleted "${t.name}".` });
      if (view === 'edit') navigate(BASE);
      await load();
    } catch (err) {
      setFlash({ ok: false, text: `Couldn't delete: ${err.message}` });
    } finally {
      setBusyId(null);
    }
  };

  const row = view === 'edit' ? data?.templates.find((t) => t.id === arg) : view === 'new' && copyId ? data?.templates.find((t) => t.id === copyId) : null;
  const form0 = useMemo(() => {
    if (view === 'edit' && row) return formFromRow(row);
    if (view === 'new' && copyId && row) return duplicateForm(row);
    return emptyForm();
  }, [view, row, copyId]);

  const save = async (f, submit) => {
    const payload = { id: f.id || undefined, name: f.name, type: f.type, language: f.language, description: f.description, title: f.title, body: f.body, footer: f.footer, placeholders: rulesInput(f).placeholders, submit };
    const res = (await callable('saveArattaiTemplate')(payload)).data;
    setFlash({ ok: true, text: submit ? (res.status === 'approved' ? 'Approved (sandbox: nothing was really sent to Arattai).' : 'Sent to Arattai for review.') : 'Draft saved.' });
    await load();
    navigate(`${BASE}/edit/${encodeURIComponent(res.id)}`, { replace: true });
  };

  let body;
  if (view === 'staff') {
    body = <StaffBuilder key={arg} eventKey={arg} go={go} flash={flash} setFlash={setFlash} />;
  } else if (view === 'new' || view === 'edit') {
    if (view === 'edit' && !data) body = <p className="text-sm text-brand-text-dim">{error ? `Couldn't load templates: ${error}` : 'Loading…'}</p>;
    else if (view === 'edit' && !row) body = <p className="text-sm text-brand-text-dim">That template wasn't found. <button type="button" className="underline" onClick={() => go(BASE)}>Back to templates</button></p>;
    else if (view === 'new' && copyId && !data) body = <p className="text-sm text-brand-text-dim">Loading…</p>;
    else {
      body = (
        <TemplateBuilder
          key={`${row?.id || 'new'}:${row?.modifiedAt || ''}:${row?.status || ''}`}
          form0={form0} mode={data?.mode} status={row ? statusInfo(row.status) : null} reason={row?.reason}
          info={row?.staffEvent ? `Staff: ${EVENTS[row.staffEvent]?.label}` : null}
          flash={flash} underReview={row?.status === 'under_review'} canDelete={!!row}
          onSave={(f) => save(f, false)} onSubmit={(f) => save(f, true)}
          onDelete={() => remove(row)} onCancel={() => go(BASE)}
        />
      );
    }
  } else {
    body = (
      <TemplateList data={data} loading={loading} error={error} flash={flash} busyId={busyId}
        onNew={() => go(`${BASE}/new`)} onRefresh={load}
        onEdit={(t) => go(t.staffEvent ? `${BASE}/staff/${t.staffEvent}` : `${BASE}/edit/${encodeURIComponent(t.id)}`)}
        onDuplicate={(t) => go(`${BASE}/new?copy=${encodeURIComponent(t.id)}`)}
        onDelete={remove} />
    );
  }

  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-5 sm:p-6 space-y-5">
      {view === 'list' && (
        <div>
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-primary" />
            <h3 className="font-semibold text-brand-text text-lg">Templates</h3>
          </div>
          <p className="text-xs text-brand-text-dim mt-1">The Arattai message templates for the school's business. Arattai reviews every new or changed template (usually within a day) before it can be sent.</p>
        </div>
      )}
      {body}
    </div>
  );
}
