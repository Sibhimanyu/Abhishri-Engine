import { useRef, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

/**
 * "Import from ChatGPT": shows format instructions to copy into ChatGPT and a box for
 * its reply. `onImport(text)` fills the editor and throws (with a message to show) if
 * the text can't be used; the dialog stays open until it succeeds.
 */
export default function ChatGPTImportDialog({ prompt, what, fillLabel, onImport, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const promptRef = useRef(null);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Older WKWebViews lack the async clipboard API; fall back to selecting the text.
      promptRef.current?.select();
      if (!document.execCommand('copy')) {
        alert('Could not copy automatically. Select the instructions and copy them manually.');
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = () => {
    try {
      onImport(text);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-brand-sidebar border border-brand-card-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-brand-text-dim hover:text-brand-text">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold text-brand-text mb-4">Import from ChatGPT</h2>

        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold text-brand-text-dim uppercase tracking-wider">1. Give ChatGPT these instructions with your {what}</label>
              <button
                onClick={copyPrompt}
                className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-3 py-1.5 rounded-lg font-medium text-xs transition-colors shrink-0"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              ref={promptRef}
              readOnly
              value={prompt}
              rows={6}
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 text-xs font-mono text-brand-text-dim focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-brand-text-dim uppercase tracking-wider mb-2">2. Paste ChatGPT's reply</label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              rows={8}
              placeholder="Paste the whole reply here"
              className="w-full bg-brand-bg border border-brand-card-border rounded-lg py-2 px-3 text-sm font-mono text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-brand-text px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {fillLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
