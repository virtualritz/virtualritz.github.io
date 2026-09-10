#!/usr/bin/env python3
"""Generate self-hosted webfonts.

Subsets are built with --layout-features='*' because Google Fonts' served
webfonts strip most OpenType features; we need smcp, pcap, dlig and the
italic swashes. Thunder is copied verbatim: its EULA forbids modifying
the files, and the vendor already ships TrueType (Thunder-VF.ttf).

Every source below is pinned to a commit SHA (not a moving branch) and
checked against a recorded SHA-256 after fetch and again on every cache
hit, so a corrupted cache, a swapped file, or upstream history rewriting
the pinned commit is caught instead of silently subsetted and shipped to
visitors. See docs/superpowers/reports/2026-09-10-font-integrity.md for
how the pins and hashes were obtained and how to update them.
"""
import hashlib, json, os, shutil, subprocess, sys, zipfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "fonts"
CACHE = ROOT / "build" / ".fontcache"
# Overridable so contributors without the vendor zip at this default path
# (or on CI) can point at their own copy.
THUNDER_ZIP = Path(os.environ.get("THUNDER_ZIP", str(Path.home() / "Downloads" / "thunder.zip")))
THUNDER_ZIP_SHA256 = "b74ef221d877cbaa5025cfa1dfc30dbd10fa4dbd39517578d021794db0d65d32"
THUNDER_VF_SHA256 = "5cfe790a6a4ca9b99935be7f4d42078f86218f6e877a7d068839776c107245e1"

# Latin + the punctuation and space repertoire the pipeline emits.
SUBSET = ("U+0020-007E,U+00A0-00FF,U+0152-0153,U+017F,U+2000-2015,"
          "U+2018-201D,U+2026,U+2032-2033,U+202F,U+205F,U+2060,"
          "U+FB00-FB06,U+FEFF")

# URLs are pinned to the commit that was HEAD of the font's branch when
# this integrity check was added (2026-09-10); the sha256 is the content
# at that commit. To bump a font: resolve the new commit with
# `git ls-remote <repo> refs/heads/<branch>`, update the URL, run this
# script (it will fail on the hash mismatch), inspect the new file, and
# only then update the sha256 to match deliberately.
SOURCES = [
    ("EB Garamond", "normal", "400",
     "https://github.com/octaviopardo/EBGaramond12/raw/106a4a6d377987459ae5e68673a4570f13b957fb/fonts/otf/EBGaramond-Regular.otf",
     "8d618a6bc6e1f4444e1990c39770a62ccbc29394e57afcc58acd530c16489275"),
    ("EB Garamond", "italic", "400",
     "https://github.com/octaviopardo/EBGaramond12/raw/106a4a6d377987459ae5e68673a4570f13b957fb/fonts/otf/EBGaramond-Italic.otf",
     "296feee09f6fa157f913cf3d75460b5e282b3c43dff4ddffbcc5c1a924f4fd14"),
    ("Source Sans 3", "normal", "400",
     "https://github.com/adobe-fonts/source-sans/raw/87b37a2daaed80fcb8e8ccb0085c4d72ddade12e/OTF/SourceSans3-Regular.otf",
     "08df266400933d3178d081a45f94a08814c3e55b4b7dd2e0ff69cb1329f13ab6"),
    ("Source Sans 3", "normal", "600",
     "https://github.com/adobe-fonts/source-sans/raw/87b37a2daaed80fcb8e8ccb0085c4d72ddade12e/OTF/SourceSans3-Semibold.otf",
     "36f1cd2c344aa3109e64429bce41a41e4b2b923beb2db19b8dbf9bb56f05a4f9"),
    ("IBM Plex Mono", "normal", "400",
     "https://github.com/IBM/plex/raw/bf260093582f04622aacc1e9f9ca604d7ccd0c42/packages/plex-mono/fonts/complete/otf/IBMPlexMono-Regular.otf",
     "372fe8f8a459baef84ee346b0a478084e80c46bd299a0c27bcb0f3412f5a9d28"),
    ("IM Fell English", "normal", "400",
     "https://github.com/google/fonts/raw/142c8963e7606b510c93a644c82a4c4cdeae6ef9/ofl/imfellenglish/IMFeENrm28P.ttf",
     "fe9705bbde51af802719246d4608d08d37bde956ab99d9a590da996a5221a24c"),
]

SPACE_CPS = [0x2009, 0x200A, 0x2013, 0x2014, 0x2007, 0x2008]


def verify_sha256(path: Path, expected: str, label: str) -> None:
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(
            f"integrity check failed for {label} ({path}):\n"
            f"  expected sha256 {expected}\n"
            f"  actual   sha256 {actual}\n"
            "The file does not match what was recorded. This can mean the "
            "cache (or the local Thunder zip) was corrupted or swapped, or "
            "that pinned upstream content changed. Do not proceed blindly: "
            "delete build/.fontcache/ (or re-fetch the Thunder zip) and "
            "re-run to get a clean copy, inspect what changed, and only if "
            "it's legitimate update the expected sha256 for this file in "
            "build/fonts.py deliberately."
        )


def fetch(url: str, sha256: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    basename = url.rsplit("/", 1)[-1]
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    dest = CACHE / f"{url_hash}-{basename}"
    if not dest.exists():
        print(f"  fetch {dest.name}")
        urllib.request.urlretrieve(url, dest)
    verify_sha256(dest, sha256, basename)
    return dest


def subset(src: Path, out: Path) -> None:
    result = subprocess.run([sys.executable, "-m", "fontTools.subset", str(src),
                             f"--unicodes={SUBSET}", "--layout-features=*",
                             "--flavor=woff2", "--no-hinting", "--desubroutinize",
                             f"--output-file={out}"], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"fontTools.subset failed for {src}:\n{result.stderr}")


def audit(path: Path) -> dict:
    from fontTools.ttLib import TTFont
    ft = TTFont(str(path), lazy=True)
    upem = ft["head"].unitsPerEm
    os2 = ft["OS/2"]
    cm = ft.getBestCmap()
    hm = ft["hmtx"]
    feats = set()
    for tag in ("GSUB", "GPOS"):
        if tag in ft:
            t = ft[tag].table
            if t and t.FeatureList:
                for fr in t.FeatureList.FeatureRecord:
                    feats.add(fr.FeatureTag)
    spaces = {hex(cp): (round(hm[cm[cp]][0] / upem, 4) if cp in cm else None)
              for cp in SPACE_CPS}
    out = {
        "features": sorted(feats),
        "upem": upem,
        "xem": round((getattr(os2, "sxHeight", 0) or 0) / upem, 4),
        "capem": round((getattr(os2, "sCapHeight", 0) or 0) / upem, 4),
        "spaces": spaces,
    }
    ft.close()
    return out


def thunder(faces: list) -> None:
    """Copy the vendor's TrueType file verbatim. Do not subset or convert."""
    if not THUNDER_ZIP.exists():
        raise SystemExit(
            f"Thunder source zip not found at {THUNDER_ZIP}.\n"
            "Thunder-VF.ttf is a committed, unmodified vendor file and "
            "static/fonts/manifest.json must declare it; generating a "
            "manifest without it would silently desync the two (and dirty "
            "the tree, since the committed .ttf stays in place). Get the "
            "vendor zip and either place it at ~/Downloads/thunder.zip or "
            "point THUNDER_ZIP at it, e.g.:\n"
            "  THUNDER_ZIP=/path/to/thunder.zip python3 build/fonts.py"
        )
    verify_sha256(THUNDER_ZIP, THUNDER_ZIP_SHA256, "thunder.zip")
    stage = CACHE / "thunder"
    if not stage.exists():
        with zipfile.ZipFile(THUNDER_ZIP) as z:
            z.extractall(stage)
    vf = stage / "THUNDER" / "Fonts" / "Variable-TT" / "Thunder-VF.ttf"
    verify_sha256(vf, THUNDER_VF_SHA256, "Thunder-VF.ttf")
    shutil.copy2(vf, OUT / "Thunder-VF.ttf")
    faces.append({"family": "Thunder VF", "style": "normal",
                  "weight": "100 900", "file": "Thunder-VF.ttf",
                  "unmodified": True, "features": ["kern"]})


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    faces, metrics = [], {}
    for family, style, weight, url, sha256 in SOURCES:
        src = fetch(url, sha256)
        slug = f"{family.replace(' ', '')}-{style}-{weight}.woff2"
        subset(src, OUT / slug)
        info = audit(OUT / slug)
        faces.append({"family": family, "style": style, "weight": weight,
                      "file": slug, "unmodified": False,
                      "features": info["features"]})
        key = slug.replace(".woff2", "")
        metrics[key] = {k: info[k] for k in ("upem", "xem", "capem", "spaces")}
        print(f"  {slug}  {(OUT / slug).stat().st_size // 1024} KiB")
    thunder(faces)
    (OUT / "manifest.json").write_text(
        json.dumps({"faces": faces, "metrics": metrics}, indent=1))
    print(f"  manifest.json  {len(faces)} faces")


if __name__ == "__main__":
    main()
