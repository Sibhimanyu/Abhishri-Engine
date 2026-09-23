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

## Installing on an iPhone with SideStore (free Apple ID)

This route needs no paid Apple Developer account. [SideStore](https://sidestore.io)
signs the app on the phone with your own Apple ID.

**Limits of a free Apple ID.** The signature expires every 7 days. That can't be
removed without a paid account, but SideStore renews it automatically (see below).
You can have 3 sideloaded apps at a time, and SideStore counts as one. You can
install 10 different apps per week. SideStore may also append your team ID to the
bundle ID; the app doesn't depend on it.

### 1. Build the IPA (Mac)

```sh
cd frontend
npm run ios:ipa        # → frontend/ios/dist/Abhishri.ipa
```

This is an unsigned Release build; SideStore signs it during install. Rebuild
whenever you want the phone to get the latest web changes.

### 2. Install SideStore (one time)

Follow the [SideStore install guide](https://docs.sidestore.io/docs/installation/prerequisites).
In short:

1. Install **LocalDevVPN** from the App Store on the iPhone. It has to be connected
   whenever SideStore installs or refreshes apps.
2. On a computer, run **iloader**, connect the iPhone by cable and sign in with the
   Apple ID. It installs SideStore and its pairing file.
3. On the iPhone, go to Settings → General → VPN & Device Management and trust
   your Apple ID's developer profile. Then turn on Settings → Privacy & Security →
   **Developer Mode** (iOS 16+) and restart the phone.

### 3. Install Abhishri

1. AirDrop `Abhishri.ipa` to the iPhone (or put it in iCloud Drive) so it's in Files.
2. Connect LocalDevVPN, open SideStore → **My Apps** → **+**, and pick `Abhishri.ipa`.

To update, build a new IPA and install it the same way. It replaces the app in
place, and the sign-in is kept.

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
