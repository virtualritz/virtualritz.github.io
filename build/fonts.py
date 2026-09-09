#!/usr/bin/env python3
"""Generate self-hosted webfonts.

Subsets are built with --layout-features='*' because Google Fonts' served
webfonts strip most OpenType features; we need smcp, pcap, dlig and the
italic swashes. Thunder is copied verbatim: its EULA forbids modifying
the files, and the vendor already ships TrueType (Thunder-VF.ttf).
"""
import hashlib, json, os, shutil, subprocess, sys, zipfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "fonts"
CACHE = ROOT / "build" / ".fontcache"
THUNDER_ZIP = Path.home() / "Downloads" / "thunder.zip"

# Latin + the punctuation and space repertoire the pipeline emits.
SUBSET = ("U+0020-007E,U+00A0-00FF,U+0152-0153,U+017F,U+2000-2015,"
          "U+2018-201D,U+2026,U+2032-2033,U+202F,U+205F,U+2060,"
          "U+FB00-FB06,U+FEFF")

SOURCES = [
    ("EB Garamond", "normal", "400",
     "https://github.com/octaviopardo/EBGaramond12/raw/master/fonts/otf/EBGaramond-Regular.otf"),
    ("EB Garamond", "italic", "400",
     "https://github.com/octaviopardo/EBGaramond12/raw/master/fonts/otf/EBGaramond-Italic.otf"),
    ("Source Sans 3", "normal", "400",
     "https://github.com/adobe-fonts/source-sans/raw/release/OTF/SourceSans3-Regular.otf"),
    ("Source Sans 3", "normal", "600",
     "https://github.com/adobe-fonts/source-sans/raw/release/OTF/SourceSans3-Semibold.otf"),
    ("IBM Plex Mono", "normal", "400",
     "https://github.com/IBM/plex/raw/master/packages/plex-mono/fonts/complete/otf/IBMPlexMono-Regular.otf"),
    ("IM Fell English", "normal", "400",
     "https://github.com/google/fonts/raw/main/ofl/imfellenglish/IMFeENrm28P.ttf"),
]

SPACE_CPS = [0x2009, 0x200A, 0x2013, 0x2014, 0x2007, 0x2008]


def fetch(url: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    basename = url.rsplit("/", 1)[-1]
    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    dest = CACHE / f"{url_hash}-{basename}"
    if not dest.exists():
        print(f"  fetch {dest.name}")
        urllib.request.urlretrieve(url, dest)
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
        print(f"  WARNING: {THUNDER_ZIP} not found; skipping Thunder")
        return
    stage = CACHE / "thunder"
    if not stage.exists():
        with zipfile.ZipFile(THUNDER_ZIP) as z:
            z.extractall(stage)
    vf = stage / "THUNDER" / "Fonts" / "Variable-TT" / "Thunder-VF.ttf"
    shutil.copy2(vf, OUT / "Thunder-VF.ttf")
    faces.append({"family": "Thunder VF", "style": "normal",
                  "weight": "100 900", "file": "Thunder-VF.ttf",
                  "unmodified": True, "features": ["kern"]})


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    faces, metrics = [], {}
    for family, style, weight, url in SOURCES:
        src = fetch(url)
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
