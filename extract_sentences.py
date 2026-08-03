#!/usr/bin/env python3
"""Extrait les phrases d'un livre (tous chapitres) vers un JSON { id: phrase }
prêt pour pregen_tts.py, avec le même découpage que BookReaderView.vue.

Usage: python extract_sentences.py <book-id> [<book-id> ...]
"""
import json
import re
import sys
from pathlib import Path

for book_id in sys.argv[1:]:
    book_path = Path(f"src/books/{book_id}/book.json")
    book = json.loads(book_path.read_text(encoding="utf-8"))
    out = {}
    for ch in book["chapters"]:
        ch_id = ch["id"]
        ch_path = Path(f"src/books/{book_id}/{book_id}-{ch_id}.json")
        data = json.loads(ch_path.read_text(encoding="utf-8"))
        idx = 1
        for p in data.get("paragraphs", []):
            sentences = re.findall(r"[^.!?]+[.!?]*\s*", p) or [p]
            for s in sentences:
                s = s.strip()
                if not s:
                    continue
                out[f"{book_id}_{ch_id}_s{idx}"] = s
                idx += 1
    out_path = Path(f"textes_{book_id}_sentences.json")
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{book_id}: {len(out)} phrases -> {out_path}")
