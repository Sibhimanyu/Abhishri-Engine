import { CenteredSpinner } from './Spinner';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { CheckCircle, AlertCircle, Save, Send, Loader2 } from 'lucide-react';

// Zoho Cliq bot settings (configs/cliq, read by functions/src/cliq). Approval requests
// and feedback go to the admins' channel; approval outcomes are DMed to the teacher.
const DOMAINS = [
  ['cliq.zoho.in', 'India (cliq.zoho.in)'],
  ['cliq.zoho.com', 'US (cliq.zoho.com)'],
  ['cliq.zoho.eu', 'Europe (cliq.zoho.eu)'],
  ['cliq.zoho.com.au', 'Australia (cliq.zoho.com.au)'],
];

const EMPTY = { enabled: false, domain: 'cliq.zoho.in', botName: '', channel: '', webhookToken: '', appUrl: 'https://abhishri-academy.web.app' };

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text';

function Field({ label, hint, children }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-brand-text">{label}</label>
      {children}
      {hint && <p className="text-xs text-brand-text-dim">{hint}</p>}
    </div>
  );
}

export default function AdminCliqConfig() {
  const [config, setConfig] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'cliq'))
      .then(snap => { if (snap.exists()) setConfig({ ...EMPTY, ...snap.data() }); })
      .catch(err => console.warn('Failed to load Cliq config', err))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (e) => setConfig({ ...config, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    const clean = { ...config, botName: config.botName.trim(), channel: config.channel.trim().replace(/^#/, ''), webhookToken: config.webhookToken.trim(), appUrl: config.appUrl.trim() };
    await setDoc(doc(firestore, 'configs', 'cliq'), clean, { merge: true });
    setConfig(clean);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await save();
      setMessage(config.enabled ? 'Saved. Cliq notifications are on.' : 'Saved. Notifications stay off until you switch them on.');
    } catch (err) {
      setMessage('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Saves first, so the test always checks what's on screen.
  const handleTest = async () => {
    setTesting(true);
    setMessage('');
    setTestResult(null);
    try {
      await save();
      const res = await httpsCallable(functions, 'sendCliqTest')();
      setTestResult(res.data);
    } catch (err) {
      setMessage('Test failed: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <CenteredSpinner />;

  const isReady = !!(config.webhookToken && config.botName && config.channel);
  const status = !isReady ? ['Setup required', false] : config.enabled ? ['Notifications on', true] : ['Set up, switched off', false];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {message && (
        <div className="p-4 rounded-md bg-brand-primary/10 text-brand-primary font-medium text-sm border border-brand-primary/20">{message}</div>
      )}

      <div className="bg-brand-card border border-brand-card-border rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${status[1] ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
            {status[1] ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            <span>{status[0]}</span>
          </div>
        </div>
        <h3 className="font-semibold text-brand-text text-lg mb-2">Zoho Cliq bot</h3>
        <ul className="text-sm text-brand-text-dim space-y-1 list-disc pl-5">
          <li>A teacher sends a menu or daily report for approval: posted in the admins' channel.</li>
          <li>An admin approves it or sends it back: the teacher gets a direct message, with the note.</li>
          <li>Someone sends feedback from the app: posted in the admins' channel.</li>
        </ul>
        <p className="text-xs text-brand-text-dim mt-3">Teachers get direct messages only after they open the bot in Cliq and subscribe to it.</p>
      </div>

      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-8">
        <h3 className="font-semibold text-brand-text text-lg mb-6 border-b border-brand-card-border pb-4">Bot settings</h3>
        <form onSubmit={handleSave} className="space-y-6">
          <Field label="Cliq data centre">
            <select value={config.domain} onChange={set('domain')} className={inputClass}>
              {DOMAINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Bot unique name" hint="In Cliq: Bots & Tools > Bots > your bot. The unique name is shown under its name, e.g. abhishribot.">
            <input type="text" value={config.botName} onChange={set('botName')} placeholder="abhishribot" className={inputClass} />
          </Field>
          <Field label="Admins' channel unique name" hint="Open the channel > Channel info. Use the unique name without the #, e.g. approvals.">
            <input type="text" value={config.channel} onChange={set('channel')} placeholder="approvals" className={inputClass} />
          </Field>
          <Field label="Webhook token" hint="In Cliq: Bots & Tools > Webhook Tokens > Generate. Create it from an account that is a member of the admins' channel.">
            <input type="password" value={config.webhookToken} onChange={set('webhookToken')} placeholder="Paste the webhook token" className={inputClass} />
          </Field>
          <Field label="App link" hint="Where the buttons on each message open.">
            <input type="url" value={config.appUrl} onChange={set('appUrl')} className={inputClass} />
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium text-brand-text">
            <input type="checkbox" checked={config.enabled} onChange={set('enabled')} className="w-4 h-4 accent-brand-primary" />
            Send notifications to Cliq
          </label>

          {testResult && (
            <div className="rounded-md border border-brand-card-border p-4 text-sm space-y-2">
              {[['channel', `Channel #${config.channel}`], ['direct', 'Direct message to you']].map(([key, label]) => (
                <div key={key} className="flex items-start gap-2">
                  {testResult[key]?.ok ? <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" /> : <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />}
                  <div>
                    <span className="font-medium text-brand-text">{label}: {testResult[key]?.ok ? 'sent' : 'failed'}</span>
                    {!testResult[key]?.ok && <div className="text-xs text-brand-text-dim break-all">{testResult[key]?.error}</div>}
                  </div>
                </div>
              ))}
              {!testResult.enabled && <p className="text-xs text-brand-text-dim">Notifications are still switched off. Tick the box above and save to turn them on.</p>}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button type="button" onClick={handleTest} disabled={testing || saving || !isReady}
              className="flex-1 flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-6 py-3 rounded-md font-bold text-sm transition-colors disabled:opacity-50">
              {testing ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {testing ? 'Sending...' : 'Save and send a test'}
            </button>
            <button type="submit" disabled={saving || testing}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-3 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50">
              <Save size={18} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
