import { useEffect } from 'react';

// Heresay's one-time "there's a Report button" bubble. Rendered only on the main
// screens (staff dashboard, parent portal), so it never covers the sign-in form.
// The SDK loads after the app (deferred tag in index.html), so wait for it briefly.
// Heresay itself remembers per device that it was shown; repeat calls do nothing.
export default function HeresayIntro() {
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (window.Heresay?.introduce) {
        clearInterval(timer);
        window.Heresay.introduce();
      } else if (tries >= 20) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
