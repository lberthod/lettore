"""Coupe la queue parasite que Chatterbox ajoute parfois après la fin d'une
phrase (mots/bruits fantômes générés après un silence, surtout sur les
phrases courtes) : détecte les segments de parole séparés par un silence
prolongé et ne garde que le premier segment.
"""


def trim_trailing_hallucination(wav, sr, silence_thresh_db=-40, min_gap_s=0.35, frame_ms=20, pad_s=0.15):
    import torch

    audio = wav.squeeze(0) if wav.dim() > 1 else wav
    frame_len = max(1, int(sr * frame_ms / 1000))
    n_frames = audio.shape[-1] // frame_len
    if n_frames < 2:
        return wav

    frames = audio[: n_frames * frame_len].reshape(n_frames, frame_len)
    rms = frames.pow(2).mean(dim=1).sqrt()
    rms_db = 20 * torch.log10(rms.clamp(min=1e-8))
    is_speech = (rms_db > silence_thresh_db).tolist()

    segments = []
    in_seg = False
    start = 0
    for i, s in enumerate(is_speech):
        if s and not in_seg:
            start = i
            in_seg = True
        elif not s and in_seg:
            segments.append((start, i))
            in_seg = False
    if in_seg:
        segments.append((start, n_frames))

    if len(segments) <= 1:
        return wav

    min_gap_frames = max(1, int(min_gap_s * 1000 / frame_ms))
    cutoff_frame = None
    for i in range(len(segments) - 1):
        gap = segments[i + 1][0] - segments[i][1]
        if gap >= min_gap_frames:
            cutoff_frame = segments[i][1]
            break

    if cutoff_frame is None:
        return wav

    pad_frames = int(pad_s * 1000 / frame_ms)
    cutoff_frame = min(cutoff_frame + pad_frames, n_frames)
    cutoff_sample = cutoff_frame * frame_len
    trimmed = audio[:cutoff_sample]
    return trimmed.unsqueeze(0) if wav.dim() > 1 else trimmed
