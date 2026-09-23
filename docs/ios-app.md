# iOS app

The iOS app is the React frontend packaged with [Capacitor](https://capacitorjs.com).
There is one codebase: every screen, role check and Firestore rule is shared with
the web.

**The app loads the live site.** `capacitor.config.json` sets `server.url` to
`https://abhishri-academy.web.app`. So a normal `firebase deploy` of the web app
reaches every phone the next time the app opens, with nothing to install. The
bundled copy of `frontend/dist` only supplies the "Can't reach Abhishri" screen
(`public/offline.html`, `server.errorPath`) shown when the phone is offline.

Only **native** changes need a new install through SideStore: Capacitor plugins,
Swift, `Info.plist`, the icon. A native change that the web code depends on (for
example a new plugin) must be released before the web code that calls it is
deployed, or older installs will call a plugin they don't have.

## Day to day

```sh
cd frontend
npm run ios          # open Xcode on the simulator/device build
npm run ios:release -- "What changed"   # native change → publish to SideStore
```

`npm run ios:assets` regenerates the icon and splash from `frontend/assets/`.

To try unreleased web code in the simulator, deploy a preview channel
(`firebase hosting:channel:deploy <name>`), then run `npx cap sync ios`. Put the
channel URL in `ios/App/App/capacitor.config.json` (generated, not committed) and
press Run in Xcode.

## What differs from the web

The web still uses the browser APIs; the iOS app swaps them for native ones. All of
it is in `frontend/src/utils/native.js`, so components don't check which platform
they're on.

| Web | iOS app | Where |
|---|---|---|
| Google sign-in popup | Native Google sheet; the token is passed to the Firebase JS SDK | `Login.jsx` |
| `getAuth()` | `initializeAuth` with IndexedDB persistence (no popup/redirect resolver) | `firebase.js` |
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

## Installing on an iPhone with SideStore (free Apple ID)

This route needs no paid Apple Developer account. [SideStore](https://sidestore.io)
signs the app on the phone with your own Apple ID. Builds are published at
**<https://abhishri-ios.web.app>**, a separate Firebase Hosting site
(`frontend/ios/firebase.json`); the main site is never touched by a release.

**Limits of a free Apple ID.** The signature expires every 7 days. That can't be
removed without a paid account, but SideStore renews it automatically (see below).
You can have 3 sideloaded apps at a time, and SideStore counts as one. You can
install 10 different apps per week. SideStore renames the bundle ID to
`com.abhishri.academy.<TEAMID>` on a free account; nothing in the app depends on it.

### 1. Install SideStore (one time per phone)

Follow the [SideStore install guide](https://docs.sidestore.io/docs/installation/prerequisites).
In short:

1. Install **LocalDevVPN** from the App Store on the iPhone. It has to be connected
   whenever SideStore installs or refreshes apps.
2. On a computer, run **iloader**, connect the iPhone by cable and sign in with the
   Apple ID. It installs SideStore and its pairing file.
3. On the iPhone, go to Settings → General → VPN & Device Management and trust
   your Apple ID's developer profile. Then turn on Settings → Privacy & Security →
   **Developer Mode** (iOS 16+) and restart the phone.

### 2. Install Abhishri (one time per phone)

Open **<https://abhishri-ios.web.app>** in Safari on the iPhone and tap **Add to
SideStore**. Or, in SideStore → Sources → **+**, add
`https://abhishri-ios.web.app/source.json`. Then connect LocalDevVPN and install
**Abhishri** from that source.

### 3. Updates

- **Web changes**: nothing to do. `firebase deploy` and the app picks it up on
  its next launch.
- **Native changes**: `npm run ios:release -- "notes"` (`frontend/ios/release.sh`).
  It runs the tests and builds an unsigned Release `.ipa` (SideStore re-signs it
  on the phone). It refuses to publish unless the bundle has the Firebase plist,
  the Google URL scheme, the camera/photo usage strings and the live `server.url`.
  Then it writes `ios/dist/` (`.ipa`, `source.json`, `index.html`, icon) and
  deploys it to `abhishri-ios`. SideStore shows **Update** under My Apps; it
  doesn't install silently. The app also shows a notice
  (`src/components/NativeUpdateBanner.jsx`, checked at most hourly) whose
  **Open** button goes to SideStore.

The build number is a UTC timestamp (`YYYYMMDDHHMM`), so it always goes up with no
state to sync. The version is `MARKETING_VERSION` in the Xcode project. `.ipa`
uploads need the Blaze plan (Spark forbids executables); only the latest `.ipa`
is kept, well inside the free Hosting allowance.

**Live since 2026-09-23:** `1.0 (202609231637)`. Its `source.json`, `.ipa` hash and
headers were checked against the served files.

### 4. Automatic refresh (instead of by hand every 7 days)

SideStore renews apps in the background when iOS lets it. Settings → General →
**Background App Refresh** must be on, for SideStore too. iOS doesn't guarantee
background time, so also add a daily Shortcuts automation that guarantees it:

1. Shortcuts → **Automation** → **+** → **Time of Day** (e.g. 3:00 AM, while the
   phone is usually on Wi-Fi and charging) → **Daily** → **Run Immediately**.
2. Add the actions:
   1. **Set VPN** → *Connect* → **LocalDevVPN** (or *Open App* → LocalDevVPN, if
      the VPN doesn't appear there)
   2. **Wait** 5 seconds
   3. SideStore → **Refresh All Apps**

A refresh needs Wi-Fi and LocalDevVPN, and the signature has a 7-day margin. So
one missed night doesn't matter; the next successful run renews it. If the phone
is off Wi-Fi for 7 days, the app won't open until you connect LocalDevVPN and tap
**Refresh All** in SideStore. The app's data and sign-in are not lost.

## Releasing (App Store / TestFlight, paid account)

1. In Xcode → App target → *Signing & Capabilities*, pick the Apple Developer team.
2. Bump *Version* / *Build* (they are `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).
3. Product → Archive → Distribute to TestFlight / App Store Connect.

The icon in `frontend/assets/icon-only.png` is the wordmark on the brand coral.
Replace it with a square mark before an App Store submission if you have one, then
run `npm run ios:assets`.
