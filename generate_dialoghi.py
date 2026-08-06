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

# Parler-TTS tronque parfois la génération après les premiers mots (bug
# connu du modèle, indépendant du texte). On détecte ça a posteriori via le
# ratio durée/caractères (mesuré empiriquement ~0.07-0.16 s/car sur des
# générations saines) et on relance jusqu'à obtenir un ratio plausible.
MIN_RATIO = 0.065
MAX_ATTEMPTS = 4


def generate_audio(model, tokenizer, description_tokenizer, device, description, text):
    input_ids = description_tokenizer(description, return_tensors="pt").input_ids.to(device)
    prompt_input_ids = tokenizer(text, return_tensors="pt").input_ids.to(device)
    generation = model.generate(input_ids=input_ids, prompt_input_ids=prompt_input_ids)
    return generation.cpu().numpy().squeeze()

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
            min_duration = len(text) * MIN_RATIO
            best_audio, best_duration = None, -1

            for attempt in range(1, MAX_ATTEMPTS + 1):
                audio_arr = generate_audio(model, tokenizer, description_tokenizer, device, description, text)
                duration = len(audio_arr) / model.config.sampling_rate
                if duration > best_duration:
                    best_audio, best_duration = audio_arr, duration
                if duration >= min_duration:
                    break
                print(f"  essai {attempt}/{MAX_ATTEMPTS} tronqué ({duration:.1f}s < {min_duration:.1f}s attendu), on relance...", flush=True)
            else:
                print(f"  ATTENTION : toujours court après {MAX_ATTEMPTS} essais, on garde le meilleur ({best_duration:.1f}s).", flush=True)

            wav_path = OUT_DIR / f"{out_id}.wav"
            mp3_path = OUT_DIR / f"{out_id}.mp3"
            sf.write(str(wav_path), best_audio, model.config.sampling_rate)
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
