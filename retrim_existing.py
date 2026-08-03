#!/usr/bin/env python3
"""Applique trim_trailing_hallucination() a posteriori sur des mp3 déjà
générés (sans repasser par Chatterbox) : décode en wav, coupe la queue
parasite, ré-encode. Idempotent — sans effet si déjà propre.

Usage: python retrim_existing.py ./audio/*.mp3
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import torchaudio

from audio_trim import trim_trailing_hallucination


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    changed = 0
    for mp3_path in paths:
        wav, sr = torchaudio.load(str(mp3_path))
        original_len = wav.shape[-1]
        trimmed = trim_trailing_hallucination(wav, sr)
        if trimmed.shape[-1] == original_len:
            continue
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_wav = Path(tmp.name)
        torchaudio.save(str(tmp_wav), trimmed, sr)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp_wav), str(mp3_path)],
            check=True,
        )
        tmp_wav.unlink()
        changed += 1
        cut_s = (original_len - trimmed.shape[-1]) / sr
        print(f"{mp3_path.name}: coupé {cut_s:.2f}s")

    print(f"Terminé — {changed}/{len(paths)} fichiers modifiés.")


if __name__ == "__main__":
    main()
