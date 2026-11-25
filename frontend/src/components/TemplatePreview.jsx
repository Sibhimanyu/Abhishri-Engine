import { previewSegments } from '../utils/templateUi';

// A phone-style chat bubble: title bold, body with the sample values filled in and
// highlighted, footer small and grey.

function Text({ text, samples }) {
  return previewSegments(text, samples).map((s, i) => (
    s.variable
      ? <mark key={i} className="bg-brand-primary/15 text-brand-text rounded px-0.5">{s.text}</mark>
      : <span key={i}>{s.text}</span>
  ));
}

export default function TemplatePreview({ title, body, footer, samples }) {
  const empty = !String(title || '').trim() && !String(body || '').trim() && !String(footer || '').trim();
  return (
    <div className="rounded-2xl border border-brand-card-border bg-brand-bg p-4">
      <p className="text-[11px] uppercase tracking-wide text-brand-text-dim mb-3">Preview</p>
      <div className="rounded-xl rounded-tl-sm bg-brand-card border border-brand-card-border shadow-sm p-3 text-sm text-brand-text whitespace-pre-wrap break-words max-w-[300px]">
        {empty && <span className="text-brand-text-dim">Your message appears here.</span>}
        {String(title || '').trim() && <p className="font-bold mb-1"><Text text={title} samples={samples} /></p>}
        {String(body || '').trim() && <p><Text text={body} samples={samples} /></p>}
        {String(footer || '').trim() && <p className="text-[11px] text-brand-text-dim mt-2"><Text text={footer} samples={samples} /></p>}
      </div>
    </div>
  );
}
