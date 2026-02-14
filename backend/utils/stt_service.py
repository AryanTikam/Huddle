"""
Speech-to-Text Service using OpenAI Whisper.
Falls back gracefully if Whisper/PyTorch/ffmpeg aren't installed.

Usage:
    from utils.stt_service import stt_service
    
    if stt_service.is_available:
        text = stt_service.transcribe(audio_bytes, language='en')
"""

import os
import tempfile

# Ensure imageio-ffmpeg's bundled ffmpeg is on PATH before importing Whisper
try:
    import imageio_ffmpeg
    import shutil as _shutil
    _ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    _ffmpeg_dir = os.path.dirname(_ffmpeg_exe)
    # imageio-ffmpeg names it 'ffmpeg-win-x86_64-v7.1.exe' etc.
    # Whisper expects just 'ffmpeg' / 'ffmpeg.exe' — create a copy if missing
    _expected_name = os.path.join(_ffmpeg_dir, 'ffmpeg.exe')
    if not os.path.exists(_expected_name):
        import shutil as _shutil2
        _shutil2.copy2(_ffmpeg_exe, _expected_name)
        print(f"[STT] Created ffmpeg.exe copy at {_expected_name}")
    if _ffmpeg_dir not in os.environ.get('PATH', ''):
        os.environ['PATH'] = _ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
        print(f"[STT] Added imageio-ffmpeg to PATH: {_ffmpeg_dir}")
except ImportError:
    pass  # Will rely on system ffmpeg
except Exception as _e:
    print(f"[STT] Warning setting up ffmpeg: {_e}")

# Try to import Whisper — it's optional (heavy dependency)
try:
    import whisper
    import torch
    import numpy as np
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False


class STTService:
    def __init__(self):
        self._model = None
        self._model_name = os.getenv('WHISPER_MODEL', 'base')
        self._device = None
        self.is_available = WHISPER_AVAILABLE

        if WHISPER_AVAILABLE:
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[STT] Whisper available. Device: {self._device}, Model: {self._model_name}")
        else:
            print("[STT] WARNING: Whisper not installed — transcription will not work. "
                  "Install with: pip install openai-whisper")

    def _load_model(self):
        """Lazy-load the Whisper model on first use."""
        if self._model is None and WHISPER_AVAILABLE:
            print(f"[STT] Loading Whisper model '{self._model_name}'...")
            self._model = whisper.load_model(self._model_name, device=self._device)
            print(f"[STT] Whisper model loaded on {self._device}")
        return self._model

    def transcribe(self, audio_bytes: bytes, language: str = 'en') -> str:
        """
        Transcribe audio bytes (WebM/opus or any ffmpeg-supported format) to text.
        
        Args:
            audio_bytes: Raw audio file bytes (e.g., WebM from MediaRecorder)
            language: Language code (e.g., 'en', 'es', 'hi'). 
                      Pass None for auto-detection.
        
        Returns:
            Transcribed text string, or empty string on failure/silence.
        """
        if not self.is_available:
            raise RuntimeError("Whisper is not available")

        model = self._load_model()
        if model is None:
            return ''

        tmp_path = None
        try:
            # Write audio bytes to a temp file — Whisper needs a file path
            # (it uses ffmpeg internally to decode any format to 16kHz mono PCM)
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name

            # Load and convert audio using Whisper's built-in loader (uses ffmpeg)
            audio = whisper.load_audio(tmp_path)

            # Skip very short audio (less than 0.5 seconds)
            if len(audio) < 8000:  # 16kHz * 0.5s = 8000 samples
                return ''

            # Transcribe
            use_fp16 = (self._device == "cuda")
            
            # Extract 2-letter language code from locale (e.g., 'en-US' → 'en')
            lang_code = language.split('-')[0] if language else None

            result = model.transcribe(
                audio,
                fp16=use_fp16,
                language=lang_code if lang_code else None
            )

            text = result.get('text', '').strip()
            return text

        except Exception as e:
            print(f"[STT] Whisper transcription error: {e}")
            return ''
        finally:
            # Clean up temp file
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


# Singleton instance — import and use directly
stt_service = STTService()
