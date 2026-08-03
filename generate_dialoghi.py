#!/usr/bin/env python3
"""Génère l'audio (Parler-TTS) de tous les dialogues italiens définis dans
dialoghi_it.json, voix homme grave / femme grave. Reprend automatiquement
là où il s'est arrêté (saute les fichiers déjà générés)."""
import json
import subprocess
import time
from pathlib import Path

import torch
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
import soundfile as sf

OUT_DIR = Path("public/audio")
DESC = {
    "uomo": "A deep, low-pitched male voice, speaking slowly and calmly, in a very clear recording with no background noise.",
    "donna": "A deep, low-pitched female voice, speaking slowly and calmly, in a very clear recording with no background noise.",
}

def main():
    data = json.loads(Path("dialoghi_it.json").read_text(encoding="utf-8"))
    dialoghi = data["quotidiano"] + data["storia"]

    # Construit la liste complète des lignes à générer, avec id unique.
    tasks = []
    for dlg in dialoghi:
        for i, line in enumerate(dlg["lines"], start=1):
            out_id = f"{dlg['id']}_{i}"
            tasks.append((out_id, line["speaker"], line["text"]))

    pending = [t for t in tasks if not (OUT_DIR / f"{t[0]}.mp3").exists()]
    print(f"{len(pending)} ligne(s) à générer sur {len(tasks)} au total.")
    if not pending:
        print("Rien à générer : tout est déjà fait.")
        return

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model_name = "parler-tts/parler-tts-mini-multilingual-v1.1"
    print(f"Chargement du modèle sur {device} ...")
    t0 = time.time()
    model = ParlerTTSForConditionalGeneration.from_pretrained(model_name).to(device)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    description_tokenizer = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
    print(f"Modèle chargé en {time.time()-t0:.1f}s")

    failed = []
    for i, (out_id, speaker, text) in enumerate(pending, start=1):
        t1 = time.time()
        print(f"[{i}/{len(pending)}] {out_id} ({speaker}, {len(text)} car.) ...", flush=True)
        try:
            description = DESC[speaker]
            input_ids = description_tokenizer(description, return_tensors="pt").input_ids.to(device)
            prompt_input_ids = tokenizer(text, return_tensors="pt").input_ids.to(device)
            generation = model.generate(input_ids=input_ids, prompt_input_ids=prompt_input_ids)
            audio_arr = generation.cpu().numpy().squeeze()

            wav_path = OUT_DIR / f"{out_id}.wav"
            mp3_path = OUT_DIR / f"{out_id}.mp3"
            sf.write(str(wav_path), audio_arr, model.config.sampling_rate)
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), str(mp3_path)],
                check=True,
            )
            wav_path.unlink()
            print(f"  -> {mp3_path.name} ({time.time()-t1:.1f}s)", flush=True)
        except Exception as e:
            print(f"  échec sur {out_id} ({e!r}) — ignoré, suite du lot.", flush=True)
            failed.append(out_id)

    if failed:
        print(f"Terminé avec {len(failed)} échec(s) : {', '.join(failed)}")
    else:
        print("Terminé, tout a été généré avec succès.")

if __name__ == "__main__":
    main()
