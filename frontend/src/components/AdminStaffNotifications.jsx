import { useState, useEffect } from 'react';
import { doc, setDoc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import StaffMessageWording from './StaffMessageWording';
import { BellRing, Save, Send, Users, CheckCircle, AlertCircle } from 'lucide-react';

// Settings > Staff Notifications: the approval, access-request and birthday messages staff
// get on Arattai (configs/arattai_notify, read by functions/src/arattai/notify.js), and
// the wording of each (StaffMessageWording).

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

export default function AdminStaffNotifications() {
  const [cfg, setCfg] = useState({ enabled: false, appUrl: '', groupId: '', phoneMap: {}, template: '' });
  const [templates, setTemplates] = useState([]);
  const [phoneText, setPhoneText] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);
  const [message, setMessage] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'arattai_notify')).then(snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setCfg(c => ({ ...c, ...data }));
      setPhoneText(mapToText(data.phoneMap));
    }).catch(err => console.warn('Failed to load Arattai notification settings', err));
    const q = query(collection(firestore, 'notification_log'), orderBy('at', 'desc'), limit(15));
    const offLog = onSnapshot(q, snap => setLog(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('Failed to load notification log', err));
    const offTemplates = onSnapshot(collection(firestore, 'configs', 'arattai_main', 'templates'),
      snap => setTemplates(snap.docs.map(d => d.data()).filter(t => t.arattai?.id)),
      err => console.warn('Failed to load Arattai templates', err));
    return () => { offLog(); offTemplates(); };
  }, []);

  const say = (text, ok = true) => setMessage({ text, ok });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const next = { enabled: !!cfg.enabled, appUrl: (cfg.appUrl || '').trim().replace(/\/+$/, ''), groupId: (cfg.groupId || '').trim(), phoneMap: textToMap(phoneText), template: cfg.template || '' };
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

  const runCheck = async (send) => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await httpsCallable(functions, send ? 'sendStaffNotificationTest' : 'checkArattaiNotify')();
      setCheck(res.data);
      if (send) {
        const r = res.data.results;
        const ok = ['admins', 'me'].every(k => r[k].status === 'sent');
        say(ok ? `Test sent${res.data.mode === 'sandbox' ? ' (sandbox, so nothing really went out)' : ''}. See the log below.` : 'The test didn’t fully go through. See the log below and the list of who’s missing a phone.', ok);
      }
    } catch (err) {
      say('Check failed: ' + err.message, false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
    <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-8 space-y-6">
      <div>
        <h3 className="font-semibold text-brand-text text-lg flex items-center gap-2"><BellRing size={18} className="text-brand-primary" /> Staff notifications</h3>
        <p className="text-xs text-brand-text-dim mt-1">
          Messages to staff on Arattai: approval requests and outcomes, access requests and Tamil birthdays.
          Approvals are reviewed in the app, through the link in the message.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-md text-sm font-medium border ${message.ok ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>{message.text}</div>
      )}

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
          <label htmlFor="arattai-notify-template" className="text-sm font-medium text-brand-text">Template (Live mode)</label>
          <select id="arattai-notify-template" value={cfg.template || ''} onChange={e => setCfg({ ...cfg, template: e.target.value })} className={inputClass}>
            <option value="">{templates.length ? 'Pick a template' : 'No Live templates synced yet'}</option>
            {templates.map(t => <option key={t.name} value={t.name}>{t.name} ({t.category})</option>)}
          </select>
          <p className="text-xs text-brand-text-dim">
            Arattai only lets businesses message someone first with an approved template. Create a Transactional one with one placeholder
            (the whole message) or two (title, then details), get it approved, sync templates in Arattai Config, and pick it here. Sandbox ignores this.
          </p>
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
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-2.5 rounded-md font-bold text-sm transition-colors disabled:opacity-50">
            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => runCheck(false)} disabled={checking} className="flex-1 flex items-center justify-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-6 py-2.5 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
            <Users size={16} /> Check who gets them
          </button>
          <button type="button" onClick={() => runCheck(true)} disabled={checking} className="flex-1 flex items-center justify-center gap-2 bg-brand-bg border border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5 text-brand-text px-6 py-2.5 rounded-md font-medium text-sm transition-colors disabled:opacity-50">
            <Send size={16} /> Send a test
          </button>
        </div>
        <p className="text-xs text-brand-text-dim -mt-2">Check and test use the saved settings, so save first.</p>
      </form>

      {check && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-lg bg-brand-bg border border-brand-card-border">
          <People label="Admins’ messages" list={check.admins} />
          <People label="Your direct messages" list={check.me} />
        </div>
      )}

      <div>
        <h4 className="text-sm font-bold text-brand-text mb-2">Recent notifications</h4>
        {log.length === 0 ? (
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
                      {n.at?.toDate ? n.at.toDate().toLocaleString() : ''} · to {n.audience}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Chip name="Arattai" result={n.results?.arattai} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
    <StaffMessageWording />
    </div>
  );
}
