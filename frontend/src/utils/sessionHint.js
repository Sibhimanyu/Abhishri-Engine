// Remembers which screen this browser last resolved to ('shell' for the staff
// dashboard, 'portal' for student/parent). index.html and App.jsx read it to pick
// the right pre-auth skeleton; it is a UI hint only and grants nothing.
export const SESSION_HINT_KEY = 'aa:session';

export function readSessionHint() {
  try { return localStorage.getItem(SESSION_HINT_KEY) || ''; } catch { return ''; }
}

export function writeSessionHint(value) {
  try {
    if (value) localStorage.setItem(SESSION_HINT_KEY, value);
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch { /* storage unavailable (private mode) — skeleton just falls back to splash */ }
}
