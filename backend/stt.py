import queue
import sys
import sounddevice as sd
import numpy as np
import whisper
import argparse
import torch
import shutil

def main():
    parser = argparse.ArgumentParser(description="Real-time Speech to Text using OpenAI Whisper")
    parser.add_argument("--model", default="base", help="Model size: tiny, base, small, medium, large")
    parser.add_argument("--language", default=None, help="Language code (e.g., 'en', 'es', 'fr', 'hi'). Leave empty for auto-detection.")
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
    else:
        print("Language detection enabled.")

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
                    result = model.transcribe(
                        audio_buffer, 
                        fp16=use_fp16, 
                        language=args.language
                    )
                    text = result['text'].strip()
                    
                    # Prepare output string
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
            result = model.transcribe(audio_buffer, fp16=False)
            print(result['text'])
        print("Done.") #

if __name__ == "__main__":
    main()
