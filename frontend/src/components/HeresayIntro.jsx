import { useEffect } from 'react';
import { withHeresay } from '../utils/heresay';

// Heresay's one-time "there's a Report button" bubble. Rendered only on the main
// screens (staff dashboard, parent portal), so it never covers the sign-in form.
// Heresay itself remembers per device that it was shown; repeat calls do nothing.
export default function HeresayIntro() {
  useEffect(() => withHeresay((h) => h.introduce()), []);
  return null;
}
