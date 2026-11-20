import { CenteredSpinner } from './Spinner';
import { useState, useEffect } from 'react';
import { doc, collection, setDoc, onSnapshot } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { CheckCircle, AlertCircle, RefreshCw, Save, FlaskConical, Radio, Send, Copy } from 'lucide-react';

const WEBHOOK_URL = 'https://us-central1-abhishri-academy.cloudfunctions.net/arattaiWebhook';

const inputClass = 'w-full bg-brand-bg border border-brand-card-border rounded-md py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-brand-text disabled:opacity-50';

// Settings → Arattai Config. Sandbox (the default) fakes everything; Live talks to the
// Arattai Business Platform API (functions/src/arattai/live.js) with the OAuth client and
// IDs below. See docs/arattai.md for where each value comes from.
const LIVE_FIELDS = [
  { key: 'clientId', label: 'Client ID', secret: false, hint: 'api-console.arattai.in' },
  { key: 'clientSecret', label: 'Client Secret', secret: true, hint: 'api-console.arattai.in' },
  { key: 'refreshToken', label: 'Refresh Token', secret: true, hint: 'From the OAuth step in docs/arattai.md' },
  { key: 'companyId', label: 'Company ID', secret: false, hint: 'Arattai Business Platform' },
  { key: 'businessId', label: 'Business ID', secret: false, hint: 'Arattai Business Platform' },
  { key: 'businessNumberId', label: 'Business Number ID', secret: false, hint: 'Platform → Numbers' },
];
export default function AdminArattaiConfig() {
  const [config, setConfig] = useState({ mode: 'sandbox', clientId: '', clientSecret: '', refreshToken: '', companyId: '', businessId: '', businessNumberId: '', webhookToken: '', webhookSecret: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [account, setAccount] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState(null);
  const [sim, setSim] = useState({ from: '', name: '', text: '' });
  const [simSending, setSimSending] = useState(false);

  const checkAccount = () => httpsCallable(functions, 'checkArattaiAccount')()
    .then(res => setAccount(res.data))
    .catch(err => setAccount({ connected: false, label: err.message }));

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'arattai_main'))
      .then(snap => { if (snap.exists()) setConfig(c => ({ ...c, ...snap.data() })); })
      .catch(err => console.warn('Failed to load Arattai config', err))
      .finally(() => setLoading(false));
    checkAccount();
    return onSnapshot(collection(firestore, 'configs', 'arattai_main', 'templates'), snap => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn('Failed to load Arattai templates', err));
  }, []);

  const say = (text, ok = true) => setMessage({ text, ok });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const trimmed = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      await setDoc(doc(firestore, 'configs', 'arattai_main'), trimmed, { merge: true });
      say('Settings saved.');
      checkAccount();
    } catch (err) {
      say('Failed to save: ' + err.message, false);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await httpsCallable(functions, 'syncArattaiTemplates')();
      say(`Templates synced: ${res.data?.count || 0}.`);
    } catch (err) {
      say('Failed to sync templates: ' + err.message, false);
    } finally {
      setSyncing(false);
    }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    setSimSending(true);
    setMessage(null);
    try {
      await httpsCallable(functions, 'simulateArattaiInbound')(sim);
      say('Incoming message simulated. It’s in Communications → Arattai → Live Chats.');
      setSim(s => ({ ...s, text: '' }));
    } catch (err) {
      say('Failed to simulate: ' + err.message, false);
    } finally {
      setSimSending(false);
    }
  };

  if (loading) return <CenteredSpinner />;

  const isLive = config.mode === 'live';
  const webhookUrl = config.webhookToken ? `${WEBHOOK_URL}?token=${config.webhookToken}` : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {message && (
        <div className={`p-4 rounded-md font-medium text-sm border ${message.ok ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status */}
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              {!account ? (
                <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-black/5 dark:bg-white/5 text-brand-text-dim">Checking…</div>
              ) : account.mode === 'sandbox' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400"><FlaskConical size={14} /> Sandbox</div>
              ) : (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${account.connected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {account.connected ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {account.connected ? 'Connected' : 'Not connected'}
                </div>
              )}
              <h2 className="font-bold text-brand-text text-lg m-0">Arattai Status</h2>
            </div>
            <p className="text-brand-text-dim text-sm mb-6">{account?.label || ' '}</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 bg-brand-bg hover:bg-black/5 dark:hover:bg-white/5 border border-brand-card-border text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Message Templates'}
          </button>
        </div>

        {/* Templates */}
        <div className="bg-brand-card border border-brand-card-border rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-brand-text mb-1">Templates</h3>
          <p className="text-xs text-brand-text-dim mb-4">What Broadcast offers. Sync after switching modes.</p>
          {templates.length === 0 ? (
            <p className="text-sm text-brand-text-dim">None yet. Click “Sync Message Templates”.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {templates.map(t => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-brand-text truncate">{t.name}</span>
                  <span className="text-[10px] font-bold uppercase text-brand-text-dim shrink-0 ml-2">{t.category}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-brand-card border border-brand-card-border rounded-xl shadow-sm p-8">
        <h3 className="font-semibold text-brand-text text-lg mb-6 border-b border-brand-card-border pb-4">Connection</h3>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <span className="text-sm font-medium text-brand-text">Mode</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'sandbox', icon: FlaskConical, title: 'Sandbox', text: 'Nothing is sent. Sends, receipts and incoming messages are simulated, for trying every screen.' },
                { id: 'live', icon: Radio, title: 'Live', text: 'Real messages through the Arattai Business Platform API. Needs the credentials below.' },
              ].map(opt => (
                <label key={opt.id} className={`flex gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${config.mode === opt.id ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-card-border hover:bg-black/5 dark:hover:bg-white/5'}`}>
                  <input type="radio" name="mode" value={opt.id} checked={config.mode === opt.id} onChange={() => setConfig({ ...config, mode: opt.id })} className="mt-1 accent-brand-primary" />
                  <span>
                    <span className="flex items-center gap-1.5 font-bold text-sm text-brand-text"><opt.icon size={14} /> {opt.title}</span>
                    <span className="block text-xs text-brand-text-dim mt-1">{opt.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LIVE_FIELDS.map(f => (
              <div key={f.key} className="space-y-2">
                <label htmlFor={`arattai-${f.key}`} className="text-sm font-medium text-brand-text">{f.label}</label>
                <input id={`arattai-${f.key}`} type={f.secret ? 'password' : 'text'} autoComplete="off" value={config[f.key] || ''} disabled={!isLive}
                  onChange={e => setConfig({ ...config, [f.key]: e.target.value })} placeholder={f.hint} className={inputClass} />
              </div>
            ))}
          </div>
          {!isLive && <p className="text-xs text-brand-text-dim -mt-3">Credentials are only used in Live mode.</p>}

          <div className="space-y-2">
            <label htmlFor="arattai-token" className="text-sm font-medium text-brand-text">Webhook Token</label>
            <div className="flex gap-2">
              <input id="arattai-token" type="text" value={config.webhookToken || ''}
                onChange={e => setConfig({ ...config, webhookToken: e.target.value })} placeholder="Secret that authenticates incoming webhooks" className={`${inputClass} flex-1`} />
              <button type="button" onClick={() => setConfig({ ...config, webhookToken: crypto.randomUUID().replace(/-/g, '') })}
                className="shrink-0 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors">
                Generate
              </button>
            </div>
            <p className="text-xs text-brand-text-dim">
              The webhook rejects every call until a token is saved. Give Arattai the URL below (it includes the token) and subscribe it to
              <span className="font-mono"> chat.message.received, .sent, .delivered, .read</span> and <span className="font-mono">.failed</span>.
            </p>
            {webhookUrl && (
              <div className="flex items-center gap-2 bg-brand-bg border border-brand-card-border rounded-md px-3 py-2">
                <code className="text-xs text-brand-text truncate flex-1">{webhookUrl}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(webhookUrl).then(() => say('Webhook URL copied.'))}
                  className="shrink-0 text-brand-text-dim hover:text-brand-text" aria-label="Copy webhook URL">
                  <Copy size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="arattai-signing" className="text-sm font-medium text-brand-text">Webhook Signing Key (optional)</label>
            <input id="arattai-signing" type="password" autoComplete="off" value={config.webhookSecret || ''}
              onChange={e => setConfig({ ...config, webhookSecret: e.target.value })} placeholder="The webhook's selected secret key in Arattai" className={inputClass} />
            <p className="text-xs text-brand-text-dim">When set, every incoming call must carry Arattai’s signature made with this key. Recommended in Live mode.</p>
          </div>

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-6 py-3 rounded-md font-bold text-sm transition-colors shadow-sm disabled:opacity-50">
            <Save size={18} /> {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      </div>

      {/* Sandbox tools */}
      {account?.mode === 'sandbox' && (
        <div className="bg-brand-card border border-amber-500/30 rounded-xl shadow-sm p-8">
          <h3 className="font-semibold text-brand-text text-lg mb-1 flex items-center gap-2"><FlaskConical size={18} className="text-amber-500" /> Simulate an incoming message</h3>
          <p className="text-xs text-brand-text-dim mb-6">Pretend a parent messaged the school on Arattai, to try Live Chats and the unread badge. In Sandbox, numbers ending in 0000 always fail to send, and numbers ending in an even digit show as read.</p>
          <form onSubmit={handleSimulate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="tel" required value={sim.from} onChange={e => setSim({ ...sim, from: e.target.value })} placeholder="Phone, e.g. 919876543210" aria-label="Phone number" className={inputClass} />
            <input type="text" value={sim.name} onChange={e => setSim({ ...sim, name: e.target.value })} placeholder="Name (optional)" aria-label="Name" className={inputClass} />
            <input type="text" required value={sim.text} onChange={e => setSim({ ...sim, text: e.target.value })} placeholder="Message" aria-label="Message" className={inputClass} />
            <button type="submit" disabled={simSending}
              className="md:col-span-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-md font-bold text-sm transition-colors disabled:opacity-50">
              <Send size={16} /> {simSending ? 'Sending…' : 'Simulate Message'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
