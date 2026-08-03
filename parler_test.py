#!/usr/bin/env python3
"""Génère un dialogue en italien entre une voix masculine grave et une voix
féminine grave (parler-tts-mini-multilingual-v1.1), une ligne = un fichier."""
import torch
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
import soundfile as sf

device = "mps" if torch.backends.mps.is_available() else "cpu"
model_name = "parler-tts/parler-tts-mini-multilingual-v1.1"

model = ParlerTTSForConditionalGeneration.from_pretrained(model_name).to(device)
tokenizer = AutoTokenizer.from_pretrained(model_name)
description_tokenizer = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)

desc_uomo = "A deep, low-pitched male voice, speaking slowly and calmly, in a very clear recording with no background noise."
desc_donna = "A deep, low-pitched female voice, speaking slowly and calmly, in a very clear recording with no background noise."

dialogue = [
    ("dialogue_it_h1", desc_uomo, "Dimmi, sai perché il vescovo di Sion ha così tanto potere in Vallese?"),
    ("dialogue_it_f1", desc_donna, "Sì, tutto viene da una donazione fatta dal re Rodolfo Terzo, nell'anno novecentonovantanove."),
    ("dialogue_it_h2", desc_uomo, "Il re ha dato tutto il Vallese alla Chiesa? Sembra un gesto enorme."),
    ("dialogue_it_f2", desc_donna, "Non esattamente. Gli ha affidato soprattutto il potere di governare e di amministrare la giustizia, non ogni campo e ogni villaggio."),
    ("dialogue_it_h3", desc_uomo, "E perché un re farebbe una cosa simile? Perde una parte della sua autorità."),
    ("dialogue_it_f3", desc_donna, "Era una strategia politica. Rafforzando il vescovo, Rodolfo Terzo si creava un alleato fedele contro i signori che contestavano il suo potere."),
]

for out_id, description, text in dialogue:
    print(f"Génération : {out_id} ...")
    input_ids = description_tokenizer(description, return_tensors="pt").input_ids.to(device)
    prompt_input_ids = tokenizer(text, return_tensors="pt").input_ids.to(device)
    generation = model.generate(input_ids=input_ids, prompt_input_ids=prompt_input_ids)
    audio_arr = generation.cpu().numpy().squeeze()
    sf.write(f"public/audio/{out_id}.wav", audio_arr, model.config.sampling_rate)
    print(f"  -> public/audio/{out_id}.wav")

print("Terminé.")
