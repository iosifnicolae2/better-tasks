#!/bin/sh
# Builds bin/record_display, the display helper record-display.sh runs, for Apple silicon and Intel in one file,
# and bin/record_display.sha256, the sources it was built from. Installs then need no Swift compiler.
# Run after changing bin/record_display.swift or .h, and commit both files: sh scripts/build-display-helper.sh
set -eu
bin="$(cd "$(dirname "$0")/../bin" && pwd)"
work="$(mktemp -d -t display-helper)"
trap 'rm -rf "$work"' EXIT
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12" -import-objc-header "$bin/record_display.h" "$bin/record_display.swift" -o "$work/$arch"
done
lipo -create "$work/arm64" "$work/x86_64" -output "$bin/record_display"
cat "$bin/record_display.swift" "$bin/record_display.h" | shasum -a 256 | cut -d' ' -f1 >"$bin/record_display.sha256"
echo "built $bin/record_display"
