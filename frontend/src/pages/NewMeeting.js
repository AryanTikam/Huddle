import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Pause, Play, Square, Clock, Globe, Folder, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSTT } from '../hooks/useSTT';

const NewMeeting = ({ onMeetingCreated, onNavigate }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [selectedFolder, setSelectedFolder] = useState('recent');
  const [audioLevel, setAudioLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [meetingId, setMeetingId] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker A');
  const [error, setError] = useState('');
  const [folders, setFolders] = useState([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');

  // Audio and Stream refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  
  const { makeAuthenticatedRequest } = useAuth();

  const colorOptions = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
  ];

  // Supported languages with better accuracy
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

  const { startTranscription, stopTranscription: stopHookTranscription, error: sttError } = useSTT({
    language: selectedLanguage,
    meetingId,
    currentSpeaker,
    onTranscript: (entry, { engine }) => {
      setLiveTranscript(prev => [...prev, entry]);
      if (engine === 'webkit' && meetingId) {
        makeAuthenticatedRequest('/recording/process-text', {
          method: 'POST',
          body: JSON.stringify({
            meeting_id: meetingId,
            text: entry.text,
            speaker: entry.speaker,
            confidence: entry.confidence
          })
        }).catch(console.error);
      }
    }
  });

  useEffect(() => {
    if (sttError) {
      setError(sttError);
    }
  }, [sttError]);

  useEffect(() => {
    fetchFolders();
    
    return () => {
      // Cleanup
      stopHookTranscription();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    let interval;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0 
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const setupAudioContext = async (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        setAudioLevel(Math.min(100, (average / 128) * 100));
        
        if (isRecording) {
          requestAnimationFrame(updateAudioLevel);
        }
      };
      
      updateAudioLevel();
    } catch (error) {
      console.error('Error setting up audio context:', error);
    }
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
        body: JSON.stringify({
          name: newFolderName,
          color: newFolderColor
        })
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

  const startRecording = async () => {
    try {
      setError('');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      
      streamRef.current = stream;
      
      // Setup audio visualization
      await setupAudioContext(stream);

      
      // Start meeting in backend
      const response = await makeAuthenticatedRequest('/recording/start', {
        method: 'POST',
        body: JSON.stringify({
          title: meetingTitle || `Meeting ${new Date().toLocaleDateString()}`,
          language: selectedLanguage
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMeetingId(data.meeting_id);
        
        // Start speech recognition using hook
        // Small delay to allow meetingId effect to propagate
        setTimeout(() => {
          startTranscription(streamRef.current);
        }, 50);
        
        setIsRecording(true);
        setRecordingTime(0);
        
        console.log('Recording started successfully');
      } else {
        throw new Error('Failed to start recording session');
      }
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(error.message || 'Failed to start recording. Please check microphone permissions.');
      
      // Cleanup on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const pauseRecording = () => {
    if (!isPaused) {
      stopHookTranscription();
    } else {
      startTranscription(streamRef.current);
    }
    setIsPaused(!isPaused);
  };

  const stopRecording = async () => {
    try {
      // Stop speech recognition
      stopHookTranscription();
      
      // Stop audio stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Save final transcript and stop meeting
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
        
        // Update meeting details
        await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: meetingTitle || `Meeting ${new Date().toLocaleDateString()}`,
            description: meetingDescription,
            folder_id: selectedFolder,
            status: 'completed'
          })
        });
        
        // Stop recording session
        await makeAuthenticatedRequest(`/recording/stop/${meetingId}`, {
          method: 'POST'
        });
        
        console.log('Recording stopped and saved successfully');
        onMeetingCreated(meetingId);
      }
      
      // Reset state
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioLevel(0);
      setLiveTranscript([]);
      setMeetingId(null);
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError('Failed to save recording. Please try again.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Record Meeting
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Start recording and get real-time AI-powered transcription
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Meeting Setup */}
      {!isRecording && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Meeting Setup
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Meeting Title
              </label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Enter meeting title..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {/* Add description box here */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={meetingDescription}
                onChange={(e) => setMeetingDescription(e.target.value)}
                placeholder="Add meeting description..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
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
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
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
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Create New Folder
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Color
                </label>
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
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={createFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Create Folder
              </button>
              <button
                onClick={() => {
                  setShowCreateFolder(false);
                  setNewFolderName('');
                  setNewFolderColor('#3B82F6');
                }}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recording Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 sm:p-8">
        <div className="text-center">
          {/* Audio Level Visualization */}
          <div className="mb-6">
            <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center relative overflow-hidden">
              <div 
                className="absolute inset-0 bg-white/20 transition-all duration-150"
                style={{ 
                  transform: `scale(${1 + audioLevel / 200})`,
                  opacity: audioLevel / 100 
                }}
              />
              {isRecording ? (
                <Mic className="w-12 h-12 text-white z-10" />
              ) : (
                <MicOff className="w-12 h-12 text-white z-10" />
              )}
            </div>
          </div>

          {/* Timer */}
          {isRecording && (
            <div className="mb-6">
              <div className="flex items-center justify-center space-x-2 text-2xl font-mono text-gray-900 dark:text-white">
                <Clock className="w-6 h-6" />
                <span>{formatTime(recordingTime)}</span>
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-center space-x-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={!meetingTitle.trim()}
                className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-8 py-4 rounded-xl font-semibold transition-colors"
              >
                <Mic className="w-5 h-5" />
                <span>Start Recording</span>
              </button>
            ) : (
              <>
                <button
                  onClick={pauseRecording}
                  className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  <Square className="w-5 h-5" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>

          {/* Status */}
          <div className="mt-4">
            <p className="text-gray-600 dark:text-gray-400">
              {!isRecording && 'Ready to record'}
              {isRecording && !isPaused && 'Recording...'}
              {isRecording && isPaused && 'Paused'}
            </p>
          </div>
        </div>
      </div>

      {/* Live Transcript */}
      {isRecording && liveTranscript.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Live Transcript
          </h3>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {liveTranscript.map((entry) => (
              <div key={entry.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{entry.speaker}</span>
                  <span>{entry.timestamp}</span>
                </div>
                <p className="text-gray-900 dark:text-white">{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMeeting;