#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build plugins/emoji/emoji.json from the Unicode emoji data and the CLDR English annotations.

Fedora: dnf install unicode-ucd cldr-emoji-annotation
Debian: apt install unicode-data unicode-cldr-core

Each entry is [emoji, name, keywords] or [emoji, name, keywords, 1], where 1 means
it takes a skin tone modifier after its first code point.
"""
import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "plugins" / "emoji" / "emoji.json"
UCD = Path("/usr/share/unicode/ucd/emoji")
CLDR = Path("/usr/share/unicode/cldr/common")
VS16 = 0xFE0F
ZWJ = 0x200D
TONES = range(0x1F3FB, 0x1F400)
KEYCAP = 0x20E3


def fail(message):
    sys.exit(f"emoji_data: {message}")


def ranges(path, prop):
    found = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)", line)
        if m and m.group(3) == prop:
            found.update(range(int(m.group(1), 16), int(m.group(2) or m.group(1), 16) + 1))
    return found


def emoji_style(path):
    found = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([0-9A-F]+) FE0F\s*;\s*emoji style", line)
        if m:
            found.add(int(m.group(1), 16))
    return found


def annotations(path):
    names, keywords, order = {}, {}, []
    for node in ET.parse(path).getroot().iter("annotation"):
        cp = node.get("cp")
        text = (node.text or "").strip()
        if node.get("type") == "tts":
            names[cp] = text
        else:
            keywords[cp] = [k.strip() for k in text.split("|") if k.strip()]
        if cp not in order:
            order.append(cp)
    return names, keywords, order


def qualify(seq, presentation, styled):
    """Add U+FE0F after code points that default to text style, as emoji-test.txt does."""
    out = []
    cps = [ord(c) for c in seq]
    for i, cp in enumerate(cps):
        out.append(cp)
        nxt = cps[i + 1] if i + 1 < len(cps) else None
        if cp in styled and cp not in presentation and nxt not in TONES and nxt != VS16:
            out.append(VS16)
    return "".join(chr(cp) for cp in out)


def build(ucd, cldr):
    for path in (ucd / "emoji-data.txt", ucd / "emoji-variation-sequences.txt",
                 cldr / "annotations" / "en.xml", cldr / "annotationsDerived" / "en.xml"):
        if not path.exists():
            fail(f"{path} not found")
    emoji = ranges(ucd / "emoji-data.txt", "Emoji")
    presentation = ranges(ucd / "emoji-data.txt", "Emoji_Presentation")
    components = ranges(ucd / "emoji-data.txt", "Emoji_Component")
    styled = emoji_style(ucd / "emoji-variation-sequences.txt")
    names, keywords, order = annotations(cldr / "annotations" / "en.xml")
    d_names, d_keywords, d_order = annotations(cldr / "annotationsDerived" / "en.xml")
    names.update(d_names)
    keywords.update(d_keywords)
    seen = set(order)
    order += [cp for cp in d_order if cp not in seen]
    every = set(order)

    rows = []
    for cp in order:
        cps = [ord(c) for c in cp]
        name = names.get(cp)
        if not name or cps[0] not in emoji:
            continue
        if any(c in TONES for c in cps):
            continue
        if len(cps) == 1 and cps[0] in components and cps[0] not in presentation:
            continue
        if len(cps) == 1 and 0x1F1E6 <= cps[0] <= 0x1F1FF:
            continue
        if KEYCAP not in cps and cps[0] < 0x80:
            continue
        words = set(name.lower().replace(":", " ").replace(",", " ").split())
        extra = [k for k in keywords.get(cp, []) if k.lower() not in words and k.lower() != name.lower()]
        row = [qualify(cp, presentation, styled), name, " | ".join(extra)]
        if cp[0] + "\U0001F3FB" + cp[1:] in every:
            row.append(1)
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ucd", type=Path, default=UCD, help="folder with emoji-data.txt")
    parser.add_argument("--cldr", type=Path, default=CLDR, help="CLDR common folder with annotations/")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    rows = build(args.ucd, args.cldr)
    text = "[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows) + "\n]\n"
    args.output.write_text(text, encoding="utf-8")
    print(f"wrote {len(rows)} emoji to {args.output}")


if __name__ == "__main__":
    main()
