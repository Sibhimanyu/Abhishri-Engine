#!/bin/bash
# Build an unsigned Release .ipa for sideloading with SideStore (or AltStore).
# SideStore re-signs it with the installer's own Apple ID, so no Apple Developer
# account or signing identity is needed here. Output: ios/dist/Abhishri.ipa
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(dirname "$IOS_DIR")"
DERIVED="$IOS_DIR/build/DerivedData"
OUT_DIR="$IOS_DIR/dist"

cd "$FRONTEND_DIR"
npx vite build
npx cap sync ios

xcodebuild \
  -project "$IOS_DIR/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  build | grep -E "error:|warning: .*App/App/|BUILD (SUCCEEDED|FAILED)" || true

APP="$DERIVED/Build/Products/Release-iphoneos/App.app"
[ -d "$APP" ] || { echo "Build failed: $APP not found" >&2; exit 1; }

STAGE="$(mktemp -d)"
mkdir -p "$STAGE/Payload" "$OUT_DIR"
cp -R "$APP" "$STAGE/Payload/"
rm -f "$OUT_DIR/Abhishri.ipa"
(cd "$STAGE" && zip -qry "$OUT_DIR/Abhishri.ipa" Payload)
rm -rf "$STAGE"

echo "IPA: $OUT_DIR/Abhishri.ipa ($(du -h "$OUT_DIR/Abhishri.ipa" | cut -f1))"
