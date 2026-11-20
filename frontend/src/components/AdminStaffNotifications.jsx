import { useState, useEffect } from 'react';
import { doc, setDoc, deleteField, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import StaffMessageEditor, { StatusDot, templateStatus, recipientOf } from './StaffMessageWording';
import { EVENTS, mergeMessages } from '../../../functions/src/shared/staffMessages.mjs';
import { BellRing, Save, Send, Users, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

// Settings > Staff Notifications: the approval, access-request and birthday messages staff
// get on Arattai (configs/arattai_notify, read by functions/src/arattai/notify.js), and
// the wording and Arattai template of each (StaffMessageEditor). Layout: a status bar, then
// the event list on the left and, on the right, Messages | Recipients | Log.

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text';

// phoneMap is { appEmail: phone }, edited as one "email = phone" line per person.
const mapToText = (map) => Object.entries(map || {}).map(([e, p]) => `${e} = ${p}`).join('\n');
const textToMap = (text) => Object.fromEntries(text.split('\n')
  .map(line => line.split('=').map(part => part.trim()))
  .filter(([e, p]) => e && p && e.includes('@') && p.replace(/\D/g, '').length >= 10)
  .map(([e, p]) => [e.toLowerCase(), p]));

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
  const [phoneText, setPhoneText] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);
  const [message, setMessage] = useState(null);
  const [log, setLog] = useState([]);
  const [overrides, setOverrides] = useState(null);
  const [tab, setTab] = useState('messages');
  const [selected, setSelected] = useState(Object.keys(EVENTS)[0]);
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

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'arattai_notify')).then(snap => {
      if (!snap.exists()) return;
      const data = { ...snap.data() };
      delete data.template; // the old single template is no longer used
      setCfg(c => ({ ...c, ...data }));
      setPhoneText(mapToText(data.phoneMap));
    }).catch(err => console.warn('Failed to load Arattai notification settings', err));
    getDoc(doc(firestore, 'configs', 'arattai_main')).then(snap => setMode(snap.exists() && snap.data().mode === 'live' ? 'live' : 'sandbox')).catch(() => {});
    const q = query(collection(firestore, 'notification_log'), orderBy('at', 'desc'), limit(15));
    const offLog = onSnapshot(q, snap => setLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('Failed to load notification log', err));
    const offWording = onSnapshot(doc(firestore, 'configs', 'staff_messages'),
      snap => setOverrides(snap.exists() ? snap.data() : {}),
      err => { console.warn('Failed to load staff message wording', err); setOverrides({}); });
    runCheck(false);
    return () => { offLog(); offWording(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const next = { enabled: !!cfg.enabled, appUrl: (cfg.appUrl || '').trim().replace(/\/+$/, ''), groupId: (cfg.groupId || '').trim(), phoneMap: textToMap(phoneText) };
      // Not merged: this also drops the old `template` field.
      await setDoc(doc(firestore, 'configs', 'arattai_notify'), next);
      setCfg(next);
      setPhoneText(mapToText(next.phoneMap));
      say('Staff notification settings saved.');
    } catch (err) {
      say('Failed to save: ' + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  // Wording is merged field by field so the server's `arattai` state is never overwritten.
  const saveWording = async (key, next) => {
    const value = next ? { title: next.title, body: next.body } : { title: deleteField(), body: deleteField() };
    await setDoc(doc(firestore, 'configs', 'staff_messages'), { [key]: value }, { merge: true });
  };
  const submitTemplate = async (key) => { await callable('submitStaffTemplate')({ key }); };
  const deleteTemplate = async (key) => { await callable('deleteStaffTemplate')({ key }); };
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
  const phones = check ? new Set((check.admins.people || []).filter(p => p.phone).map(p => p.phone)).size : null;

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
        <Stat label="Recipients">{cfg.groupId ? 'Group' : phones == null ? '…' : `${phones} with phones`}</Stat>
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

      <div className="flex flex-col md:flex-row gap-5">
        {/* Event list (desktop) / dropdown (mobile) */}
        <nav aria-label="Notifications" className="md:w-60 shrink-0">
          <label htmlFor="staff-event-select" className="sr-only">Notification</label>
          <select id="staff-event-select" value={selected} onChange={e => { setSelected(e.target.value); setTab('messages'); }} className={`md:hidden ${inputClass}`}>
            {keys.map(k => <option key={k} value={k}>{EVENTS[k].label} · {recipientOf(k)} · {statusOf(k).label}</option>)}
          </select>
          <ul className="hidden md:block space-y-1">
            {keys.map(k => {
              const st = statusOf(k);
              const active = tab === 'messages' && selected === k;
              return (
                <li key={k}>
                  <button type="button" onClick={() => { setSelected(k); setTab('messages'); }} title={st.label}
                    className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md border transition-colors ${active ? 'bg-brand-primary/10 border-brand-primary/30' : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'}`}>
                    <StatusDot tone={st.tone} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-brand-text truncate">{EVENTS[k].label}</span>
                      <span className="block text-[11px] text-brand-text-dim">{recipientOf(k)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hidden md:block text-[11px] text-brand-text-dim mt-3 px-1">Each message is an Arattai template. Arattai reviews every change (usually within a day); until it’s approved, this notification isn’t sent.</p>
        </nav>

        {/* Right pane */}
        <div className="flex-1 min-w-0 space-y-4">
          <div role="tablist" className="inline-flex rounded-md border border-brand-card-border bg-brand-bg p-0.5">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${tab === id ? 'bg-brand-primary text-white' : 'text-brand-text-dim hover:text-brand-text'}`}>{label}</button>
            ))}
          </div>

          {tab === 'messages' && (
            <div className="border border-brand-card-border rounded-lg p-4 sm:p-5">
              <p className="md:hidden text-[11px] text-brand-text-dim mb-3">Each message is an Arattai template. Arattai reviews every change (usually within a day); until it’s approved, this notification isn’t sent.</p>
              {overrides === null ? <p className="text-sm text-brand-text-dim">Loading…</p> : (
                <StaffMessageEditor key={selected} eventKey={selected}
                  saved={{ ...merged[selected], custom: typeof overrides[selected]?.title === 'string' || typeof overrides[selected]?.body === 'string' }}
                  state={overrides[selected]?.arattai} mode={mode}
                  onSave={saveWording} onSubmit={submitTemplate} onDelete={deleteTemplate} />
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

              <div className="space-y-2">
                <label htmlFor="arattai-group" className="text-sm font-medium text-brand-text">Admins’ group ID (optional)</label>
                <input id="arattai-group" type="text" value={cfg.groupId || ''} onChange={e => setCfg({ ...cfg, groupId: e.target.value })} placeholder="Leave empty to message each admin" className={inputClass} />
                <p className="text-xs text-brand-text-dim">What goes to all the admins. With no group, every admin gets it as a direct message. Live Arattai can’t post to groups, so leave this empty there.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="arattai-phones" className="text-sm font-medium text-brand-text">Phone numbers</label>
                <textarea id="arattai-phones" rows={3} value={phoneText} onChange={e => setPhoneText(e.target.value)} placeholder={'admin@gmail.com = 98765 43210'} className={`${inputClass} font-mono`} />
                <p className="text-xs text-brand-text-dim">
                  Messages go to the phone on each person’s staff record. List anyone without one here (one <span className="font-mono">app email = phone</span> per line),
                  such as admins who sign in with a different email from their staff record.
                </p>
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
