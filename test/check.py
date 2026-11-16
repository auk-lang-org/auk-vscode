#!/usr/bin/env python3
"""Validate syntaxes/duck.tmLanguage.json without dependencies.

Checks: the JSON parses, every `include` target exists, and every regex
compiles under Python `re` (after translating some Oniguruma-only syntax).
Regexes that still don't compile are reported as warnings, not errors.
Usage: python3 -I test/check.py
"""
import json
import re
import sys
from pathlib import Path

GRAMMAR = Path(__file__).resolve().parent.parent / "syntaxes" / "duck.tmLanguage.json"
REGEX_KEYS = ("match", "begin", "end", "while")


def to_python(rx):
    """Convert common Oniguruma constructs to Python `re` equivalents."""
    rx = re.sub(r"\(\?<([A-Za-z_]\w*)>", r"(?P<\1>", rx)   # named groups
    rx = rx.replace(r"\h", "[0-9A-Fa-f]").replace(r"\H", "[^0-9A-Fa-f]")
    rx = rx.replace(r"\G", "")                              # anchor: no equivalent
    rx = re.sub(r"\\k<([A-Za-z_]\w*)>", r"(?P=\1)", rx)
    rx = re.sub(r"([*+?}])\+", r"\1", rx)                   # possessive -> greedy
    return rx


def walk(node, path, out):
    if isinstance(node, dict):
        for k, v in node.items():
            walk(v, f"{path}.{k}", out)
            if k in REGEX_KEYS and isinstance(v, str):
                out["regex"].append((f"{path}.{k}", v))
            if k == "include" and isinstance(v, str):
                out["include"].append((path, v))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk(v, f"{path}[{i}]", out)


def main():
    errors, warnings = [], []
    try:
        g = json.loads(GRAMMAR.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"ERROR: cannot load {GRAMMAR}: {e}")
        return 1
    for key in ("scopeName", "patterns", "repository"):
        if key not in g:
            errors.append(f"missing top-level key {key!r}")
    repo = g.get("repository", {})
    found = {"regex": [], "include": []}
    walk(g, "$", found)
    for where, inc in found["include"]:
        if inc in ("$self", "$base"):
            continue
        if inc.startswith("#"):
            if inc[1:] not in repo:
                errors.append(f"{where}: include {inc} has no repository entry")
        elif not inc.startswith("source."):
            errors.append(f"{where}: unexpected include {inc!r}")
    for where, rx in found["regex"]:
        try:
            re.compile(to_python(rx))
        except re.error as e:
            warnings.append(f"{where}: regex {rx!r} not checkable in Python re ({e})")
    unused = set(repo) - {i[1:] for _, i in found["include"] if i.startswith("#")}
    for name in sorted(unused):
        warnings.append(f"repository entry {name!r} is never included")
    for w in warnings:
        print("WARN:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"{len(found['regex'])} regexes, {len(found['include'])} includes, "
          f"{len(repo)} repository rules: {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
