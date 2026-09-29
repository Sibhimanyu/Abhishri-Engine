import { CenteredSpinner } from './Spinner';
import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getDoc } from '../utils/firestoreRead';
import { httpsCallable } from 'firebase/functions';
import { firestore, functions } from '../firebase';
import { CheckCircle, AlertCircle, Save, Send, Loader2, Copy, KeyRound } from 'lucide-react';
import { buttonFunctionCode, formFunctionCode, DEFAULT_BUTTON_FUNCTION, DEFAULT_FORM_FUNCTION } from '../utils/cliqDeluge';

// Zoho Cliq bot settings (configs/cliq, read by functions/src/cliq). Approval requests
// go to the admins' channel; approval outcomes are DMed to the teacher.
const DOMAINS = [
  ['cliq.zoho.in', 'India (cliq.zoho.in)'],
  ['cliq.zoho.com', 'US (cliq.zoho.com)'],
  ['cliq.zoho.eu', 'Europe (cliq.zoho.eu)'],
  ['cliq.zoho.com.au', 'Australia (cliq.zoho.com.au)'],
];

const EMPTY = {
  enabled: false, domain: 'cliq.zoho.in', botName: '', channel: '', webhookToken: '', appUrl: 'https://abhishri-academy.web.app',
  functionOwner: '', approveFunction: DEFAULT_BUTTON_FUNCTION, actionSecret: '', userMap: {},
};

// userMap is { cliqEmail: appEmail }, edited as one "cliq@… = app@…" line per person.
const mapToText = (map) => Object.entries(map || {}).map(([c, a]) => `${c} = ${a}`).join('\n');
const textToMap = (text) => Object.fromEntries(text.split('\n')
  .map(line => line.split('=').map(part => part.trim().toLowerCase()))
  .filter(([c, a]) => c && a && c.includes('@') && a.includes('@')));

const newSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

function CodeBlock({ title, code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-brand-text">{title}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs font-bold text-brand-primary hover:underline">
          <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-brand-bg border border-brand-card-border rounded-md p-3 text-xs text-brand-text overflow-x-auto max-h-64">{code}</pre>
    </div>
  );
}

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
  const [userMapText, setUserMapText] = useState('');

  useEffect(() => {
    getDoc(doc(firestore, 'configs', 'cliq'))
      .then(snap => {
        if (!snap.exists()) return;
        setConfig({ ...EMPTY, ...snap.data() });
        setUserMapText(mapToText(snap.data().userMap));
      })
      .catch(err => console.warn('Failed to load Cliq config', err))
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (e) => setConfig({ ...config, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    const clean = {
      ...config,
      botName: config.botName.trim(),
      channel: config.channel.trim().replace(/^#/, ''),
      webhookToken: config.webhookToken.trim(),
      appUrl: config.appUrl.trim(),
      functionOwner: config.functionOwner.trim().toLowerCase(),
      approveFunction: config.approveFunction.trim(),
      userMap: textToMap(userMapText),
    };
    // Not merged: a merge would keep userMap entries that were deleted here.
    await setDoc(doc(firestore, 'configs', 'cliq'), clean);
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
  const canDecide = !!(config.functionOwner && config.approveFunction && config.actionSecret);
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
          <li>Someone who isn't set up yet signs in (an access request): posted in the admins' channel.</li>
          <li>Tamil birthdays: one post in the admins' channel at 7:30 each morning.</li>
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

          <div className="border-t border-brand-card-border pt-6 space-y-6">
            <div>
              <h4 className="font-semibold text-brand-text">Approve and send back from Cliq</h4>
              <p className="text-xs text-brand-text-dim mt-1">
                {canDecide
                  ? 'Requests in the channel get Approve and Send back buttons. Only admins can use them.'
                  : 'Fill these in to add Approve and Send back buttons to requests. Until then, requests link to the app.'}
              </p>
            </div>
            <Field label="Cliq function owner" hint="The Cliq email of whoever creates the two functions below. Cliq buttons need it to find them.">
              <input type="email" value={config.functionOwner} onChange={set('functionOwner')} placeholder="you@abhishriacademy.in" className={inputClass} />
            </Field>
            <Field label="Button function name" hint={`The name you give the Button function in Cliq. The form function must be named ${DEFAULT_FORM_FUNCTION}.`}>
              <input type="text" value={config.approveFunction} onChange={set('approveFunction')} placeholder={DEFAULT_BUTTON_FUNCTION} className={inputClass} />
            </Field>
            <Field label="Action secret" hint="Proves a decision came from your Cliq functions. If you generate a new one, paste the updated code into both functions.">
              <div className="flex gap-2">
                <input type="password" value={config.actionSecret} readOnly placeholder="Generate a secret" className={inputClass} />
                <button type="button" onClick={() => setConfig({ ...config, actionSecret: newSecret() })}
                  className="shrink-0 flex items-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-md font-medium text-sm transition-colors">
                  <KeyRound size={16} /> Generate
                </button>
              </div>
            </Field>
            <Field label="Different Cliq emails" hint="One per line, as cliq email = app email, for anyone who signs in to Cliq with a different email from the app.">
              <textarea rows={3} value={userMapText} onChange={e => setUserMapText(e.target.value)} placeholder="info@abhishriacademy.in = someone@gmail.com" className={`${inputClass} font-mono`} />
            </Field>
            {config.actionSecret && (
              <div className="space-y-4">
                <p className="text-xs text-brand-text-dim">
                  In Cliq, go to Bots &amp; Tools &gt; Functions. Create a <span className="font-bold">Button</span> function named <span className="font-mono">{config.approveFunction || DEFAULT_BUTTON_FUNCTION}</span> and
                  a <span className="font-bold">Form</span> function named <span className="font-mono">{DEFAULT_FORM_FUNCTION}</span>, and paste this code into them (the form code goes in its Submit Handler). Save these settings first.
                </p>
                <CodeBlock title="Button function" code={buttonFunctionCode({ secret: config.actionSecret })} />
                <CodeBlock title="Form function: Submit Handler" code={formFunctionCode({ secret: config.actionSecret })} />
              </div>
            )}
          </div>

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
