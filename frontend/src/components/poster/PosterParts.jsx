// Decorations and the scaled preview shared by the exported posters.
import { useLayoutEffect, useRef, useState } from 'react';
import { POSTER_WIDTH } from './posterTheme';

// Six-armed flake: `dots` puts a ball on each arm (the big background shapes); without, it's the small asterisk.
export const Flake = ({ size, color, dots, style }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={style} aria-hidden="true">
    {[0, 60, 120].map(a => (
      <line key={a} x1="-36" y1="0" x2="36" y2="0" stroke={color} strokeWidth={dots ? 10 : 9} strokeLinecap="round" transform={`rotate(${a + 90})`} />
    ))}
    {dots && [0, 60, 120, 180, 240, 300].map(a => (
      <circle key={a} cx="38" cy="0" r="10" fill={color} transform={`rotate(${a + 90})`} />
    ))}
  </svg>
);

/**
 * Shows a fixed-width poster scaled down to the panel's width. Only this wrapper is
 * scaled; the poster node (`posterRef`) keeps its full size, so it exports at full resolution.
 */
export function ScaledPreview({ posterRef, children }) {
  const boxRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const poster = posterRef.current;
    if (!box || !poster) return;
    const update = () => {
      const scale = Math.min(1, box.clientWidth / POSTER_WIDTH);
      setFit({ scale, height: poster.offsetHeight * scale });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(poster);
    return () => ro.disconnect();
  }, [posterRef]);

  return (
    <div ref={boxRef} className="rounded-lg overflow-hidden" style={{ height: fit.height || undefined }}>
      <div style={{ width: POSTER_WIDTH, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}
