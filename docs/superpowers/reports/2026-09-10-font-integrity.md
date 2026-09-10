# Font supply-chain integrity for `build/fonts.py`

Closes the gap where `build/fonts.py` fetched every typeface from a moving
`raw/master`/`raw/main`/`raw/release` GitHub URL with no checksum, then
subsetted and shipped whatever bytes it got to every site visitor. The
`build/.fontcache/` warm-cache also masked this: a "fonts regenerate
identically" pass only proves the machine's cache was warm, not that the
pipeline is reproducible or tamper-evident from a cold start.

## What changed, in one paragraph

Every `SOURCES` entry now names a commit SHA in its URL instead of a branch,
and carries a recorded SHA-256. `fetch()` verifies that hash unconditionally
after `urllib.request.urlretrieve` returns a path — whether that path was
just downloaded or was already sitting in `build/.fontcache/` — so a
corrupted or swapped cache entry is caught the same way a corrupted download
would be. `thunder()` does the same for the local vendor zip and the file it
extracts. Any mismatch raises `SystemExit` with the file, both hashes, and
instructions; nothing is auto-accepted. `THUNDER_ZIP` is now
`os.environ.get("THUNDER_ZIP", ...)`-overridable, and a missing zip is now a
hard error instead of a warning-and-skip.

## How the hashes were obtained

This machine had network access (confirmed with `curl -sI https://github.com`
and by successfully running `build/fonts.py` against the network), so rather
than trust a stale local cache, I:

1. Ran the **original**, unmodified `build/fonts.py` once. This populated a
   cold `build/.fontcache/` from the live `master`/`main`/`release` branches
   and regenerated `static/fonts/*` — `git status` was clean afterwards,
   confirming today's branch tips produce byte-identical output to what's
   currently committed.
2. Computed SHA-256 of each of the six cached originals and of
   `~/Downloads/thunder.zip` with Python's `hashlib` (not `sha256sum`, to
   avoid a terminal-wrapping transcription error I caught partway through).
3. Resolved each source repo's current branch-tip commit with
   `git ls-remote https://github.com/<owner>/<repo>.git refs/heads/<branch>`
   (also cross-checked against `HEAD` — they agreed).
4. Rewrote each `SOURCES` URL to `.../raw/<that commit SHA>/...` and
   **re-fetched over the network** through the new pinned URL, independently
   of the cache, to confirm the commit-pinned content is byte-identical to
   the branch-tip content (same SHA-256 in both cases). This is a verified
   pin, not a guess.
5. Extracted `Thunder-VF.ttf` from the zip and hashed it too
   (`THUNDER_VF_SHA256`), as a second check against a corrupted/re-extracted
   stage directory independent of the zip's own hash.

Recorded hashes (all SHA-256):

| File                       | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| EBGaramond-Regular.otf     | `8d618a6bc6e1f4444e1990c39770a62ccbc29394e57afcc58acd530c16489275` |
| EBGaramond-Italic.otf      | `296feee09f6fa157f913cf3d75460b5e282b3c43dff4ddffbcc5c1a924f4fd14` |
| SourceSans3-Regular.otf    | `08df266400933d3178d081a45f94a08814c3e55b4b7dd2e0ff69cb1329f13ab6` |
| SourceSans3-Semibold.otf   | `36f1cd2c344aa3109e64429bce41a41e4b2b923beb2db19b8dbf9bb56f05a4f9` |
| IBMPlexMono-Regular.otf    | `372fe8f8a459baef84ee346b0a478084e80c46bd299a0c27bcb0f3412f5a9d28` |
| IMFeENrm28P.ttf            | `fe9705bbde51af802719246d4608d08d37bde956ab99d9a590da996a5221a24c` |
| thunder.zip                | `b74ef221d877cbaa5025cfa1dfc30dbd10fa4dbd39517578d021794db0d65d32` |
| Thunder-VF.ttf (extracted) | `5cfe790a6a4ca9b99935be7f4d42078f86218f6e877a7d068839776c107245e1` |

Pinned commits (also in a comment above `SOURCES` in `build/fonts.py`):

| Repo                      | Branch  | Commit                                     |
| ------------------------- | ------- | ------------------------------------------ |
| octaviopardo/EBGaramond12 | master  | `106a4a6d377987459ae5e68673a4570f13b957fb` |
| adobe-fonts/source-sans   | release | `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e` |
| IBM/plex                  | master  | `bf260093582f04622aacc1e9f9ca604d7ccd0c42` |
| google/fonts              | main    | `142c8963e7606b510c93a644c82a4c4cdeae6ef9` |

Task-writing note: the brief anticipated I might have no network access and
said not to fabricate a SHA in that case. I did have network access here
(verified before relying on it) and used it only to read public,
non-sensitive upstream repo metadata (`git ls-remote`) and refetch the same
public font files a second, independent way — not to guess. If a future
maintainer runs this without network access, the fallback is unchanged from
the brief: don't guess, `git ls-remote` when you do have access, then update
the URL, run the script, and deliberately accept the resulting hash after
inspecting the diff.

## Failure behavior

On any mismatch (URL source or Thunder), `verify_sha256()` raises
`SystemExit` naming the file's path, `expected sha256 ...`, `actual sha256
...`, and telling the maintainer: don't proceed blindly, get a clean copy,
inspect the change, and only then update the recorded hash in
`build/fonts.py` deliberately. Nothing auto-accepts a new hash.

## Pinning to immutable refs — what's done, what's left

Done: all six URL sources are pinned to the commit SHA that was each
branch's tip at the time this change was made (2026-09-10), verified via a
second independent fetch as described above, not fabricated.

What a maintainer must do to _re-pin_ later (e.g. picking up an upstream
font update): resolve the new commit with
`git ls-remote https://github.com/<owner>/<repo>.git refs/heads/<branch>`,
edit the URL in `SOURCES`, run `python3 build/fonts.py`. It will fail loudly
on the SHA-256 mismatch (old hash vs. new file) — that failure is the
prompt to inspect the new content and, only if it's legitimate, update the
recorded `sha256` for that entry. The comment directly above `SOURCES` in
`build/fonts.py` documents this loop in place.

Thunder is different: it isn't versioned via a Git ref at all (it's a local
zip a human downloads from the vendor), so "pinning" doesn't apply the same
way — its integrity is covered by `THUNDER_ZIP_SHA256`/`THUNDER_VF_SHA256`
instead.

## `THUNDER_ZIP` decision

Made the path overridable: `THUNDER_ZIP = Path(os.environ.get("THUNDER_ZIP",
str(Path.home() / "Downloads" / "thunder.zip")))`. Documented in the comment
above it and in `thunder()`'s error message.

Changed a missing zip from a warning-and-skip to a hard `SystemExit`. Reasoning:
`Thunder-VF.ttf` is a **committed** file — a skip left it in place on disk
while silently omitting its manifest entry, so the shipped file and the
manifest describing what's shipped fell out of sync, `git status` looked
dirty for unrelated reasons, and `tests/fonts.test.mjs`'s "Thunder is
shipped unmodified" test failed on any machine without the zip. Given `just
fonts`/`just check` are explicitly maintainer-only commands (the justfile
comment says CI does not run `fonts`), whoever runs this script is expected
to have the vendor asset; failing loudly when a required input is missing
is more consistent with the rest of this change (fail loud rather than
silently produce something unexpected) than continuing to paper over it.

## Test evidence

`npm test`: **178 passing**, 0 failing (baseline before this task was 146;
a concurrent agent working on `static/js/**` added tests in the meantime —
this run reflects that plus the 7 new tests below, not a regression).

Added `tests/fonts-integrity.test.mjs` (7 tests) — static source checks
against `build/fonts.py` text, since CI has no `python3`/`fontTools`
installed and `just check` deliberately excludes `fonts` (see `justfile`):
source URLs are pinned to 40-hex-char commit SHAs and not `master`/`main`;
every source carries a 64-hex-char sha256; `fetch()` verifies the hash
unconditionally (not only inside the download branch); Thunder's zip and
extracted file are both checksummed; a mismatch raises `SystemExit` with
both hashes and a "how to update deliberately" instruction;
`THUNDER_ZIP` reads from the environment; a missing Thunder zip raises
instead of warning-and-skipping. Confirmed all 7 fail against the
pre-change `build/fonts.py` (via `git show HEAD:build/fonts.py`) and pass
against the new one, so they exercise the actual behavior change.

`python3 build/fonts.py` against a **cold** cache (`rm -rf
build/.fontcache/` then run): fetched all six sources over the network via
the pinned commit URLs, verified every checksum, ran fontTools subsetting,
and produced `static/fonts/*` — `git status --porcelain` was clean
afterward (byte-identical to what's committed). Re-ran twice more (warm
cache) with the same clean result.

Deliberately broke integrity, twice, and restored both times (verified
clean via `git status`/`difft` after restoring):

- Corrupted a cached source file's bytes directly
  (`echo "corrupted bytes" > build/.fontcache/c061974b-EBGaramond-Regular.otf`)
  → script exited 1 with `integrity check failed for EBGaramond-Regular.otf
...` naming both hashes and the fix-it instructions. Restored the cached
  file from a backup; a clean re-run followed.
- Corrupted the _expected_ hash inside `build/fonts.py` itself (sed-replaced
  the EB Garamond Regular sha256 with `deadbeef...`) → same failure mode,
  correctly reporting the tampered value as "expected" and the real file's
  hash as "actual". Restored `build/fonts.py` from a backup;
  `difft`/`git diff --stat` confirmed no residual change.

Also confirmed the Thunder hard-error and env-override paths:
`THUNDER_ZIP=/tmp/nope-thunder.zip python3 build/fonts.py` exits 1 with the
new error message (fonts still regenerated identically for the five
non-Thunder faces up to that point, and `manifest.json` was not rewritten,
so no partial/desynced manifest was produced); `THUNDER_ZIP=<a valid copy of
thunder.zip>` succeeded, reusing the existing extracted stage, and left the
tree clean.

`zola build`: clean, 3 pages / 2 sections.
`zola check --skip-external-links`: clean.

## What I could not confirm

- I did not have this machine's original `build/.fontcache/` (the task
  description said it would be warm; it was actually absent), so the
  starting hashes come from a fresh network fetch I performed myself rather
  than from a pre-existing cache. I verified this produced byte-identical
  `static/fonts/*` output to what was already committed, which is the
  practical equivalent.
- I did not attempt to verify GitHub's raw-content service will keep
  serving these exact commit SHAs indefinitely (it should, by design —
  commits are immutable — but I have no way to test long-term availability
  from here).
