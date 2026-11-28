#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
out=build/native/ios/ProElite.app
mkdir -p "$out"
cp native/ios/Info.plist "$out/Info.plist"
cp public/product-icons/home-180.png "$out/AppIcon.png"
plutil -lint "$out/Info.plist"
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun --sdk iphonesimulator swiftc -parse-as-library -sdk "$sdk" -target "$(uname -m)-apple-ios15.0-simulator" -framework UIKit -framework WebKit native/ios/Launcher.swift -o "$out/ProElite"
test -s "$out/ProElite"
file "$out/ProElite"
echo "Simulator compile only. Not a signed device IPA; do not distribute."
