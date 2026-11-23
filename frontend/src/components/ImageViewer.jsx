import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

const MIN = 1;
const MAX = 5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function ImageViewer({ src, alt = 'Image', onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [pinching, setPinching] = useState(false);
  const closeRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ startDist: 0, startScale: 1 });
  const dragStart = useRef(null);
  const lastTap = useRef(0);

  const setZoom = useCallback((next) => {
    const s = clamp(next, MIN, MAX);
    setScale(s);
    if (s === 1) setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === '+' || e.key === '=') setScale((s) => clamp(s + 0.5, MIN, MAX));
      else if (e.key === '-') setZoom(scale - 0.5);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (previous && previous.focus) previous.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const toggleZoom = () => setZoom(scale > 1 ? 1 : 2.5);

  const onWheel = (e) => setZoom(scale - e.deltaY * 0.002 * scale);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startScale: scale };
      dragStart.current = null;
      setPinching(true);
    } else if (scale > 1) {
      dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      setDragging(true);
    }
    if (e.pointerType === 'touch' && pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) { toggleZoom(); lastTap.current = 0; } else lastTap.current = now;
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.startDist) setZoom(gesture.current.startScale * (d / gesture.current.startDist));
    } else if (dragStart.current) {
      setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    dragStart.current = null;
    setDragging(false);
    if (pointers.current.size < 2) setPinching(false);
  };

  const btn = 'h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary transition-colors';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button type="button" className={btn} onClick={() => setZoom(scale - 0.5)} disabled={scale <= MIN} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <button type="button" className={btn} onClick={() => setZoom(scale + 0.5)} disabled={scale >= MAX} aria-label="Zoom in"><ZoomIn size={18} /></button>
        <a className={btn} href={src} target="_blank" rel="noreferrer" download aria-label="Open original"><Download size={18} /></a>
        <button ref={closeRef} type="button" className={btn} onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden touch-none select-none"
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={toggleZoom}
        onClick={(e) => { if (e.target === e.currentTarget && scale === 1) onClose(); }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-full max-h-full object-contain"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: dragging || pinching ? 'none' : 'transform 150ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
