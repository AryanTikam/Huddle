import queue
import sys
import sounddevice as sd
import numpy as np
import whisper
import argparse
import torch
import shutil

# ---------------------------------------------------------------------------
# Multilingual real-time STT — optimised for English, Hindi & Marathi
# Supports a fixed output language: all speech is rendered in that language.
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = ["en", "hi", "mr"]

# Initial prompts nudge decoder toward correct language
LANG_PROMPTS = {
    "hi": "नमस्ते, यह हिंदी में बातचीत है।",
    "mr": "नमस्कार, हे मराठीत संभाषण आहे.",
    "en": "",
}

LANG_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi"}

# deep-translator language codes (Google Translate)
TRANSLATOR_CODES = {"en": "en", "hi": "hi", "mr": "mr"}


def detect_language_restricted(model, audio):
    """Run Whisper's language-detection head, restricted to SUPPORTED_LANGUAGES."""
    audio_padded = whisper.pad_or_trim(audio)
    try:
        mel = whisper.log_mel_spectrogram(
            audio_padded, n_mels=model.dims.n_mels
        ).to(model.device)
    except TypeError:
        mel = whisper.log_mel_spectrogram(audio_padded).to(model.device)
    _, probs = model.detect_language(mel)
    filtered = {lang: probs[lang] for lang in SUPPORTED_LANGUAGES if lang in probs}
    best = max(filtered, key=filtered.get)
    return best, filtered


def translate_text(text, source_lang, target_lang):
    """Translate text using Google Translate (deep-translator)."""
    if source_lang == target_lang or not text.strip():
        return text
    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(
            source=TRANSLATOR_CODES[source_lang],
            target=TRANSLATOR_CODES[target_lang],
        ).translate(text)
        return translated if translated else text
    except Exception as e:
        print(f"\n[translate error: {e}]", file=sys.stderr)
        return text


def main():
    parser = argparse.ArgumentParser(
        description="Real-time multilingual Speech-to-Text (English / Hindi / Marathi)"
    )
    parser.add_argument(
        "--model", default="small",
        help="Whisper model size: tiny, base, small, medium, large "
             "(default: small — recommended minimum for Hindi/Marathi)",
    )
    parser.add_argument(
        "--output", default="en", choices=SUPPORTED_LANGUAGES,
        help="Output language — all speech will be displayed in this language "
             "(default: en). Choices: en, hi, mr",
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    print(f"Loading Whisper model '{args.model}' …")
    model = whisper.load_model(args.model, device=device)
    print("Model loaded.")

    output_lang = args.output
    print(f"Output language: {LANG_NAMES[output_lang]}")
    if output_lang == "en":
        print("  → English speech transcribed directly; Hindi/Marathi translated to English by Whisper")
    else:
        print(f"  → {LANG_NAMES[output_lang]} speech transcribed directly; other languages translated via Google Translate")

    # Audio settings
    samplerate = 16000  # Whisper expects 16 kHz mono
    channels = 1
    use_fp16 = device == "cuda"

    q: queue.Queue = queue.Queue()

    def callback(indata, frames, time_info, status):
        if status:
            print(status, file=sys.stderr)
        q.put(indata.copy())

    print("\nRecording… (Press Ctrl+C to stop)\n")

    # Chunk-based settings
    CHUNK_DURATION = 15  # seconds — finalize chunk after this length

    audio_buffer = np.zeros(0, dtype=np.float32)
    last_output = ""
    last_finalized_text = ""   # carried as initial_prompt for continuity
    last_detected_lang = None  # reuse when buffer is too short to detect

    def clear_live_output():
        """Erase the current live (overwriting) transcription line."""
        nonlocal last_output
        if last_output:
            cols = shutil.get_terminal_size().columns
            sys.stdout.write("\r")
            num_lines_up = (len(last_output) - 1) // cols
            if num_lines_up > 0:
                sys.stdout.write(f"\033[{num_lines_up}A")
            sys.stdout.write("\033[J")
            sys.stdout.flush()
            last_output = ""

    def do_transcribe(audio, is_finalizing=False):
        """
        Transcribe audio and return text in the chosen output language.

        Uses last_finalized_text as initial_prompt for language/context
        continuity across chunks. Falls back to last_detected_lang when
        the audio is too short for reliable language detection (<3s).
        """
        nonlocal last_detected_lang

        # Detect language (skip if audio too short and we have a previous detection)
        if len(audio) >= samplerate * 3 or last_detected_lang is None:
            detected, _ = detect_language_restricted(model, audio)
            last_detected_lang = detected
        else:
            detected = last_detected_lang

        # Build initial_prompt in the OUTPUT language so the decoder
        # stays in the correct script.  last_finalized_text is already in
        # output_lang; LANG_PROMPTS are only used as a first-chunk nudge
        # and must match the output language, not the detected one.
        if last_finalized_text:
            prompt = last_finalized_text
        else:
            prompt = LANG_PROMPTS.get(output_lang, "")

        if output_lang == "en":
            result = model.transcribe(
                audio,
                fp16=use_fp16,
                language=detected,
                task="translate",
                initial_prompt=prompt or None,
            )
            return result["text"].strip()
        else:
            result = model.transcribe(
                audio,
                fp16=use_fp16,
                language=detected,
                task="transcribe",
                initial_prompt=prompt or None,
            )
            text = result["text"].strip()
            if detected != output_lang:
                text = translate_text(text, detected, output_lang)
            return text

    try:
        with sd.InputStream(samplerate=samplerate, channels=channels,
                            callback=callback, dtype="float32"):
            while True:
                # Drain audio queue
                while not q.empty():
                    data = q.get()
                    audio_buffer = np.concatenate((audio_buffer, data.flatten()))

                # Transcribe once we have > 1 second of audio
                if len(audio_buffer) > samplerate * 1:

                    # Chunk finalization: buffer exceeded CHUNK_DURATION
                    if len(audio_buffer) > samplerate * CHUNK_DURATION:
                        text = do_transcribe(audio_buffer, is_finalizing=True)
                        clear_live_output()
                        # Print finalized text permanently
                        print(text)
                        last_finalized_text = text
                        # Start a completely fresh buffer (no overlap needed —
                        # context is carried via initial_prompt)
                        audio_buffer = np.zeros(0, dtype=np.float32)
                    else:
                        # Live transcription — overwrites in-place
                        text = do_transcribe(audio_buffer)
                        output_str = f"> {text}"

                        clear_live_output()
                        sys.stdout.write(output_str)
                        sys.stdout.flush()
                        last_output = output_str

                    sd.sleep(200)
                else:
                    sd.sleep(100)

    except KeyboardInterrupt:
        # Flush any remaining live audio as permanent output
        clear_live_output()
        try:
            if len(audio_buffer) > samplerate * 0.5:
                text = do_transcribe(audio_buffer, is_finalizing=True)
                print(text)
        except KeyboardInterrupt:
            pass  # user pressed Ctrl+C again during final transcription
        print("\nDone.")


if __name__ == "__main__":
    main()
