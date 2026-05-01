import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const useSTT = ({ language = 'en-US', meetingId = null, currentSpeaker = 'Speaker', onTranscript, isExtension = false }) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState('');
  const [activeEngine, setActiveEngine] = useState('whisper'); // 'whisper' or 'webkit'
  
  const { makeAuthenticatedRequest } = useAuth();
  
  const activeStreamRef = useRef(null);
  const whisperRecorderRef = useRef(null);
  const whisperTimerRef = useRef(null);
  
  const webkitRecognitionRef = useRef(null);
  
  const isCapturingRef = useRef(false);
  const sttPreferenceRef = useRef(localStorage.getItem('huddle_stt_preference') || 'whisper');
  const engineRef = useRef(sttPreferenceRef.current);

  // Keep references fresh for closures
  const currentSpeakerRef = useRef(currentSpeaker);
  const languageRef = useRef(language);
  const meetingIdRef = useRef(meetingId);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    currentSpeakerRef.current = currentSpeaker;
    languageRef.current = language;
    meetingIdRef.current = meetingId;
    onTranscriptRef.current = onTranscript;
  }, [currentSpeaker, language, meetingId, onTranscript]);
  
  useEffect(() => {
    const pref = localStorage.getItem('huddle_stt_preference') || 'whisper';
    sttPreferenceRef.current = pref;
    engineRef.current = pref;
    setActiveEngine(pref);
  }, []);
  
  // -- Whisper Implementation --
  const sendBlobForTranscription = async (blob) => {
    if (!isCapturingRef.current) return;
    if (blob.size < 1000) return;
    
    try {
      const base64data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      const response = await makeAuthenticatedRequest('/recording/transcribe-audio', {
        method: 'POST',
        body: JSON.stringify({
          audio_data: base64data,
          language: languageRef.current,
          meeting_id: meetingIdRef.current,
          speaker: currentSpeakerRef.current
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.text && data.text.trim()) {
          if (onTranscriptRef.current) {
            onTranscriptRef.current({
              id: Date.now(),
              speaker: currentSpeakerRef.current,
              text: data.text.trim(),
              timestamp: new Date().toLocaleTimeString(),
              confidence: 0.85
            }, { engine: 'whisper' });
          }
        }
      } else {
        throw new Error("Whisper unavailable");
      }
    } catch (err) {
      console.error('[STT] Whisper error, falling back to WebKit', err);
      // Fallback
      if (engineRef.current === 'whisper') {
         engineRef.current = 'webkit';
         setActiveEngine('webkit');
         stopWhisper();
         startWebKit();
         setError('Whisper unavailable. Falling back to WebKit browser transcription.');
      }
    }
  };

  const startWhisperRecorder = () => {
    const stream = activeStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
          sendBlobForTranscription(blob);
        }
      };
      recorder.start(1000);
      whisperRecorderRef.current = recorder;
    } catch (e) {
      console.warn('[STT] Failed to create whisper recorder:', e);
      engineRef.current = 'webkit';
      setActiveEngine('webkit');
      startWebKit();
    }
  };

  const cycleWhisperRecorder = () => {
    if (whisperRecorderRef.current && whisperRecorderRef.current.state !== 'inactive') {
      try { whisperRecorderRef.current.stop(); } catch (e) {}
    }
    if (isCapturingRef.current && engineRef.current === 'whisper') {
      startWhisperRecorder();
    }
  };

  const startWhisper = () => {
    startWhisperRecorder();
    whisperTimerRef.current = setInterval(() => {
      cycleWhisperRecorder();
    }, 10000);
  };

  const stopWhisper = () => {
    if (whisperTimerRef.current) {
      clearInterval(whisperTimerRef.current);
      whisperTimerRef.current = null;
    }
    if (whisperRecorderRef.current && whisperRecorderRef.current.state !== 'inactive') {
      try { whisperRecorderRef.current.stop(); } catch (e) {}
    }
    whisperRecorderRef.current = null;
  };

  // -- WebKit Implementation --
  const startWebKit = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported by browser.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageRef.current;
    recognition.maxAlternatives = 1;
    
    let lastProcessedText = '';
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      const text = finalTranscript.trim();
      if (text && text !== lastProcessedText) {
        lastProcessedText = text;
        
        if (onTranscriptRef.current) {
          onTranscriptRef.current({
            id: Date.now(),
            speaker: currentSpeakerRef.current,
            text: text,
            timestamp: new Date().toLocaleTimeString(),
            confidence: event.results[event.results.length - 1][0].confidence || 0.9
          }, { engine: 'webkit' });
        }
      }
    };
    
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('Microphone access denied for transcription.');
        stopWebKit();
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[STT] WebKit error:', event.error);
      }
    };
    
    recognition.onend = () => {
      if (isCapturingRef.current && engineRef.current === 'webkit') {
        setTimeout(() => {
          if (webkitRecognitionRef.current && isCapturingRef.current && engineRef.current === 'webkit') {
             try { webkitRecognitionRef.current.start(); } catch (e) {}
          }
        }, 300);
      }
    };
    
    webkitRecognitionRef.current = recognition;
    try { recognition.start(); } catch (e) {}
  };

  const stopWebKit = () => {
    if (webkitRecognitionRef.current) {
      try { webkitRecognitionRef.current.stop(); } catch (e) {}
      webkitRecognitionRef.current = null;
    }
  };

  // -- Controls --
  const startTranscription = useCallback((stream) => {
    if (!stream) {
        console.warn("[STT] No stream provided, cannot start transcription.");
        return;
    }
    if (isCapturingRef.current) return;
    
    isCapturingRef.current = true;
    activeStreamRef.current = stream;
    setIsTranscribing(true);
    setError('');
    
    const pref = localStorage.getItem('huddle_stt_preference') || 'whisper';
    engineRef.current = pref;
    setActiveEngine(pref);
    
    if (pref === 'whisper') {
      startWhisper();
    } else {
      startWebKit();
    }
  }, []);
  
  const stopTranscription = useCallback(() => {
    isCapturingRef.current = false;
    setIsTranscribing(false);
    
    if (engineRef.current === 'whisper') {
      stopWhisper();
    } else {
      stopWebKit();
    }
  }, []);

  return {
    startTranscription,
    stopTranscription,
    isTranscribing,
    error,
    activeEngine
  };
};
