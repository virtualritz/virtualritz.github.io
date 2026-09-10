import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// build/fonts.py needs python3 + fontTools to actually run, which CI does
// not install (see justfile: "fonts" is not part of `just check`). These
// tests check the integrity-verification machinery statically instead of
// executing the script, so they run everywhere `npm test` does.
const src = readFileSync(
  new URL("../build/fonts.py", import.meta.url).pathname,
  "utf8",
);

const SHA256 = /^[0-9a-f]{64}$/;

function sourcesBlock() {
  const m = src.match(/SOURCES = \[([\s\S]*?)\n\]/);
  assert.ok(m, "could not find SOURCES list in build/fonts.py");
  return m[1];
}

test("every SOURCES entry pins a commit SHA (not a moving branch)", () => {
  const urls = [
    ...sourcesBlock().matchAll(/"(https:\/\/github\.com\/[^"]+)"/g),
  ].map((m) => m[1]);
  assert.ok(urls.length >= 6, "expected at least 6 source URLs");
  for (const url of urls) {
    const refMatch = url.match(/\/raw\/([^/]+)\//);
    assert.ok(refMatch, `could not find raw ref in ${url}`);
    const ref = refMatch[1];
    assert.ok(
      /^[0-9a-f]{40}$/.test(ref),
      `${url} is not pinned to a 40-char commit SHA (found "${ref}")`,
    );
    assert.ok(
      ref !== "master" && ref !== "main",
      `${url} still points at a moving branch`,
    );
  }
});

test("every SOURCES entry carries a sha256 checksum", () => {
  const hashes = [...sourcesBlock().matchAll(/"([0-9a-f]{64})"/g)].map(
    (m) => m[1],
  );
  assert.ok(hashes.length >= 6, "expected at least 6 recorded sha256 hashes");
  for (const h of hashes) assert.match(h, SHA256);
});

test("fetch() verifies the checksum unconditionally, not only on a fresh download", () => {
  const m = src.match(/def fetch\([\s\S]*?\n\n\ndef /);
  assert.ok(m, "could not find fetch()");
  const body = m[0];
  const ifBlock = body.match(
    /if not dest\.exists\(\):\n([\s\S]*?)\n( {4}\S|\n)/,
  );
  assert.ok(ifBlock, "could not find the cache-miss branch in fetch()");
  assert.ok(
    !/verify_sha256/.test(ifBlock[1]),
    "verify_sha256 must run after the if-block (on every call), not only inside the download branch",
  );
  assert.match(
    body,
    /verify_sha256\(dest, sha256, basename\)/,
    "fetch() must verify the checksum before returning",
  );
});

test("Thunder's zip and extracted file are checksummed too", () => {
  assert.match(src, /THUNDER_ZIP_SHA256\s*=\s*"[0-9a-f]{64}"/);
  assert.match(src, /THUNDER_VF_SHA256\s*=\s*"[0-9a-f]{64}"/);
  assert.match(src, /verify_sha256\(THUNDER_ZIP, THUNDER_ZIP_SHA256/);
  assert.match(src, /verify_sha256\(vf, THUNDER_VF_SHA256/);
});

test("a checksum mismatch fails loudly with old/new hash and a fix-it instruction", () => {
  const m = src.match(/def verify_sha256\([\s\S]*?\n\n\ndef /);
  assert.ok(m, "could not find verify_sha256()");
  const body = m[0];
  assert.match(body, /raise SystemExit/, "mismatch must abort, not just warn");
  assert.match(body, /expected sha256/i);
  assert.match(body, /actual\s+sha256/i);
  assert.match(
    body,
    /update the expected sha256.*deliberately/is,
    "must tell the maintainer how to update the expected hash on purpose",
  );
});

test("THUNDER_ZIP is overridable via environment variable", () => {
  assert.match(
    src,
    /THUNDER_ZIP\s*=\s*Path\(os\.environ\.get\("THUNDER_ZIP"/,
    "THUNDER_ZIP must read from the environment before falling back to the default",
  );
});

test("a missing Thunder zip is a hard error, not a silent skip", () => {
  const m = src.match(/def thunder\([\s\S]*?\n\n\ndef /);
  assert.ok(m, "could not find thunder()");
  const body = m[0];
  assert.doesNotMatch(
    body,
    /WARNING.*skipping/i,
    "a missing Thunder zip must no longer be silently skipped",
  );
  assert.match(
    body,
    /if not THUNDER_ZIP\.exists\(\):\s*\n\s*raise SystemExit/,
    "thunder() must raise instead of warning-and-returning when the zip is absent",
  );
});
