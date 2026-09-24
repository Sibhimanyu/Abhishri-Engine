#!/usr/bin/env bash
# Build a Release .ipa, publish it with a SideStore source, and deploy it to
# https://abhishri-ios.web.app. Phones that added the source see an Update in
# SideStore, and the app shows a notice (src/components/NativeUpdateBanner.jsx).
#
#   ios/release.sh "What changed, one line"          # build + deploy
#   ios/release.sh "..." --no-deploy                 # build ios/dist/ only
#
# Only native changes need this: plugins, Swift, Info.plist, icon. The app
# loads the live site (capacitor.config.json → server.url), so web changes reach
# phones with the normal `firebase deploy`, on the app's next launch.
#
# The marketing version is MARKETING_VERSION in the Xcode project; bump it by
# hand for a meaningful release. The build number is a UTC timestamp, so it
# always goes up with no state to keep in sync across machines.
set -euo pipefail
IOS_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$IOS_DIR/.."   # frontend/

NOTES="${1:?usage: ios/release.sh \"release notes\" [--no-deploy]}"
DEPLOY=1; [[ "${2:-}" == "--no-deploy" ]] && DEPLOY=0

SITE="https://abhishri-ios.web.app"
PBX="$IOS_DIR/App/App.xcodeproj/project.pbxproj"
BUNDLE="$(sed -n 's/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER = \(.*\);/\1/p' "$PBX" | head -1)"
VERSION="$(sed -n 's/^[[:space:]]*MARKETING_VERSION = \(.*\);/\1/p' "$PBX" | head -1)"
MIN_OS="$(sed -n 's/^[[:space:]]*IPHONEOS_DEPLOYMENT_TARGET = \(.*\);/\1/p' "$PBX" | head -1)"
BUILD="$(date -u +%Y%m%d%H%M)"
BUILD_DIR="$IOS_DIR/build"
DIST="$IOS_DIR/dist"

echo "==> Abhishri $VERSION ($BUILD)"
npm test --silent >/dev/null 2>&1 || { echo "frontend tests failed — run npm test" >&2; exit 1; }
# The native screens' shared rules (enrollment, transaction classification, permissions).
(cd "$IOS_DIR/App/AbhishriKit" && swift test >/dev/null 2>&1) || {
  echo "native tests failed — run: cd ios/App/AbhishriKit && swift test" >&2; exit 1; }
# The bundled copy is only the offline fallback (server.errorPath), but it must exist.
npx vite build >/dev/null
npx cap sync ios >/dev/null

rm -rf "$BUILD_DIR/Build/Products/Release-iphoneos" "$BUILD_DIR/ipa"
mkdir -p "$BUILD_DIR"   # the log below is written here; a fresh checkout has no build/
xcodebuild -project "$IOS_DIR/App/App.xcodeproj" -scheme App -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -derivedDataPath "$BUILD_DIR" \
  CURRENT_PROJECT_VERSION="$BUILD" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  build > "$BUILD_DIR/xcodebuild.log" 2>&1 || {
    # Judge by the exit code: Xcode 27 prints spurious "error: ... exit code 0" lines.
    grep -E "error:" "$BUILD_DIR/xcodebuild.log" | tail -20 >&2
    echo "xcodebuild failed — full log: $BUILD_DIR/xcodebuild.log" >&2; exit 1; }

APP="$BUILD_DIR/Build/Products/Release-iphoneos/App.app"
[[ -d "$APP" ]] || { echo "build produced no app" >&2; exit 1; }

# What must and must not be inside anything published to a public URL.
plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$APP/Info.plist" 2>/dev/null; }
check() { if eval "$2"; then :; else echo "release check failed: $1" >&2; exit 1; fi; }
check "Firebase config is bundled"       '[[ -f "$APP/GoogleService-Info.plist" ]]'
check "Google sign-in URL scheme set"    'plist CFBundleURLTypes:0:CFBundleURLSchemes:0 | grep -q "^com.googleusercontent.apps.[0-9]"'
check "camera/photo usage strings set"   'plist NSCameraUsageDescription >/dev/null && plist NSPhotoLibraryAddUsageDescription >/dev/null'
check "build number stamped"             '[[ "$(plist CFBundleVersion)" == "$BUILD" ]]'
check "loads the live site"              'grep -q "\"url\": \"https://abhishri-academy.web.app\"" "$APP/capacitor.config.json"'
check "offline page bundled"             '[[ -f "$APP/public/offline.html" ]]'
check "no service account in the bundle" '! find "$APP" -iname "*adminsdk*" -o -iname "serviceAccount*.json" | grep -q .'

mkdir -p "$BUILD_DIR/ipa/Payload" "$DIST"
cp -R "$APP" "$BUILD_DIR/ipa/Payload/"
IPA="Abhishri-$VERSION-$BUILD.ipa"
rm -f "$DIST"/*.ipa
(cd "$BUILD_DIR/ipa" && COPYFILE_DISABLE=1 zip -qry "$DIST/$IPA" Payload)
SIZE=$(stat -f%z "$DIST/$IPA")
SHA=$(shasum -a 256 "$DIST/$IPA" | cut -d' ' -f1)
cp "$IOS_DIR/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png" "$DIST/icon.png"

python3 - "$VERSION" "$BUILD" "$NOTES" "$SITE/$IPA" "$SIZE" "$SHA" "$BUNDLE" "$SITE" "$DIST/source.json" "$MIN_OS" <<'PY'
import json, sys, datetime
version, build, notes, url, size, sha, bundle, site, out, min_os = sys.argv[1:]
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
v = {"version": version, "buildVersion": build, "date": now, "localizedDescription": notes,
     "downloadURL": url, "size": int(size), "sha256": sha,
     # From the Xcode project, so SideStore never offers a build to a phone that can't run it.
     "minOSVersion": min_os}
source = {
  "name": "Abhishri Academy", "identifier": "com.abhishri.academy.source",
  "subtitle": "School workspace", "website": site,
  "iconURL": f"{site}/icon.png", "tintColor": "#F1615B",
  "apps": [{
    "name": "Abhishri", "bundleIdentifier": bundle, "developerName": "Abhishri Academy",
    "subtitle": "School workspace", "localizedDescription":
      "The Abhishri Academy workspace: students, staff, attendance, fees, reports and WhatsApp for staff, and the student portal for parents. Sign in with your school account.",
    "iconURL": f"{site}/icon.png", "tintColor": "#F1615B", "category": "education",
    # SideStore needs these top-level as well as in versions.
    "version": version, "versionDate": now, "versionDescription": notes,
    "downloadURL": url, "size": int(size),
    "versions": [v], "appPermissions": {"entitlements": [], "privacy": {
      "NSCameraUsageDescription": "Take a photo to attach it.",
      "NSPhotoLibraryUsageDescription": "Choose a photo to attach.",
      "NSPhotoLibraryAddUsageDescription": "Save exported images to your photos."}},
  }],
  "news": [],
}
json.dump(source, open(out, "w"), indent=2)
PY

# The page a phone lands on: one tap adds the source to SideStore.
cat > "$DIST/index.html" <<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Abhishri for iPhone</title>
<style>
body{font:16px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#F8FAFC;color:#0F172A}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#fff}p{color:#94a3b8}code{background:#161b22;border-color:#30363d}}
main{max-width:520px;margin:0 auto;padding:40px 20px}
img{width:72px;height:72px;border-radius:16px}
h1{font-size:28px;margin:16px 0 4px}p{color:#64748B}
a.btn{display:block;text-align:center;padding:14px;border-radius:12px;background:#F1615B;color:#fff;
font-weight:600;text-decoration:none;margin:20px 0 10px}
a.alt{display:block;text-align:center;color:inherit;padding:10px}
code{background:#fff;border:1px solid #E2E8F0;border-radius:6px;padding:2px 6px;word-break:break-all}
</style></head><body><main>
<img src="icon.png" alt=""><h1>Abhishri</h1>
<p>Version $VERSION ($BUILD). $(printf '%s' "$NOTES" | sed 's/&/\&amp;/g; s/</\&lt;/g')</p>
<a class="btn" href="sidestore://source?url=$SITE/source.json">Add to SideStore</a>
<a class="alt" href="$IPA">Download the .ipa</a>
<p>Needs SideStore on the phone first. Or add this source in SideStore by hand:<br><code>$SITE/source.json</code></p>
</main></body></html>
HTML

echo "==> ios/dist/$IPA ($((SIZE / 1024 / 1024)) MB)"
if [[ $DEPLOY == 1 ]]; then
  firebase deploy --only hosting --project abhishri-academy --config "$IOS_DIR/firebase.json" -m "Abhishri iOS $VERSION ($BUILD)"
  echo "==> $SITE/source.json now offers $VERSION ($BUILD)"
fi
