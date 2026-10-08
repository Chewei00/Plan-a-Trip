"""Bump the version tag on every script and stylesheet address, so browsers fetch the new files together.

GitHub Pages lets browsers keep files for ten minutes. Without a version tag, a browser can mix a new file with an
old cached one and the page breaks. Run this before every push that changes anything under js/ or css/:

    python3 tools/release.py
"""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
index = root / "index.html"
current = re.search(r"main\.js\?v=(\d+)", index.read_text(encoding="utf-8"))
new = int(current.group(1)) + 1 if current else 1
tag = re.compile(r"(\.(?:js|css))\?v=\d+")

for path in [index, *sorted((root / "js").glob("*.js"))]:
    text = path.read_text(encoding="utf-8")
    updated = tag.sub(lambda m: f"{m.group(1)}?v={new}", text)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
print(f"version {new}")
