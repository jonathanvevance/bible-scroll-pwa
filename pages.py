"""Write each language's own copy of the page, manifest and service worker from the English ones.

English is served from the site root; every other language from a folder (ml/), where these
three files point back to the shared ones with ../. Edit the English files, then run this.

Usage: python3 pages.py           write ml/index.html, ml/manifest.webmanifest, ml/sw.js
       python3 pages.py --check   change nothing; fail if any of them is out of date
"""

import re
import sys
from pathlib import Path

PWA = Path(__file__).resolve().parent
LANGUAGES = ["ml"]
HEADER = "Generated from ../{name} by pages.py. Edit that file and run python3 pages.py."


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


def pages(code: str) -> dict[str, str]:
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
    assert not leftover, f"index.html: relative links pages.py doesn't know about: {leftover}"

    manifest = (PWA / "manifest.webmanifest").read_text()
    manifest = manifest.replace('"src": "icons/', '"src": "../icons/')
    assert '"icons/' not in manifest, "manifest.webmanifest: an icon path pages.py doesn't know about"

    worker = (PWA / "sw.js").read_text()
    worker = replace(worker, [
        ("const APP = 'bible-scroll';", f"const APP = '{setting(code, 'cacheName')}';"),
        ("const BIBLE = 'bsb.json';", f"const BIBLE = '{setting(code, 'bibleFile')}';"),
        ("const SHARED = '';", "const SHARED = '../';"),
    ], "sw.js")
    worker = f"// {HEADER.format(name='sw.js')}\n" + worker

    return {"index.html": index, "manifest.webmanifest": manifest, "sw.js": worker}


def main() -> None:
    check = "--check" in sys.argv
    stale = []
    for code in LANGUAGES:
        for name, text in pages(code).items():
            path = PWA / code / name
            if path.exists() and path.read_text() == text:
                continue
            stale.append(f"{code}/{name}")
            if not check:
                path.parent.mkdir(exist_ok=True)
                path.write_text(text)
    if check and stale:
        sys.exit(f"Out of date: {', '.join(stale)}. Run python3 pages.py.")
    print("Up to date." if not stale else f"Wrote {', '.join(stale)}.")


if __name__ == "__main__":
    main()
