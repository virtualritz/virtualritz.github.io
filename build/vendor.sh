#!/usr/bin/env bash
# Vendor exactly what justif's two entry points need, not the whole
# dist/. Upstream ships hyphenation patterns for nine languages we never
# load (2312 KiB of the 2.5 MiB package); we only ever import the index
# entry point and the en-us hyphenator, so we vendor those two files plus
# the internal chunks they actually import:
#   dist/index.js            -> chunk-WWMSGT6G.js
#   dist/hyphenate/en-us.js  -> chunk-ZW2EUTPS.js
# (verified: neither chunk has further imports of its own). That's ~287
# KiB total. The chunk filenames are content-hashed by justif's own build
# and hardcoded here because we pin one exact version; re-run this script
# after bumping V and re-check the imports in dist/index.js and
# dist/hyphenate/en-us.js in case the hashes moved. tests/justif.test.mjs
# actually imports the vendored set, so a stale/missing chunk after a
# version bump fails the suite instead of only breaking in a browser.
set -euo pipefail
V=0.9.1
DEST="static/js/lib/justif"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
npm pack "justif@$V" --pack-destination "$TMP" >/dev/null
tar -xzf "$TMP"/justif-$V.tgz -C "$TMP"
rm -rf "$DEST"
mkdir -p "$DEST/hyphenate"
cp "$TMP/package/dist/index.js" "$DEST/index.js"
cp "$TMP/package/dist/chunk-WWMSGT6G.js" "$DEST/chunk-WWMSGT6G.js"
cp "$TMP/package/dist/hyphenate/en-us.js" "$DEST/hyphenate/en-us.js"
cp "$TMP/package/dist/chunk-ZW2EUTPS.js" "$DEST/chunk-ZW2EUTPS.js"
cp "$TMP/package/LICENSE" "$DEST/LICENSE"
printf '%s\n' "$V" > "$DEST/VERSION"
echo "vendored justif $V into $DEST"
# This overwrites two site-local patches to the bundle (search it for
# "SITE PATCH"): the intruded-line clamp in intrudedLineCount, and the
# ::before/::after advance fold in readParagraph/buildItems. Re-apply them
# from docs/superpowers/reports/2026-09-09-justif-float-intrusion.md, or
# drop them if the bump already carries the upstream fix. `npm test` fails
# until one or the other is done.
echo "re-apply the SITE PATCH hunks — see docs/superpowers/reports/2026-09-09-justif-float-intrusion.md"
