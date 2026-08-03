#!/usr/bin/env python3
"""Pré-génération audio TTS (Chatterbox) pour les textes de l'app.

Usage:
    python pregen_tts.py --input textes.exemple.json --out ./audio --format mp3

Incrémental : un manifest.json stocke le hash de chaque texte déjà généré.
Relance-le après avoir modifié tes textes, seuls les nouveaux/changés sont
régénérés. Interruptible (Ctrl+C) : ce qui est déjà fait reste fait.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

from audio_trim import trim_trailing_hallucination

# Une "phrase" sans aucune lettre (guillemet orphelin, etc., issu du
# découpage de dialogues) n'a rien à prononcer et fait planter Chatterbox.
def has_speakable_content(text):
    return re.search(r"\w", text, re.UNICODE) is not None


def pick_device():
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def text_hash(text, exaggeration, voice_ref, lang):
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    h.update(str(exaggeration).encode("utf-8"))
    h.update((voice_ref or "").encode("utf-8"))
    h.update(lang.encode("utf-8"))
    return h.hexdigest()[:16]


# Clé de correspondance côté client (src/lib/pregenAudio.js) : dérivée du
# texte seul (pas des paramètres de génération), pour que le manifeste
# public puisse être recalculé indépendamment de la voix utilisée. Ne DOIT
# jamais servir à autre chose que retrouver un fichier audio — ce n'est pas
# le hash d'intégrité de `text_hash` ci-dessus.
def content_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


# Le manifeste public (servi depuis public/audio/, donc embarqué dans
# dist/) ne doit jamais contenir le texte des chapitres payants — voir
# scripts/check-build-leaks.mjs. Il ne fait que mapper un hash de contenu
# vers l'id du fichier audio ; le texte reste uniquement dans le manifeste
# privé (manifest_path, hors public/).
def write_public_manifest(manifest, public_path):
    public_manifest = {
        content_hash(entry["text"]): text_id for text_id, entry in manifest.items()
    }
    save_manifest(public_path, public_manifest)


def load_manifest(path):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_manifest(path, manifest):
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def convert_to_mp3(wav_path, mp3_path):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), str(mp3_path)],
        check=True,
    )
    wav_path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="JSON { id: texte }")
    parser.add_argument("--out", default="./audio", help="Dossier de sortie (fichiers audio + manifeste public)")
    parser.add_argument("--manifest-dir", default="./audio-manifest",
                         help="Dossier du manifeste privé (avec texte), jamais servi publiquement")
    parser.add_argument("--format", choices=["wav", "mp3"], default="mp3")
    parser.add_argument("--exaggeration", type=float, default=0.3,
                         help="0.3 = voix posée (pédagogique), 0.7 = expressive")
    parser.add_argument("--cfg-weight", type=float, default=0.5)
    parser.add_argument("--voice-ref", default=None,
                         help="Fichier .wav (~10s) pour cloner une voix")
    parser.add_argument("--lang", default="it",
                         help="Code langue (it, fr, en, ...) — modèle multilingue Chatterbox")
    args = parser.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir = Path(args.manifest_dir)
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "manifest.json"
    public_manifest_path = out_dir / "manifest.json"

    texts = json.loads(input_path.read_text(encoding="utf-8"))
    manifest = load_manifest(manifest_path)

    pending = []
    skipped_empty = 0
    for text_id, text in texts.items():
        if not has_speakable_content(text):
            skipped_empty += 1
            continue
        h = text_hash(text, args.exaggeration, args.voice_ref, args.lang)
        entry = manifest.get(text_id)
        audio_file = out_dir / f"{text_id}.{args.format}"
        if entry and entry.get("hash") == h and audio_file.exists():
            continue
        pending.append((text_id, text, h))

    if skipped_empty:
        print(f"{skipped_empty} texte(s) sans contenu prononçable ignoré(s).")

    if not pending:
        print("Rien à générer : tout est déjà à jour.")
        write_public_manifest(manifest, public_manifest_path)
        return

    print(f"{len(pending)} texte(s) à générer sur {len(texts)} au total.")

    device = pick_device()
    print(f"Device : {device}")

    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    model = ChatterboxMultilingualTTS.from_pretrained(device=device)

    import torchaudio

    failed = []
    try:
        for i, (text_id, text, h) in enumerate(pending, start=1):
            print(f"[{i}/{len(pending)}] {text_id} ...", flush=True)
            try:
                wav = model.generate(
                    text,
                    language_id=args.lang,
                    audio_prompt_path=args.voice_ref,
                    exaggeration=args.exaggeration,
                    cfg_weight=args.cfg_weight,
                )
                wav = trim_trailing_hallucination(wav, model.sr)
                wav_path = out_dir / f"{text_id}.wav"
                torchaudio.save(str(wav_path), wav, model.sr)

                if args.format == "mp3":
                    mp3_path = out_dir / f"{text_id}.mp3"
                    convert_to_mp3(wav_path, mp3_path)

                manifest[text_id] = {"hash": h, "text": text}
                save_manifest(manifest_path, manifest)
                write_public_manifest(manifest, public_manifest_path)
            except Exception as e:
                print(f"  échec sur {text_id} ({e!r}) — ignoré, suite du lot.", flush=True)
                failed.append(text_id)
    except KeyboardInterrupt:
        print("\nInterrompu — relance le script pour reprendre où tu t'es arrêté.")
        write_public_manifest(manifest, public_manifest_path)
        sys.exit(130)

    write_public_manifest(manifest, public_manifest_path)

    if failed:
        print(f"Terminé avec {len(failed)} échec(s) : {', '.join(failed)}")
    else:
        print("Terminé.")


if __name__ == "__main__":
    main()
