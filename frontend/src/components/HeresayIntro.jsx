import { useEffect } from 'react';
import { withHeresay } from '../utils/heresay';

// Heresay's one-time "you can report problems" bubble. Rendered only on the main
// screens (staff dashboard, parent portal), so it never covers the sign-in form.
// Heresay itself remembers per device that it was shown; repeat calls do nothing.
// There is no floating button, so the words point at the sidebar item.
export default function HeresayIntro() {
  useEffect(() => withHeresay((h) => h.introduce({
    title: 'Report a problem',
    body: 'Something broken or confusing, or an idea? Tap "Report a problem" in the menu to tell the team.',
  })), []);
  return null;
}
