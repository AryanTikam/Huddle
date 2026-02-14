import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Monitor, Mic, MicOff, Square, Clock, Globe, Folder, Plus,
  Play, Pause, Radio, Volume2, VolumeX, ArrowLeft, AlertCircle,
  CheckCircle, Settings
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CaptureAudio = ({ onMeetingCreated, onNavigate }) => {
  // Recording states
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [captureSource, setCaptureSource] = useState('system'); // 'system' | 'tab' | 'mic+system'
  
  // Meeting metadata
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [selectedFolder, setSelectedFolder] = useState('recent');
  const [folders, setFolders] = useState([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  
  // Transcription states
  const [meetingId, setMeetingId] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | requesting | capturing | stopping
  
  // Audio recording for sending to backend
  const [audioChunks, setAudioChunks] = useState([]);
  
  // Refs
  const systemStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const combinedStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isCapturingRef = useRef(false);
  const meetingIdRef = useRef(null);
  const transcriptionRecorderRef = useRef(null);
  const transcriptionChunksRef = useRef([]);
  const transcriptionTimerRef = useRef(null);
  const isTranscribingRef = useRef(false);
  const activeStreamRef = useRef(null);
  
  const { makeAuthenticatedRequest } = useAuth();

  const isExtension = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Spanish' },
    { code: 'fr-FR', name: 'French' },
    { code: 'de-DE', name: 'German' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'ja-JP', name: 'Japanese' },
    { code: 'ko-KR', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese (Mandarin)' },
    { code: 'hi-IN', name: 'Hindi' },
    { code: 'ar-SA', name: 'Arabic' }
  ];

  useEffect(() => {
    fetchFolders();
    return () => cleanup();
  }, []);

  useEffect(() => {
    let interval;
    if (isCapturing && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCapturing, isPaused]);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current);
      transcriptionTimerRef.current = null;
    }
    if (transcriptionRecorderRef.current && transcriptionRecorderRef.current.state !== 'inactive') {
      try { transcriptionRecorderRef.current.stop(); } catch (e) {}
      transcriptionRecorderRef.current = null;
    }
    transcriptionChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => track.stop());
      systemStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach(track => track.stop());
      combinedStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0 
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchFolders = async () => {
    try {
      const response = await makeAuthenticatedRequest('/meetings/folders');
      if (response.ok) {
        const data = await response.json();
        setFolders(data);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const response = await makeAuthenticatedRequest('/meetings/folders', {
        method: 'POST',
        body: JSON.stringify({ name: newFolderName, color: newFolderColor })
      });
      if (response.ok) {
        const newFolder = await response.json();
        setFolders([...folders, newFolder]);
        setNewFolderName('');
        setNewFolderColor('#3B82F6');
        setShowCreateFolder(false);
        setSelectedFolder(newFolder.id);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  // ============================================
  // CORE: Capture system/tab audio
  // ============================================
  const captureSystemAudio = async () => {
    try {
      // getDisplayMedia with audio captures system/tab audio
      // The user will see a Chrome dialog to select which tab/screen to share
      // IMPORTANT: They must check "Share audio" / "Share tab audio" checkbox
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // We need video in the constraint but we'll discard it
          // Some browsers require video for getDisplayMedia
          width: 1,
          height: 1,
          frameRate: 1
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        },
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include'
      });

      // Check if audio track is actually present
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        // User didn't check "Share audio" or selected a source without audio
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error(
          'No audio captured. When selecting a screen/tab, make sure to check "Share audio" or "Share tab audio" at the bottom of the dialog.'
        );
      }

      // Stop the video tracks - we only need audio
      displayStream.getVideoTracks().forEach(track => track.stop());

      // Create an audio-only stream from the display capture
      const audioOnlyStream = new MediaStream(audioTracks);
      
      console.log('[CAPTURE] System audio captured:', audioTracks.length, 'audio tracks');
      console.log('[CAPTURE] Audio track settings:', audioTracks[0].getSettings());
      
      return audioOnlyStream;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Screen sharing was cancelled. Please try again and select a screen/tab with audio.');
      }
      throw err;
    }
  };

  const captureMicAudio = async () => {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      }
    });
    return micStream;
  };

  const combineStreams = (systemStream, micStream) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const destination = audioContext.createMediaStreamDestination();

    if (systemStream) {
      const systemSource = audioContext.createMediaStreamSource(systemStream);
      // Apply slight gain to system audio
      const systemGain = audioContext.createGain();
      systemGain.gain.value = 1.0;
      systemSource.connect(systemGain);
      systemGain.connect(destination);
    }

    if (micStream) {
      const micSource = audioContext.createMediaStreamSource(micStream);
      const micGain = audioContext.createGain();
      micGain.gain.value = 0.8; // Slightly lower mic to balance
      micSource.connect(micGain);
      micGain.connect(destination);
    }

    audioContextRef.current = audioContext;
    return destination.stream;
  };

  const setupAudioVisualization = (stream) => {
    try {
      const ctx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContextRef.current) audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateLevel = () => {
        if (!analyserRef.current || !isCapturingRef.current) return;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, val) => sum + val, 0) / bufferLength;
        setAudioLevel(Math.min(100, (average / 128) * 100));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error('Audio visualization setup error:', err);
    }
  };

  // ============================================
  // SERVER-SIDE TRANSCRIPTION (replaces Web Speech API)
  // Uses a dedicated MediaRecorder that restarts every cycle
  // so each audio blob is a complete, valid WebM file with headers.
  // ============================================

  const sendBlobForTranscription = async (blob) => {
    if (!meetingIdRef.current || !isCapturingRef.current) {
      console.log('[TRANSCRIPTION] Skipped: capturing=', isCapturingRef.current, 'meetingId=', meetingIdRef.current);
      return;
    }
    if (blob.size < 1000) {
      console.log('[TRANSCRIPTION] Skipped tiny blob:', blob.size, 'bytes');
      return;
    }

    console.log('[TRANSCRIPTION] Sending', (blob.size / 1024).toFixed(1), 'KB audio to server...');
    isTranscribingRef.current = true;
    try {
      // Convert blob to base64
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
          language: selectedLanguage,
          meeting_id: meetingIdRef.current,
          speaker: currentSpeaker
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[TRANSCRIPTION] Server response:', data);
        if (data.text && data.text.trim()) {
          const entry = {
            id: Date.now(),
            speaker: currentSpeaker,
            text: data.text.trim(),
            timestamp: new Date().toLocaleTimeString(),
            confidence: 0.85
          };
          setLiveTranscript(prev => [...prev, entry]);
        }
      }
    } catch (err) {
      console.error('[TRANSCRIPTION] Error sending audio:', err);
    } finally {
      isTranscribingRef.current = false;
    }
  };

  // Create a fresh MediaRecorder that collects audio for one cycle
  const startTranscriptionRecorder = () => {
    const stream = activeStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        // Combine chunks into one complete WebM blob and send
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
          sendBlobForTranscription(blob);
        }
      };

      recorder.start(1000); // Collect data every second
      transcriptionRecorderRef.current = recorder;
    } catch (e) {
      console.warn('[TRANSCRIPTION] Failed to create recorder:', e);
    }
  };

  const cycleTranscriptionRecorder = () => {
    // Stop current recorder (triggers onstop → sends audio)
    if (transcriptionRecorderRef.current && transcriptionRecorderRef.current.state !== 'inactive') {
      try { transcriptionRecorderRef.current.stop(); } catch (e) {}
    }
    // Start a fresh recorder for the next cycle
    if (isCapturingRef.current) {
      startTranscriptionRecorder();
    }
  };

  const startServerTranscription = () => {
    isTranscribingRef.current = false;

    // Start the first transcription recorder
    startTranscriptionRecorder();

    // Every 10 seconds, stop the current recorder and start a new one
    transcriptionTimerRef.current = setInterval(() => {
      cycleTranscriptionRecorder();
    }, 10000);

    console.log('[TRANSCRIPTION] Server-side transcription started (10s cycles)');
  };

  const stopServerTranscription = async () => {
    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current);
      transcriptionTimerRef.current = null;
    }

    // Stop the transcription recorder to flush remaining audio
    if (transcriptionRecorderRef.current && transcriptionRecorderRef.current.state !== 'inactive') {
      try { transcriptionRecorderRef.current.stop(); } catch (e) {}
    }
    transcriptionRecorderRef.current = null;

    console.log('[TRANSCRIPTION] Server-side transcription stopped');
  };

  // ============================================
  // START CAPTURE
  // ============================================
  const startCapture = async () => {
    try {
      setError('');
      setStatus('requesting');

      let activeStream = null;

      if (captureSource === 'system' || captureSource === 'mic+system') {
        // Capture system audio via getDisplayMedia
        const sysStream = await captureSystemAudio();
        systemStreamRef.current = sysStream;

        if (captureSource === 'mic+system') {
          // Also capture mic
          const micStream = await captureMicAudio();
          micStreamRef.current = micStream;
          activeStream = combineStreams(sysStream, micStream);
          combinedStreamRef.current = activeStream;
        } else {
          activeStream = sysStream;
        }
      } else if (captureSource === 'tab') {
        // For tab capture, also use getDisplayMedia but encourage tab selection
        const sysStream = await captureSystemAudio();
        systemStreamRef.current = sysStream;
        activeStream = sysStream;
      }

      if (!activeStream || activeStream.getAudioTracks().length === 0) {
        throw new Error('No audio stream available. Please ensure you selected a source with audio.');
      }

      // Listen for the stream ending (user stops sharing)
      activeStream.getAudioTracks().forEach(track => {
        track.onended = () => {
          console.log('[CAPTURE] Audio track ended');
          if (isCapturingRef.current) {
            stopCapture();
          }
        };
      });

      // Setup audio visualization
      setupAudioVisualization(activeStream);

      // Start meeting in backend
      const response = await makeAuthenticatedRequest('/recording/start', {
        method: 'POST',
        body: JSON.stringify({
          title: meetingTitle || `Captured Meeting ${new Date().toLocaleDateString()}`,
          language: selectedLanguage
        })
      });

      if (!response.ok) throw new Error('Failed to start recording session');
      const data = await response.json();
      setMeetingId(data.meeting_id);
      meetingIdRef.current = data.meeting_id;

      // Save the active stream so the transcription recorder can clone it
      activeStreamRef.current = activeStream;

      // Setup MediaRecorder for full recording save
      try {
        const recorder = new MediaRecorder(activeStream, { 
          mimeType: 'audio/webm;codecs=opus' 
        });
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => setAudioChunks(chunks);
        recorder.start(1000); // Collect data every second
        mediaRecorderRef.current = recorder;
      } catch (e) {
        console.warn('MediaRecorder not available, skipping audio recording:', e);
      }

      // Start server-side transcription (separate recorder, 10s cycles)
      setIsCapturing(true);
      isCapturingRef.current = true;
      startServerTranscription();

      setIsPaused(false);
      setRecordingTime(0);
      setLiveTranscript([]);
      setStatus('capturing');
      
      console.log('[CAPTURE] Audio capture started successfully');

    } catch (err) {
      console.error('[CAPTURE] Error:', err);
      setError(err.message || 'Failed to capture audio. Please try again.');
      setStatus('idle');
      cleanup();
    }
  };

  // ============================================
  // PAUSE / RESUME
  // ============================================
  const togglePause = () => {
    if (isPaused) {
      // Resume
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
      }
      // Resume server transcription
      startServerTranscription();
      setIsPaused(false);
    } else {
      // Pause
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
      }
      // Pause server transcription
      stopServerTranscription();
      setIsPaused(true);
    }
  };

  // ============================================
  // STOP CAPTURE
  // ============================================
  const stopCapture = async () => {
    try {
      setStatus('stopping');

      // Stop server transcription (sends any remaining buffered audio)
      await stopServerTranscription();

      // Stop media recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // Stop all streams
      cleanup();

      // Save transcript and finalize meeting
      if (meetingId) {
        const fullTranscript = liveTranscript
          .map(entry => `${entry.speaker} (${entry.timestamp}): ${entry.text}`)
          .join('\n\n');

        // Save transcript
        await makeAuthenticatedRequest(`/transcription/${meetingId}`, {
          method: 'POST',
          body: JSON.stringify({
            transcript: fullTranscript,
            speakers: { [currentSpeaker]: liveTranscript.length },
            language: selectedLanguage,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });

        // Update meeting
        await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: meetingTitle || `Captured Meeting ${new Date().toLocaleDateString()}`,
            description: meetingDescription,
            folder_id: selectedFolder,
            status: 'completed'
          })
        });

        // Stop recording
        await makeAuthenticatedRequest(`/recording/stop/${meetingId}`, {
          method: 'POST'
        });

        console.log('[CAPTURE] Recording saved successfully');
        onMeetingCreated(meetingId);
      }

      // Reset state
      setIsCapturing(false);
      isCapturingRef.current = false;
      setIsPaused(false);
      setRecordingTime(0);
      setAudioLevel(0);
      setMeetingId(null);
      meetingIdRef.current = null;
      setStatus('idle');

    } catch (err) {
      console.error('[CAPTURE] Error stopping:', err);
      setError('Failed to save recording. Please try again.');
      setStatus('idle');
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => onNavigate('dashboard')}
          className="mr-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Capture External Audio
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Record audio from Zoom, Teams, Meet, or any other app running on your device
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <button 
              onClick={() => setError('')}
              className="text-red-500 text-xs mt-1 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Setup Section */}
      {!isCapturing && (
        <>
          {/* How it works info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center">
              <Monitor className="w-4 h-4 mr-2" />
              How it works
            </h3>
            <ol className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
              <li>Enter meeting details below and click <strong>"Start Capture"</strong></li>
              <li>A Chrome dialog will appear — select the <strong>tab or screen</strong> with your meeting</li>
              <li><strong>Important:</strong> Check the <strong>"Share audio"</strong> checkbox at the bottom of the dialog</li>
              <li>Audio will be captured and transcribed in real-time</li>
            </ol>
          </div>

          {/* Meeting Setup Form */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Meeting Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="e.g., Zoom Standup Meeting"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={meetingDescription}
                  onChange={(e) => setMeetingDescription(e.target.value)}
                  placeholder="Add notes about this meeting..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Audio Source Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Volume2 className="inline w-4 h-4 mr-1" />
                  Audio Source
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'system', label: 'System Audio Only', desc: 'Captures app audio (Zoom, Teams, etc.)' },
                    { id: 'mic+system', label: 'System + Microphone', desc: 'Captures both app audio and your mic' },
                    { id: 'tab', label: 'Browser Tab', desc: 'Captures audio from a browser tab' }
                  ].map(source => (
                    <button
                      key={source.id}
                      onClick={() => setCaptureSource(source.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        captureSource === source.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className={`text-sm font-medium ${
                        captureSource === source.id 
                          ? 'text-blue-700 dark:text-blue-300' 
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {source.label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {source.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Globe className="inline w-4 h-4 mr-1" />
                    Language
                  </label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {languages.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Folder className="inline w-4 h-4 mr-1" />
                    Save to Folder
                  </label>
                  <div className="flex space-x-2">
                    <select
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowCreateFolder(true)}
                      className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                      title="Create new folder"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Create New Folder
            </h3>
            <div className="space-y-4">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex space-x-2">
                {colorOptions.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewFolderColor(color)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      newFolderColor === color ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button onClick={createFolder} disabled={!newFolderName.trim()} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg">
                Create
              </button>
              <button onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }} className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 sm:p-8">
        <div className="text-center">
          {/* Audio Level Visualization */}
          <div className="mb-6">
            <div className="w-28 h-28 sm:w-32 sm:h-32 mx-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center relative overflow-hidden">
              <div 
                className="absolute inset-0 bg-white/20 transition-all duration-150 rounded-full"
                style={{ 
                  transform: `scale(${1 + audioLevel / 200})`,
                  opacity: audioLevel / 100 
                }}
              />
              {isCapturing ? (
                <Radio className="w-10 h-10 sm:w-12 sm:h-12 text-white z-10 animate-pulse" />
              ) : (
                <Monitor className="w-10 h-10 sm:w-12 sm:h-12 text-white z-10" />
              )}
            </div>
            {isCapturing && (
              <div className="mt-3 flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-red-500">
                  {isPaused ? 'Paused' : 'Capturing Audio'}
                </span>
              </div>
            )}
          </div>

          {/* Timer */}
          {isCapturing && (
            <div className="mb-6">
              <div className="flex items-center justify-center space-x-2 text-2xl font-mono text-gray-900 dark:text-white">
                <Clock className="w-6 h-6" />
                <span>{formatTime(recordingTime)}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Source: {captureSource === 'system' ? 'System Audio' : captureSource === 'mic+system' ? 'System + Mic' : 'Browser Tab'}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-center space-x-3 flex-wrap gap-y-2">
            {!isCapturing ? (
              <button
                onClick={startCapture}
                disabled={!meetingTitle.trim() || status === 'requesting'}
                className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold transition-colors"
              >
                {status === 'requesting' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Requesting Access...</span>
                  </>
                ) : (
                  <>
                    <Monitor className="w-5 h-5" />
                    <span>Start Capture</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={togglePause}
                  className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-3 rounded-xl font-semibold transition-colors"
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  onClick={stopCapture}
                  disabled={status === 'stopping'}
                  className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-5 py-3 rounded-xl font-semibold transition-colors"
                >
                  <Square className="w-5 h-5" />
                  <span>{status === 'stopping' ? 'Saving...' : 'Stop & Save'}</span>
                </button>
              </>
            )}
          </div>

          {/* Status text */}
          {!isCapturing && status === 'idle' && (
            <p className="text-gray-500 dark:text-gray-400 mt-4 text-sm">
              {meetingTitle.trim() 
                ? 'Ready to capture audio — click Start Capture above'
                : 'Enter a meeting title to begin'
              }
            </p>
          )}
        </div>
      </div>

      {/* Live Transcript */}
      {isCapturing && liveTranscript.length > 0 && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Live Transcript
            </h3>
            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
              {liveTranscript.length} segments
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {liveTranscript.map((entry) => (
              <div key={entry.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-medium">{entry.speaker}</span>
                  <span>{entry.timestamp}</span>
                </div>
                <p className="text-gray-900 dark:text-white text-sm">{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tip for no transcript */}
      {isCapturing && liveTranscript.length === 0 && recordingTime > 5 && (
        <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            <strong>Tip:</strong> If no transcript is appearing, make sure the meeting audio is playing and 
            your browser has microphone permission. The transcription uses your browser's speech recognition 
            which listens through the default audio input.
          </p>
        </div>
      )}
    </div>
  );
};

export default CaptureAudio;
