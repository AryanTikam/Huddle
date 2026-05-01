import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoOff, Mic, MicOff, Users, Clock, User, ArrowLeft, Loader, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const JoinMeeting = ({ roomId, onJoin, onBack }) => {
  const [roomInfo, setRoomInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const [cameraError, setCameraError] = useState('');

  const videoPreviewRef = useRef(null);
  const { makeAuthenticatedRequest, user, API_BASE } = useAuth();

  // Fetch room info
  useEffect(() => {
    const fetchRoomInfo = async () => {
      try {
        const response = await fetch(`${API_BASE}/webrtc/room/${roomId}/info`);
        if (response.ok) {
          const data = await response.json();
          setRoomInfo(data);
        } else {
          setError('Room not found');
        }
      } catch (err) {
        setError('Unable to connect to room');
      } finally {
        setLoading(false);
      }
    };
    fetchRoomInfo();
    if (user?.name) setDisplayName(user.name);
  }, [roomId, user, API_BASE]);

  // Live camera preview
  useEffect(() => {
    let stream = null;
    const startPreview = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true
        });
        
        // Initial state sync
        if (!videoEnabled) stream.getVideoTracks().forEach(t => t.enabled = false);
        if (!audioEnabled) stream.getAudioTracks().forEach(t => t.enabled = false);

        setLocalStream(stream);
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
        setCameraError('');
      } catch (err) {
        setCameraError('Camera/microphone unavailable');
        // Try audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (!audioEnabled) stream.getAudioTracks().forEach(t => t.enabled = false);
          
          setLocalStream(stream);
          setVideoEnabled(false);
        } catch (e2) { /* no media */ }
      }
    };
    startPreview();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // Empty deps - intentional: runs once on mount

  // Update tracks when toggling
  useEffect(() => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = videoEnabled;
  }, [videoEnabled, localStream]);

  useEffect(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = audioEnabled;
  }, [audioEnabled, localStream]);

  const handleJoin = async () => {
    if (!displayName.trim()) { setError('Please enter your name'); return; }
    setJoining(true); setError('');

    try {
      // Stop preview stream before joining (WebRTCMeeting will create its own)
      if (localStream) localStream.getTracks().forEach(t => t.stop());

      const response = await makeAuthenticatedRequest(`/webrtc/join/${roomId}`, {
        method: 'POST',
        body: JSON.stringify({ display_name: displayName.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        // Pass settings to meeting component
        const meetingWithSettings = {
          ...data.meeting,
          settings: data.settings || data.meeting?.settings || {}
        };
        onJoin(meetingWithSettings, data.is_host);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to join meeting');
      }
    } catch (err) {
      setError('Failed to join meeting');
    } finally {
      setJoining(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [localStream]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'waiting': return 'text-amber-400';
      case 'active': return 'text-emerald-400';
      case 'ended': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'waiting': return 'Waiting for participants';
      case 'active': return 'Meeting in progress';
      case 'ended': return 'Meeting ended';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center text-white">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-violet-400" />
          <p className="text-gray-400">Loading room information...</p>
        </div>
      </div>
    );
  }

  if (error && !roomInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Room Not Found</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={onBack}
            className="flex items-center gap-2 px-6 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl transition-colors mx-auto">
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Back button */}
        <button onClick={() => { if (localStream) localStream.getTracks().forEach(t => t.stop()); onBack(); }}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-5 sm:p-8 shadow-2xl">
          {/* Room info */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/20">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">
              {roomInfo?.title || `Room ${roomId}`}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>{roomInfo?.host_name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>{roomInfo?.participant_count} / {roomInfo?.max_participants}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span className={getStatusColor(roomInfo?.status)}>
                  {getStatusText(roomInfo?.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-3 text-emerald-400 text-xs">
              <Shield className="w-3.5 h-3.5" />
              <span>End-to-end encrypted</span>
            </div>
          </div>

          {roomInfo?.status !== 'ended' ? (
            <div className="space-y-6">
              {/* Display name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Display Name</label>
                <input
                  type="text" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-gray-800/60 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Media preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Camera Preview */}
                <div className="relative bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/30">
                  <div className="aspect-video bg-gray-900 flex items-center justify-center">
                    {videoEnabled ? (
                      <video ref={videoPreviewRef} autoPlay muted playsInline
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <VideoOff className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                        <span className="text-gray-500 text-sm">Camera Off</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-2 right-2">
                    <button onClick={() => setVideoEnabled(!videoEnabled)}
                      className={`p-2 rounded-lg transition-all ${
                        videoEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                     : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                      {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Mic Preview */}
                <div className="relative bg-gray-800/60 rounded-xl overflow-hidden border border-gray-700/30">
                  <div className="aspect-video flex items-center justify-center">
                    <div className="text-center">
                      <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${
                        audioEnabled ? 'bg-emerald-500/20 border-2 border-emerald-500/30' : 'bg-red-500/20 border-2 border-red-500/30'
                      }`}>
                        {audioEnabled ? <Mic className="w-6 h-6 text-emerald-400" /> : <MicOff className="w-6 h-6 text-red-400" />}
                      </div>
                      <span className={`text-sm ${audioEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                        {audioEnabled ? 'Mic On' : 'Mic Off'}
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2">
                    <button onClick={() => setAudioEnabled(!audioEnabled)}
                      className={`p-2 rounded-lg transition-all ${
                        audioEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                     : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                      {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Camera error */}
              {cameraError && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-amber-300 text-sm">{cameraError}</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Join button */}
              <button onClick={handleJoin} disabled={joining || !displayName.trim()}
                className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none disabled:opacity-50 shadow-lg shadow-violet-500/20 disabled:shadow-none">
                {joining ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Joining...</span>
                  </div>
                ) : 'Join Meeting'}
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Meeting Ended</h3>
              <p className="text-gray-400">This meeting has already ended.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JoinMeeting;