# iOS app

The iOS app is the same React frontend packaged with [Capacitor](https://capacitorjs.com).
There is one codebase: every screen, role check and Firestore rule is shared with
the web, and a web change reaches iOS on the next build. The Xcode project lives in
`frontend/ios/` and bundles `frontend/dist` into the app. It does not load the
hosted site.

## Day to day

```sh
cd frontend
npm run ios        # vite build → cap sync ios → open Xcode, then press Run
npm run ios:sync   # the same without opening Xcode (after any web change)
```

Run `npm run ios:sync` after every web change you want in the app, because the
app ships the build it was given. `npm run ios:assets` regenerates the icon and
splash from `frontend/assets/`.

## What differs from the web

The web still uses the browser APIs; the iOS app swaps them for native ones. All of
it is in `frontend/src/utils/native.js`, so components don't check which platform
they're on.

| Web | iOS app | Where |
|---|---|---|
| Google sign-in popup | Native Google sheet; the token is passed to the Firebase JS SDK | `Login.jsx` |
| `getAuth()` | `initializeAuth` with IndexedDB persistence, because `getAuth` stalls under `capacitor://` | `firebase.js` |
| `window.print()` | UIKit print dialog through a small in-app plugin | `ios/App/App/AppViewController.swift` |
| `<a download>` (CSV exports, weekly menu PNG) | Share sheet (Save to Files, AirDrop, WhatsApp) | `saveFile()` |
| Browser chrome | Edge-to-edge layout inset by the notch/home-bar safe areas | `html.native` rules in `index.css` |

External links (`target="_blank"`, `wa.me`) open in Safari or the target app.

## Firebase registration

The app is registered in the `abhishri-academy` Firebase project as
**Abhishri Academy iOS** (`1:932495146860:ios:98adf4d6f9c1518074fd49`), bundle ID
`com.abhishri.academy`. Its config is committed at
`ios/App/App/GoogleService-Info.plist`. The plist's `REVERSED_CLIENT_ID` is also
registered as a URL scheme in `ios/App/App/Info.plist`, which Google sign-in needs
to return to the app; without it the Google SDK crashes on sign-in. If the bundle
ID ever changes, register a new iOS app, re-download the plist with
`firebase apps:sdkconfig IOS <app-id> -o ios/App/App/GoogleService-Info.plist`,
and update that URL scheme.

If the web API key in `firebase.js` has HTTP-referrer restrictions in Google Cloud
Console, requests from the app come from origin `capacitor://localhost` and need
to be allowed there too.

## Releasing

1. In Xcode → App target → *Signing & Capabilities*, pick the Apple Developer team.
2. Bump *Version* / *Build* (they are `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).
3. Product → Archive → Distribute to TestFlight / App Store Connect.

The icon in `frontend/assets/icon-only.png` is the wordmark on the brand coral.
Replace it with a square mark before an App Store submission if you have one, then
run `npm run ios:assets`.
