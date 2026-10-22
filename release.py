"""Prepare a new version of both apps: run this after changing any file the app loads.

- Lists every shared file (style.css, books.js, src/, icons/) in sw.js, so the offline cache
  never misses one.
- Bumps VERSION in sw.js, so phones download the new version (one number for every language).
- Writes each language's own copy of the page, manifest and service worker (ml/) from the
  English ones, which are served from the site root. Those copies point back to the shared
  files with ../.

Usage: python3 release.py           all of the above
       python3 release.py --check   change nothing; fail if sw.js lists the wrong files or the
                                    copies are out of date (tests/run.sh runs this)
"""

import re
import sys
from pathlib import Path

PWA = Path(__file__).resolve().parent
LANGUAGES = ["ml"]
HEADER = "Generated from ../{name} by release.py. Edit that file and run python3 release.py."
SHARED_LIST = re.compile(r"(const ASSETS = \[[^\n]*\.\.\.\[\n)(.*?)(\]\.map\()", re.S)
VERSION = re.compile(r"^const VERSION = (\d+);$", re.M)


def setting(code: str, key: str) -> str:
    """`key: '…',` from src/lang/<code>.js."""
    found = re.findall(rf"^\s*{key}: '([^']*)',$", (PWA / "src/lang" / f"{code}.js").read_text(), re.M)
    assert len(found) == 1, f"{key} in src/lang/{code}.js"
    return found[0]


def replace(text: str, swaps: list[tuple[str, str]], name: str) -> str:
    for old, new in swaps:
        assert text.count(old) == 1, f"{name}: expected {old!r} exactly once"
        text = text.replace(old, new)
    return text


def shared_files() -> list[str]:
    src = sorted(p.relative_to(PWA).as_posix() for p in (PWA / "src").rglob("*.js"))
    icons = sorted(p.relative_to(PWA).as_posix() for p in (PWA / "icons").glob("*.png"))
    return ["style.css", "books.js", *src, *icons]


def with_shared_files(worker: str) -> str:
    """sw.js with its list of shared files as they are on disk."""
    listing = "".join(f"  '{name}',\n" for name in shared_files())
    worker, n = SHARED_LIST.subn(lambda m: m.group(1) + listing + m.group(3), worker)
    assert n == 1, "sw.js: the shared file list (`...[` up to `].map(`) not found"
    return worker


def bumped(worker: str) -> str:
    worker, n = VERSION.subn(lambda m: f"const VERSION = {int(m.group(1)) + 1};", worker)
    assert n == 1, "sw.js: `const VERSION = <number>;` not found"
    return worker


def pages(code: str, worker: str) -> dict[str, str]:
    index = (PWA / "index.html").read_text()
    index = replace(index, [
        ('<!doctype html>\n', f"<!doctype html>\n<!-- {HEADER.format(name='index.html')} -->\n"),
        ('<html lang="en">', f'<html lang="en" data-bible="{code}">'),
        ('href="icons/scroll-180.png"', 'href="../icons/scroll-180.png"'),
        ('href="icons/scroll-192.png"', 'href="../icons/scroll-192.png"'),
        ('href="style.css"', 'href="../style.css"'),
        ('src="src/main.js"', 'src="../src/main.js"'),
    ], "index.html")
    leftover = re.findall(r'(?:href|src)="(?!\.\./|https?:|#|manifest\.webmanifest")[^"]*"', index)
    assert not leftover, f"index.html: relative links release.py doesn't know about: {leftover}"

    manifest = (PWA / "manifest.webmanifest").read_text()
    manifest = manifest.replace('"src": "icons/', '"src": "../icons/')
    assert '"icons/' not in manifest, "manifest.webmanifest: an icon path release.py doesn't know about"

    worker = replace(worker, [
        ("const APP = 'bible-scroll';", f"const APP = '{setting(code, 'cacheName')}';"),
        ("const BIBLE = 'bsb.json';", f"const BIBLE = '{setting(code, 'bibleFile')}';"),
        ("const SHARED = '';", "const SHARED = '../';"),
    ], "sw.js")
    worker = f"// {HEADER.format(name='sw.js')}\n" + worker

    return {"index.html": index, "manifest.webmanifest": manifest, "sw.js": worker}


def main() -> None:
    check = "--check" in sys.argv
    worker = (PWA / "sw.js").read_text()
    listed = with_shared_files(worker)
    outputs = {} if listed == worker else {"sw.js": listed}
    if not check:
        outputs["sw.js"] = listed = bumped(listed)
    for code in LANGUAGES:
        outputs |= {f"{code}/{name}": text for name, text in pages(code, listed).items()}

    stale = [name for name, text in outputs.items()
             if not (PWA / name).exists() or (PWA / name).read_text() != text]
    if check:
        if stale:
            sys.exit(f"Out of date: {', '.join(stale)}. Run python3 release.py.")
        print("sw.js and the language copies are up to date.")
        return
    for name in stale:
        (PWA / name).parent.mkdir(exist_ok=True)
        (PWA / name).write_text(outputs[name])
    print(f"Version {VERSION.search(listed).group(1)}. Wrote {', '.join(stale)}.")


if __name__ == "__main__":
    main()
