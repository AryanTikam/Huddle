import queue
import sys
import sounddevice as sd
import numpy as np
import whisper
import argparse
import torch
import shutil
from deep_translator import GoogleTranslator
from langdetect import detect, DetectorFactory

# Set seed for consistent language detection
DetectorFactory.seed = 0

# Devanagari script mapping for Roman transliteration
ROMAN_TO_DEVANAGARI_MAP = {
    # Common Marathi/Hindi words and phrases
    'kasahe': 'कसाहे', 'kasa': 'कसा', 'kasah': 'कसाह', 'kaasa': 'कासा',
    'athe': 'आथे', 'atha': 'आथा', 'astuu': 'आस्तू',
    'baraha': 'बराह', 'baray': 'बराय', 'bara': 'बरा', 'bere': 'बेरे',
    'hello': 'हेलो', 'halo': 'हालो', 'helo': 'हेलो',
    'whos': 'हू', 'who': 'हू',
    'de': 'दे', 'da': 'दा',
    'nasuто': 'नास', 'nasu': 'नासु',
    'suppodiye': 'सपोडीये',
    'cha': 'छ', 'chaa': 'छा',
    'pannas': 'पन्नास',
    'bela': 'बेला',
    'danap': 'दनाप', 'daanap': 'दानाप',
    'magba': 'मग्बा',
    'falun': 'फालुन',
    'sonaa': 'सोना',
    'craig': 'क्रैग',
    'say': 'सय', 'se': 'से',
    'hello': 'हेलो',
    'got': 'गॉट',
    'we': 'वे',
    'engish': 'इंग्लिश',
    'english': 'इंग्लिश',
    'ok': 'ओके',
    'okay': 'ओकेय',
    'alright': 'ऑलराईट',
    'mala': 'मला',
    'tula': 'तुला',
    'aata': 'अता',
    'kaay': 'काय',
    'kaise': 'कैसे',
    'hain': 'हैं',
    'isna': 'इसना',
}

def translate_text(text, source_lang="auto", target_lang="en"):
    """
    Translate text to target language using Google Translate
    
    Args:
        text: Text to translate
        source_lang: Source language code (default: auto for auto-detection)
        target_lang: Target language code (default: en for English)
    
    Returns:
        Translated text
    """
    if not text.strip():
        return text

    try:
        translator = GoogleTranslator(source_language=source_lang, target_language=target_lang)
        translated = translator.translate(text)
        return translated
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def detect_language_text(text):
    """
    Detect language of the text using langdetect library
    Returns: language code (en, hi, mr, etc.)
    """
    try:
        lang = detect(text)
        return lang
    except:
        return "en"  # Default to English if detection fails

def roman_to_devanagari(text, lang="hi"):
    """
    Convert Roman script (transliteration) to Devanagari script.
    Uses a mapping-based approach for common words in Hindi and Marathi.
    
    Args:
        text: Roman script text
        lang: Language code ('hi' for Hindi, 'mr' for Marathi)
    
    Returns:
        Text in Devanagari script
    """
    import re
    
    if not text.strip():
        return text

    result = text.lower()
    
    # Sort keys by length (longest first) to match multi-character sequences first
    sorted_map = sorted(ROMAN_TO_DEVANAGARI_MAP.items(), key=lambda x: len(x[0]), reverse=True)
    
    for roman, devanagari in sorted_map:
        # Use word boundaries to avoid partial replacements
        # Match whole words only
        pattern = r'\b' + re.escape(roman) + r'\b'
        result = re.sub(pattern, devanagari, result, flags=re.IGNORECASE)
    
    # Clean up any remaining extra characters that got through (like 'то', 'ش', etc)
    # Remove non-Devanagari, non-Latin letters, but keep numbers and common punctuation
    result = re.sub(r'[^\u0900-\u097F\u0041-\u005A\u0061-\u007A\s\.\,\?\!]', '', result)

    return result


def process_indic_text(text, detected_lang):
    """
    Process text detected as Hindi (hi) or Marathi (mr).
    Convert Roman transliteration to Devanagari script if needed.
    
    Args:
        text: Input text
        detected_lang: Language code detected by Whisper
    
    Returns:
        Processed text with Devanagari conversion if applicable
    """
    if detected_lang in ['hi', 'mr']:  # Hindi or Marathi
        # Attempt to convert to Devanagari
        devanagari = roman_to_devanagari(text, lang=detected_lang)
        return devanagari, True  # Return converted text and flag

    return text, False

def main():
    parser = argparse.ArgumentParser(description="Real-time Speech to Text using OpenAI Whisper with Multilingual Translation & Devanagari Conversion")
    parser.add_argument("--model", default="base", help="Model size: tiny, base, small, medium, large. For better Hindi/Marathi accuracy, use --model small or --model medium")
    parser.add_argument("--language", default=None, help="Language code (e.g., 'en', 'hi', 'mr'). For best results with Hindi/Marathi, specify --language hi or --language mr")
    parser.add_argument("--translate", action="store_true", help="Enable translation to English")
    parser.add_argument("--translate-target", default="en", help="Target language for translation (default: en for English)")
    args = parser.parse_args()

    # Determine device
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    # Load the model
    print(f"Loading Whisper model: {args.model}...")
    model = whisper.load_model(args.model, device=device)
    print("Model loaded.")

    if args.language:
        print(f"Language set to: {args.language}")
        if args.language in ['hi', 'mr']:
            if args.model == 'base':
                print("⚠️  For better Hindi/Marathi accuracy, try: python stt.py --language {} --model small".format(args.language))
    else:
        print("Language detection enabled.")

    if args.translate:
        print(f"Translation enabled (target: {args.translate_target})")
    else:
        print("Translation disabled.")

    # Audio settings
    samplerate = 16000  # Whisper expects 16kHz
    channels = 1

    # Queue for passing audio data
    q = queue.Queue()

    def callback(indata, frames, time, status):
        """This is called (from a separate thread) for each audio block."""
        if status:
            print(status, file=sys.stderr)
        q.put(indata.copy())

    print("Recording... (Press Ctrl+C to stop)")

    # Buffer to hold audio data
    audio_buffer = np.zeros(0, dtype=np.float32)
    last_output = ""

    # We'll use a blocksize equivalent to 1 second roughly for checking the queue
    # specific blocksize isn't strictly necessary for the callback but helps control update rate

    try:
        with sd.InputStream(samplerate=samplerate, channels=channels, 
                            callback=callback, dtype="float32"):
            while True:
                # Get all data currently in the queue
                while not q.empty():
                    data = q.get()
                    # Flatten and append to buffer
                    audio_buffer = np.concatenate((audio_buffer, data.flatten()))

                # Only transcribe if we have enough data (e.g., > 1 second)
                # And to resemble "real-time", we might want to clear the buffer occasionally
                # However, Whisper works best with context. 
                # For this simple demo, we will transcribe the growing buffer 
                # but truncate it if it gets too long (e.g., 30s) to maintain performance.

                if len(audio_buffer) > samplerate * 1: # 1 second

                    # For performance, if buffer is huge, keep last 30 seconds
                    if len(audio_buffer) > samplerate * 30:
                        audio_buffer = audio_buffer[-(samplerate*30):]

                    # Transcribe
                    # fp16=True is safe for CUDA, False for CPU
                    use_fp16 = (device == "cuda")

                    # If no language specified, let Whisper detect, but bias towards requested language
                    transcribe_lang = args.language

                    result = model.transcribe(
                        audio_buffer, 
                        fp16=use_fp16, 
                        language=transcribe_lang,
                        task="transcribe"
                    )
                    text = result['text'].strip()
                    detected_lang = result.get('language', 'unknown')

                    # Process Indic languages (Hindi/Marathi) - convert to Devanagari
                    processed_text = text
                    is_converted = False
                    if detected_lang in ['hi', 'mr']:
                        processed_text, is_converted = process_indic_text(text, detected_lang)

                    # Translate if enabled
                    translated_text = text
                    if args.translate and detected_lang != args.translate_target:
                        translated_text = translate_text(text, source_lang=detected_lang, target_lang=args.translate_target)

                    # Prepare output string
                    if args.translate:
                        if is_converted:
                            output_str = f"> [{detected_lang.upper()}] {text}\n  [Devanagari] {processed_text}\n  [{args.translate_target.upper()}] {translated_text}"
                        else:
                            output_str = f"> [{detected_lang.upper()}] {text}\n  [{args.translate_target.upper()}] {translated_text}"
                    else:
                        if is_converted:
                            output_str = f"> [{detected_lang.upper()}] {text}\n  [Devanagari] {processed_text}"
                        else:
                            output_str = f"> {text}"

                    # Get terminal width
                    cols = shutil.get_terminal_size().columns

                    # Clear previous output
                    if len(last_output) > 0:
                        # Move to start of current line
                        sys.stdout.write("\r")

                        # Calculate how many lines we need to move up
                        num_lines_up = (len(last_output) - 1) // cols
                        if num_lines_up > 0:
                            sys.stdout.write(f"\033[{num_lines_up}A")

                        # Clear everything from here down
                        sys.stdout.write("\033[J")

                    sys.stdout.write(output_str)
                    sys.stdout.flush()

                    # Update state
                    last_output = output_str

                    # Small sleep to prevent CPU spinning just for the check
                    sd.sleep(200) 
                else:
                    sd.sleep(100)

    except KeyboardInterrupt:
        print("\n\nStopping...")
        print("Final Transcription:")
        if len(audio_buffer) > 0:
            result = model.transcribe(
                audio_buffer, 
                fp16=False,
                language=args.language,
                task="transcribe"
            )
            final_text = result['text']
            detected_lang = result.get('language', 'unknown')

            # Process Indic languages
            if detected_lang in ['hi', 'mr']:
                processed_final, is_converted = process_indic_text(final_text, detected_lang)
                print(f"[{detected_lang.upper()}] {final_text}")
                if is_converted:
                    print(f"\n[Devanagari]:")
                    print(processed_final)
            else:
                print(final_text)

            if args.translate and detected_lang != args.translate_target:
                translated_final = translate_text(final_text, source_lang=detected_lang, target_lang=args.translate_target)
                print(f"\nTranslation to {args.translate_target.upper()}:")
                print(translated_final)
        print("Done.")

if __name__ == "__main__":
    main()