import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc, deleteField, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { StatusBadge, templateStatus } from './StaffMessageWording';
import { EVENTS, mergeMessages, renderMessage } from '../../../functions/src/shared/staffMessages.mjs';
import { BellRing, Save, Send, Users, CheckCircle, AlertCircle, RefreshCw, SquarePen } from 'lucide-react';

// Settings > Staff Notifications: the approval, access-request and birthday messages staff
// get on Arattai (configs/arattai_notify, read by functions/src/arattai/notify.js), and
// a compact card per message (its wording is edited in the Templates builder). Layout: a
// status bar, then Messages | Recipients | Log.

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text';

// phoneMap is { appEmail: phone }: the overrides set with Edit in the Recipients list.
// Normalised like the server's normalizePhone (functions/src/arattai/provider.js).
const normalizePhone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d;
};
const SOURCE_LABEL = { override: 'set here', 'staff record': 'from staff record', 'user account': 'from user account' };

function RecipientRow({ r, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = () => { setValue(r.phoneSource === 'override' ? r.phone : ''); setError(''); setEditing(true); };
  const commit = async (clear) => {
    const phone = clear ? '' : normalizePhone(value);
    if (!clear && phone.length < 10) { setError('Enter at least 10 digits.'); return; }
    setBusy(true);
    try { await onSave(r.email, phone); setEditing(false); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <li className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_70px_minmax(0,1.3fr)_auto] gap-x-4 gap-y-1 items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand-text truncate">{r.name || r.email}</p>
        {r.name && <p className="text-[11px] text-brand-text-dim truncate">{r.email}</p>}
      </div>
      <span className={`text-[11px] font-bold ${r.isAdmin ? 'text-brand-primary' : 'text-brand-text-dim'}`}>{r.isAdmin ? 'Admin' : 'Staff'}</span>
      <div className="min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input aria-label={`Phone for ${r.email}`} autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(false); } }} placeholder="98765 43210" className={`${inputClass} !py-1 !px-2 font-mono`} />
            <button type="button" disabled={busy} onClick={() => commit(false)} className="text-xs font-bold text-brand-primary px-1.5 disabled:opacity-50">Save</button>
            {r.phoneSource === 'override' && <button type="button" disabled={busy} onClick={() => commit(true)} className="text-xs font-medium text-red-500 px-1.5 disabled:opacity-50">Clear</button>}
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-brand-text-dim px-1.5">Cancel</button>
          </div>
        ) : r.phone ? (
          <p className="text-sm text-brand-text"><span className="font-mono">{r.phone}</span> <span className="text-[11px] text-brand-text-dim">{SOURCE_LABEL[r.phoneSource]}</span></p>
        ) : <p className="text-[11px] text-brand-text-dim">None</p>}
        {error && <p className="text-[11px] text-red-500">{error}</p>}
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        {r.phone
          ? <span title="Will get messages" className="inline-flex items-center text-green-600 dark:text-green-400"><CheckCircle size={16} /></span>
          : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400"><AlertCircle size={14} /> No phone, won’t get messages</span>}
        {!editing && <button type="button" onClick={start} className="text-xs font-medium text-brand-primary hover:underline">Edit</button>}
      </div>
    </li>
  );
}

const STATUS = {
  sent: 'bg-green-500/10 text-green-600 dark:text-green-400',
  partial: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  skipped: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  off: 'bg-black/5 dark:bg-white/5 text-brand-text-dim',
};

function Chip({ name, result }) {
  const status = result?.status || 'off';
  const detail = [
    result?.reason,
    result?.error,
    ...(result?.failed || []).map(f => `${f.to}: ${f.error}`),
    result?.skipped?.length ? `No phone: ${result.skipped.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  return (
    <span title={detail || undefined} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${STATUS[status] || STATUS.off}`}>
      {name}: {status}{result?.mode === 'sandbox' ? ' (sandbox)' : ''}
    </span>
  );
}

function People({ label, list }) {
  if (list.group) return <p className="text-sm text-brand-text"><span className="font-medium">{label}:</span> the Arattai group <span className="font-mono">{list.group}</span></p>;
  return (
    <div>
      <p className="text-sm font-medium text-brand-text mb-1">{label}</p>
      {list.people.length === 0 ? <p className="text-xs text-brand-text-dim">Nobody.</p> : (
        <ul className="space-y-1">
          {list.people.map(p => (
            <li key={p.email} className="flex items-center justify-between text-xs gap-2">
              <span className="text-brand-text truncate">{p.email}</span>
              {p.phone
                ? <span className="font-mono text-brand-text-dim shrink-0">{p.phone}</span>
                : <span className="text-red-500 font-bold shrink-0">No phone, will be skipped</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = [['messages', 'Messages'], ['recipients', 'Recipients'], ['log', 'Log']];
const callable = (name) => httpsCallable(functions, name);

function Stat({ label, children }) {
  return <div className="flex flex-col"><span className="text-[10px] uppercase tracking-wide text-brand-text-dim">{label}</span><span className="text-sm font-semibold text-brand-text">{children}</span></div>;
}

export default function AdminStaffNotifications() {
  const [cfg, setCfg] = useState({ enabled: false, appUrl: '', groupId: '', phoneMap: {} });
  const [mode, setMode] = useState(null);
  const [people, setPeople] = useState(null);
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);
  const [message, setMessage] = useState(null);
  const [log, setLog] = useState([]);
  const [overrides, setOverrides] = useState(null);
  const [tab, setTab] = useState('messages');
  const [busy, setBusy] = useState(null);

  const say = (text, ok = true) => setMessage({ text, ok });

  const runCheck = async (send) => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await callable(send ? 'sendStaffNotificationTest' : 'checkArattaiNotify')();
      setCheck(res.data);
      if (res.data?.mode) setMode(res.data.mode);
      if (send) {
        const r = res.data.results;
        const ok = ['admins', 'me'].every(k => r[k].status === 'sent');
        say(ok ? `Test sent${res.data.mode === 'sandbox' ? ' (sandbox, so nothing really went out)' : ''}. See the Log tab.` : 'The test didn’t fully go through (a missing phone, or its template isn’t approved yet). See the Log and Recipients tabs.', ok);
      }
    } catch (err) {
      say('Check failed: ' + err.message, false);
    } finally {
      setChecking(false);
    }
  };

  const loadPeople = async () => {
    setLoadingPeople(true);
    try {
      const res = await callable('listStaffNotificationRecipients')();
      setPeople(res.data.recipients || []);
    } catch (err) {
      say('Couldn’t load recipients: ' + err.message, false);
    } finally {
      setLoadingPeople(false);
    }
  };

  // An override is a phoneMap entry; an empty phone clears it.
  const saveOverride = async (email, phone) => {
    await setDoc(doc(firestore, 'configs', 'arattai_notify'), { phoneMap: { [email]: phone || deleteField() } }, { merge: true });
    setCfg(c => { const m = { ...(c.phoneMap || {}) }; if (phone) m[email] = phone; else delete m[email]; return { ...c, phoneMap: m }; });
    await loadPeople();
  };

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'arattai_notify')).then(snap => {
      if (!snap.exists()) return;
      const data = { ...snap.data() };
      delete data.template; // the old single template is no longer used
      setCfg(c => ({ ...c, ...data }));
    }).catch(err => console.warn('Failed to load Arattai notification settings', err));
    getDoc(doc(firestore, 'configs', 'arattai_main')).then(snap => setMode(snap.exists() && snap.data().mode === 'live' ? 'live' : 'sandbox')).catch(() => {});
    const q = query(collection(firestore, 'notification_log'), orderBy('at', 'desc'), limit(15));
    const offLog = onSnapshot(q, snap => setLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('Failed to load notification log', err));
    const offWording = onSnapshot(doc(firestore, 'configs', 'staff_messages'),
      snap => setOverrides(snap.exists() ? snap.data() : {}),
      err => { console.warn('Failed to load staff message wording', err); setOverrides({}); });
    runCheck(false);
    loadPeople();
    return () => { offLog(); offWording(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const next = { enabled: !!cfg.enabled, appUrl: (cfg.appUrl || '').trim().replace(/\/+$/, ''), groupId: (cfg.groupId || '').trim(), phoneMap: cfg.phoneMap || {} };
      // Not merged: this also drops the old `template` field.
      await setDoc(doc(firestore, 'configs', 'arattai_notify'), next);
      setCfg(next);
      say('Staff notification settings saved.');
    } catch (err) {
      say('Failed to save: ' + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setBusy('refresh');
    setMessage(null);
    try {
      const res = await callable('refreshStaffTemplates')();
      say(res.data.mode === 'sandbox' ? 'Sandbox: templates are approved as soon as they are submitted.' : `Checked ${res.data.checked} template${res.data.checked === 1 ? '' : 's'} with Arattai.`);
    } catch (err) {
      say('Couldn’t refresh: ' + err.message, false);
    } finally {
      setBusy(null);
    }
  };

  const merged = mergeMessages(overrides);
  const keys = Object.keys(EVENTS);
  const statusOf = (key) => templateStatus(merged[key], overrides?.[key]?.arattai);
  const adminList = (people || []).filter(p => p.isAdmin);
  const adminsWithPhone = adminList.filter(p => p.phone).length;
  const withoutPhone = (people || []).filter(p => !p.phone).length;
  const shown = (people || []).filter(p => !adminsOnly || p.isAdmin);

  return (
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <BellRing size={18} className="text-brand-primary" />
        <h3 className="font-semibold text-brand-text text-lg">Staff notifications</h3>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-3 rounded-lg bg-brand-bg border border-brand-card-border">
        <Stat label="Sending">{cfg.enabled ? <span className="text-green-600 dark:text-green-400">On</span> : <span className="text-brand-text-dim">Off</span>}</Stat>
        <Stat label="Mode">{mode === 'live' ? 'Live' : mode === 'sandbox' ? 'Sandbox' : '…'}</Stat>
        <Stat label="Recipients">{cfg.groupId ? 'Group' : people == null ? '…' : `${adminsWithPhone} of ${adminList.length} admins with phones`}</Stat>
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={() => runCheck(true)} disabled={checking} className="flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-3 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
            <Send size={14} /> Send a test
          </button>
          <button type="button" onClick={refresh} disabled={busy === 'refresh'} className="flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-3 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={busy === 'refresh' ? 'animate-spin' : ''} /> Refresh statuses
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-md text-sm font-medium border ${message.ok ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>{message.text}</div>
      )}

      <div className="space-y-4">
        <div role="tablist" className="inline-flex rounded-md border border-brand-card-border bg-brand-bg p-0.5">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${tab === id ? 'bg-brand-primary text-white' : 'text-brand-text-dim hover:text-brand-text'}`}>{label}</button>
          ))}
        </div>

        <div className="min-w-0 space-y-4">
          {tab === 'messages' && (
            <div className="space-y-3">
              <p className="text-[11px] text-brand-text-dim">Each message is an Arattai template. Arattai reviews every change (usually within a day); until it’s approved, this notification isn’t sent. Edit the wording in the template builder.</p>
              {overrides === null ? <p className="text-sm text-brand-text-dim">Loading…</p> : (
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {keys.map(k => {
                    const st = statusOf(k);
                    const preview = renderMessage(merged[k].body, EVENTS[k].sample).replace(/\s*\n\s*/g, ' ');
                    return (
                      <li key={k} className="border border-brand-card-border rounded-lg p-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-brand-text">{EVENTS[k].label}</p>
                            <p className="text-[11px] text-brand-text-dim">Goes to: {EVENTS[k].audience}</p>
                          </div>
                          <StatusBadge status={st} />
                        </div>
                        <p className="text-xs text-brand-text-dim truncate" title={preview}>{preview}</p>
                        <Link to={`/settings/templates/staff/${k}`} className="self-start flex items-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-3 py-1.5 rounded-md font-medium text-sm transition-colors">
                          <SquarePen size={14} /> Open in builder
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === 'recipients' && (
            <form onSubmit={save} className="space-y-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={!!cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} className="w-4 h-4 accent-brand-primary" />
                <span className="text-sm font-medium text-brand-text">Send staff notifications on Arattai</span>
              </label>

              <div className="space-y-2">
                <label htmlFor="arattai-app-url" className="text-sm font-medium text-brand-text">App address</label>
                <input id="arattai-app-url" type="text" value={cfg.appUrl || ''} onChange={e => setCfg({ ...cfg, appUrl: e.target.value })} placeholder="https://abhishri-academy.web.app" className={inputClass} />
                <p className="text-xs text-brand-text-dim">Where the links in messages point. Leave empty for the default.</p>
              </div>

              {mode !== 'live' && (
                <div className="space-y-2">
                  <label htmlFor="arattai-group" className="text-sm font-medium text-brand-text">Admins’ group ID (optional)</label>
                  <input id="arattai-group" type="text" value={cfg.groupId || ''} onChange={e => setCfg({ ...cfg, groupId: e.target.value })} placeholder="Leave empty to message each admin" className={inputClass} />
                  <p className="text-xs text-brand-text-dim">What goes to all the admins. With no group, every admin gets it as a direct message. Sandbox only: live Arattai can’t post to groups.</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-brand-text">Who gets them</span>
                  <div role="group" aria-label="Filter" className="inline-flex rounded-md border border-brand-card-border bg-brand-bg p-0.5 ml-auto">
                    {[[true, 'Admins only'], [false, 'Everyone']].map(([v, label]) => (
                      <button key={label} type="button" aria-pressed={adminsOnly === v} onClick={() => setAdminsOnly(v)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${adminsOnly === v ? 'bg-brand-primary text-white' : 'text-brand-text-dim hover:text-brand-text'}`}>{label}</button>
                    ))}
                  </div>
                  <button type="button" onClick={loadPeople} disabled={loadingPeople} className="flex items-center gap-1.5 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-3 py-1.5 rounded-md font-medium text-xs transition-colors disabled:opacity-50">
                    <RefreshCw size={12} className={loadingPeople ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
                {people === null ? <p className="text-sm text-brand-text-dim">Loading…</p> : (
                  <>
                    <p className="text-xs text-brand-text-dim">{adminList.length} admin{adminList.length === 1 ? '' : 's'} will get admin notifications · {withoutPhone} without a phone</p>
                    {shown.length === 0 ? <p className="text-xs text-brand-text-dim">Nobody yet.</p> : (
                      <ul className="divide-y divide-brand-card-border border border-brand-card-border rounded-lg">
                        {shown.map(r => <RecipientRow key={r.email} r={r} onSave={saveOverride} />)}
                      </ul>
                    )}
                    <p className="text-xs text-brand-text-dim">Messages go to the phone on each person’s staff record or user account. Use Edit to set a different one (for example, an admin who signs in with another email).</p>
                  </>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-2.5 rounded-md font-bold text-sm transition-colors disabled:opacity-50">
                  <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => runCheck(false)} disabled={checking} className="flex items-center justify-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-6 py-2.5 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
                  <Users size={16} /> Check who gets them
                </button>
              </div>
              <p className="text-xs text-brand-text-dim -mt-2">Check and test use the saved settings, so save first.</p>

              {check && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg bg-brand-bg border border-brand-card-border">
                  <People label="Admins’ messages" list={check.admins} />
                  <People label="Your direct messages" list={check.me} />
                </div>
              )}
            </form>
          )}

          {tab === 'log' && (
            log.length === 0 ? (
              <p className="text-xs text-brand-text-dim">None yet. Notifications appear here once one is sent.</p>
            ) : (
              <ul className="divide-y divide-brand-card-border border border-brand-card-border rounded-lg">
                {log.map(n => {
                  const anyBad = ['failed', 'partial', 'skipped'].includes(n.results?.arattai?.status);
                  return (
                    <li key={n.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      {anyBad ? <AlertCircle size={16} className="text-amber-500 shrink-0" /> : <CheckCircle size={16} className="text-green-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-brand-text truncate" title={n.text}>{n.title || n.kind}</p>
                        <p className="text-[11px] text-brand-text-dim truncate">
                          {n.at?.toDate ? n.at.toDate().toLocaleString() : ''} · to {n.audience}{n.results?.arattai?.reason ? ` · ${n.results.arattai.reason}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Chip name="Arattai" result={n.results?.arattai} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}
