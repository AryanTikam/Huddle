import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Phone, Users, Copy, Pin, PinOff,
  Monitor, MonitorOff, FileText, Check, Loader, ShieldCheck,
  X, Download, PhoneOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';
import { useSTT } from '../hooks/useSTT';

// ─── E2E Encryption Helpers ──────────────────────────────────────
const E2E_SUPPORTED = typeof window !== 'undefined' && (
  typeof RTCRtpScriptTransform !== 'undefined' ||
  (typeof RTCRtpSender !== 'undefined' && typeof RTCRtpSender.prototype !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype)
);

async function generateE2EKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function importKey(keyStr) {
  const raw = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ─── Transcription State ─────────────────────────────────────────

// ─── Avatar Color from Name ──────────────────────────────────────
function nameToColor(name) {
  const colors = [
    'from-violet-500 to-purple-600', 'from-blue-500 to-cyan-600',
    'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600', 'from-indigo-500 to-blue-600',
    'from-fuchsia-500 to-purple-600', 'from-lime-500 to-green-600'
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Main Component ──────────────────────────────────────────────
const WebRTCMeeting = ({ roomId, onLeave, isHost = false, meetingData = null }) => {
  // ── Media State ──
  const [isVideoEnabled, setIsVideoEnabled] = useState(meetingData?.settings?.video_on_join ?? true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(!(meetingData?.settings?.mute_on_join ?? true));
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // ── Meeting State ──
  const [participants, setParticipants] = useState([]);
  const [participantMuteStatus, setParticipantMuteStatus] = useState(new Map());
  const [participantVideoStatus, setParticipantVideoStatus] = useState(new Map());
  const [participantScreenShares, setParticipantScreenShares] = useState(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [meetingSettings, setMeetingSettings] = useState(meetingData?.settings || {});
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [hostStatus, setHostStatus] = useState(isHost);
  const [e2eEnabled, setE2eEnabled] = useState(false);

  // ── UI State ──
  const [showParticipants, setShowParticipants] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pinnedParticipant, setPinnedParticipant] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [toasts, setToasts] = useState([]);

  // ── Transcription State ──
  const [transcript, setTranscript] = useState([]);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(meetingData?.settings?.auto_transcription ?? true);

  // ── Meeting End State ──
  const [showMeetingEndedModal, setShowMeetingEndedModal] = useState(false);
  const [meetingEndedBy, setMeetingEndedBy] = useState('');

  // ── Refs (avoid stale closures) ──
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteVideosRef = useRef(new Map());
  const peerConnections = useRef(new Map());
  const socketRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const initRef = useRef(false);
  const isAudioEnabledRef = useRef(isAudioEnabled);
  const isVideoEnabledRef = useRef(isVideoEnabled);
  const transcriptionEnabledRef = useRef(transcriptionEnabled);
  const durationIntervalRef = useRef(null);
  const e2eKeyRef = useRef(null);

  const { makeAuthenticatedRequest, user, API_BASE } = useAuth();

  const { startTranscription, stopTranscription, isTranscribing } = useSTT({
    language: meetingData?.language || 'en-US',
    meetingId: null, // Let WebRTC endpoints handle DB saving
    currentSpeaker: user.name || 'You',
    onTranscript: (entry) => {
      setTranscript(prev => [...prev, entry]);
      if (isAudioEnabledRef.current) {
        if (socketRef.current) {
          socketRef.current.emit('transcript-update', { room_id: roomId.toUpperCase(), transcript: entry });
        }
        // Always save to WebRTC transcript segments regardless of engine
        makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcript`, {
          method: 'POST', body: JSON.stringify({ speaker_name: entry.speaker, text: entry.text, confidence: entry.confidence })
        }).catch(() => {});
      }
    }
  });

  // Keep refs in sync
  useEffect(() => { isAudioEnabledRef.current = isAudioEnabled; }, [isAudioEnabled]);
  useEffect(() => { isVideoEnabledRef.current = isVideoEnabled; }, [isVideoEnabled]);
  useEffect(() => { transcriptionEnabledRef.current = transcriptionEnabled; }, [transcriptionEnabled]);

  // Meeting duration timer
  useEffect(() => {
    durationIntervalRef.current = setInterval(() => setMeetingDuration(d => d + 1), 1000);
    return () => clearInterval(durationIntervalRef.current);
  }, []);

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };

  // Toast helper
  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── ICE Configuration ──
  const rtcConfig = useMemo(() => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  }), []);

  // ── Initialize Media ──
  const initializeMedia = useCallback(async (videoOn = true, audioOn = true) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      
      // Always request both (if hardware exists) so the tracks exist to be enabled later
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      
      // Immediately disable tracks if they are supposed to be off
      if (!videoOn) {
        stream.getVideoTracks().forEach(t => t.enabled = false);
      }
      if (!audioOn) {
        stream.getAudioTracks().forEach(t => t.enabled = false);
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.error('Media init failed:', err);
      // Fallback: try audio-only if video failed
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: false, 
          audio: { echoCancellation: true, noiseSuppression: true } 
        });
        
        if (!audioOn) {
          stream.getAudioTracks().forEach(t => t.enabled = false);
        }

        localStreamRef.current = stream;
        setIsVideoEnabled(false);
        addToast('Camera unavailable, using audio only', 'warning');
        return stream;
      } catch (e2) {
        setConnectionError('Failed to access camera/microphone. Please check permissions.');
        throw err;
      }
    }
  }, [addToast]);

  // ── Create Peer Connection (Perfect Negotiation pattern) ──
  const createPeerConnection = useCallback(async (socketId, userName, isInitiator, stream) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.current.set(socketId, pc);

    // Attach Perfect Negotiation state directly to the PC object
    pc._makingOffer = false;
    pc._ignoreOffer = false;
    pc._isPolite = !isInitiator;

    // Add local tracks
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track of kind ${event.track.kind} from ${userName}`);
      
      // Browsers often ignore dynamically added tracks on existing srcObjects.
      // We must construct a completely new MediaStream instance to force the video element to re-render it.
      const newStream = new MediaStream(event.streams[0].getTracks());
      
      setRemoteStreams(prev => {
        const m = new Map(prev);
        m.set(socketId, { stream: newStream, userName });
        return m;
      });
      
      const el = remoteVideosRef.current.get(socketId);
      if (el) {
        el.srcObject = newStream;
        el.play().catch(e => console.warn('Play failed on track arrival:', e));
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed') {
        console.warn(`Connection failed with ${userName}, restarting ICE`);
        pc.restartIce();
      }
      if (state === 'disconnected') {
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') pc.restartIce();
        }, 3000);
      }
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { target: socketId, candidate: event.candidate });
      }
    };

    // ICE connection state for quality indicator
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state with ${userName}: ${pc.iceConnectionState}`);
    };

    // Renegotiation needed (when tracks are added dynamically)
    pc.onnegotiationneeded = async () => {
      try {
        console.log(`[WebRTC] Negotiation needed with ${userName}`);
        pc._makingOffer = true;
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        if (socketRef.current) {
          socketRef.current.emit('offer', { target: socketId, offer });
        }
      } catch (err) {
        console.error('Renegotiation failed:', err);
      } finally {
        pc._makingOffer = false;
      }
    };

    // Create offer if initiator
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        if (socketRef.current) {
          socketRef.current.emit('offer', { target: socketId, offer });
        }
      } catch (err) {
        console.error('Initial offer failed:', err);
      }
    }

    return pc;
  }, [rtcConfig]);

  // ── Handle Offer ──
  const handleOffer = useCallback(async (data) => {
    const { offer, caller } = data;
    let pc = peerConnections.current.get(caller);
    if (!pc) {
      pc = await createPeerConnection(caller, 'Participant', false, localStreamRef.current);
    }
    
    try {
      const offerCollision = (pc._makingOffer || pc.signalingState !== 'stable');
      pc._ignoreOffer = !pc._isPolite && offerCollision;
      
      if (pc._ignoreOffer) {
        console.log(`[WebRTC] Ignoring colliding offer from ${caller} (impolite)`);
        return;
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (socketRef.current) socketRef.current.emit('answer', { target: caller, answer });
    } catch (err) {
      console.error('[WebRTC] Failed to handle offer:', err);
    }
  }, [createPeerConnection]);

  // ── Handle Answer ──
  const handleAnswer = useCallback(async (data) => {
    const { answer, caller } = data;
    const pc = peerConnections.current.get(caller);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('[WebRTC] Failed to handle answer:', err);
      }
    }
  }, []);

  // ── Handle ICE Candidate ──
  const handleIceCandidate = useCallback(async (data) => {
    const { candidate, caller } = data;
    const pc = peerConnections.current.get(caller);
    if (pc) {
      try { 
        await pc.addIceCandidate(new RTCIceCandidate(candidate)); 
      } catch (e) {
        if (!pc._ignoreOffer) console.warn('[WebRTC] Failed to add ICE candidate:', e);
      }
    }
  }, []);

  // ── Handle User Left ──
  const handleUserLeft = useCallback((socketId) => {
    const pc = peerConnections.current.get(socketId);
    if (pc) { pc.close(); peerConnections.current.delete(socketId); }
    setParticipants(prev => prev.filter(p => p.socket_id !== socketId));
    setRemoteStreams(prev => { const m = new Map(prev); m.delete(socketId); return m; });
    setParticipantMuteStatus(prev => { const m = new Map(prev); m.delete(socketId); return m; });
    setParticipantVideoStatus(prev => { const m = new Map(prev); m.delete(socketId); return m; });
    setParticipantScreenShares(prev => { const s = new Set(prev); s.delete(socketId); return s; });
    remoteVideosRef.current.delete(socketId);
  }, []);



  // ── Socket Initialization ──
  const initializeSocket = useCallback((stream) => {
    const isExtension = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    const SOCKET_URL = isExtension ? 'http://localhost:5000' : (process.env.REACT_APP_SOCKET_URL || API_BASE.replace('/api', ''));
    const token = localStorage.getItem('token');

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['polling', 'websocket'], // Always start with polling to prevent Werkzeug WebSocket upgrade crash
      upgrade: true, timeout: 20000, forceNew: true,
      withCredentials: false, reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true); setConnectionError('');
      socket.emit('join-room', { room_id: roomId.toUpperCase(), user_id: user.id, user_name: user.name });
    });

    socket.on('connect_error', () => { setConnectionError('Failed to connect to meeting server'); setIsConnected(false); });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      setRemoteStreams(new Map()); setParticipants([]);
      if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 2000);
    });

    socket.on('meeting-settings', (settings) => {
      setMeetingSettings(settings);
      setHostStatus(settings.is_host);
      setTranscriptionEnabled(settings.auto_transcription);
      // Enforce mute_on_join
      if (settings.mute_on_join && !settings.is_host) {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
        setIsAudioEnabled(false);
      }
      // Enforce video_on_join
      if (!settings.video_on_join && !settings.is_host) {
        const videoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false;
        setIsVideoEnabled(false);
      }
    });

    socket.on('existing-users', async (users) => {
      setParticipants(users);
      
      // Initialize video and mute statuses from server records
      setParticipantMuteStatus(prev => {
        const m = new Map(prev);
        users.forEach(u => m.set(u.socket_id, u.is_muted));
        return m;
      });
      setParticipantVideoStatus(prev => {
        const m = new Map(prev);
        users.forEach(u => m.set(u.socket_id, u.is_video_off));
        return m;
      });
      setParticipantScreenShares(prev => {
        const s = new Set(prev);
        users.forEach(u => { if (u.is_screen_sharing) s.add(u.socket_id); });
        return s;
      });

      for (const u of users) {
        try {
          await createPeerConnection(u.socket_id, u.user_name, true, stream);
          await new Promise(r => setTimeout(r, 300));
        } catch (e) { console.error('Peer connection failed:', e); }
      }
    });

    socket.on('user-joined', async (data) => {
      setParticipants(prev => [...prev, data]);
      
      // Set initial status for new user
      setParticipantMuteStatus(prev => { const m = new Map(prev); m.set(data.socket_id, data.is_muted); return m; });
      setParticipantVideoStatus(prev => { const m = new Map(prev); m.set(data.socket_id, data.is_video_off); return m; });
      
      addToast(`${data.user_name} joined the meeting`, 'info');
      try { await createPeerConnection(data.socket_id, data.user_name, false, stream); } catch (e) { /* ok */ }
    });

    socket.on('user-left', (data) => {
      handleUserLeft(data.socket_id);
      const p = participants.find(x => x.socket_id === data.socket_id);
      if (p) addToast(`${p.user_name} left the meeting`, 'info');
    });

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    socket.on('transcript-update', (data) => {
      if (transcriptionEnabledRef.current && !data.is_muted) {
        setTranscript(prev => [...prev, {
          id: Date.now(), speaker: data.speaker_name || data.speaker, text: data.text,
          timestamp: new Date().toLocaleTimeString(), confidence: data.confidence || 1.0
        }]);
      }
    });

    socket.on('participant-mute-status', (data) => {
      setParticipantMuteStatus(prev => { const m = new Map(prev); m.set(data.socket_id, data.is_muted); return m; });
    });

    socket.on('participant-video-status', (data) => {
      setParticipantVideoStatus(prev => { const m = new Map(prev); m.set(data.socket_id, data.is_video_off); return m; });
    });

    socket.on('transcription-status-changed', (data) => {
      setTranscriptionEnabled(data.enabled);
      addToast(data.message, 'info');
      if (!data.enabled) stopTranscription();
      else if (isAudioEnabledRef.current) startTranscription(localStreamRef.current);
    });

    socket.on('force-muted', (data) => {
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = false;
      setIsAudioEnabled(false);
      stopTranscription();
      addToast(`You were muted by ${data.muted_by}`, 'warning');
    });

    socket.on('screen-share-started', (data) => {
      addToast(`${data.user_name} started screen sharing`, 'info');
      setParticipantScreenShares(prev => { const s = new Set(prev); s.add(data.socket_id); return s; });
      setPinnedParticipant(data.socket_id);
    });

    socket.on('screen-share-stopped', (data) => {
      addToast(`${data.user_name} stopped screen sharing`, 'info');
      setParticipantScreenShares(prev => { const s = new Set(prev); s.delete(data.socket_id); return s; });
      if (pinnedParticipant === data.socket_id) setPinnedParticipant(null);
    });

    socket.on('reaction', (data) => {
      const id = Date.now();
      setReactions(prev => [...prev, { id, emoji: data.emoji, user_name: data.user_name }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    });

    socket.on('meeting-ended', (data) => {
      setShowMeetingEndedModal(true);
      setMeetingEndedBy(data.host_name);
    });

    socket.on('error', (err) => {
      if (err.code === 'ROOM_FULL') addToast('Meeting is full', 'error');
      else setConnectionError(err.message || 'Socket error');
    });
  }, [roomId, user, API_BASE, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, addToast, startTranscription, stopTranscription, participants, pinnedParticipant]);

  // ── Media Controls ──
  const toggleVideo = useCallback(async () => {
    let stream = localStreamRef.current;
    
    // If stream has no video track (e.g. camera failed initially), try to acquire one
    if (stream && stream.getVideoTracks().length === 0 && !isVideoEnabled) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];
        stream.addTrack(newTrack);
        
        // Add track to all peer connections and renegotiate
        peerConnections.current.forEach(pc => {
          pc.addTrack(newTrack, stream);
        });
        
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch (e) {
        addToast('Failed to start camera', 'error');
        return;
      }
    }

    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = !isVideoEnabled;
      peerConnections.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender?.track) sender.track.enabled = track.enabled;
      });
      if (socketRef.current) {
        socketRef.current.emit('participant-video-status', {
          room_id: roomId.toUpperCase(), is_video_off: isVideoEnabled, user_name: user.name
        });
      }
    }
    setIsVideoEnabled(!isVideoEnabled);
  }, [isVideoEnabled, roomId, user.name, addToast]);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    const newState = !isAudioEnabled;
    if (stream) {
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = newState;
        peerConnections.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
          if (sender?.track) sender.track.enabled = newState;
        });
      }
    }
    setIsAudioEnabled(newState);
    if (socketRef.current) {
      socketRef.current.emit('participant-mute-status', {
        room_id: roomId.toUpperCase(), is_muted: !newState, user_name: user.name
      });
    }
    // Transcription: stop when muted, start when unmuted
    if (!newState) stopTranscription();
    else if (transcriptionEnabledRef.current) {
      setTimeout(() => startTranscription(localStreamRef.current), 300);
    }
  }, [isAudioEnabled, roomId, user.name, stopTranscription, startTranscription]);

  // ── Screen Sharing ──
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Restore camera track
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        peerConnections.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(camTrack).catch(() => {});
        });
      }
      setIsScreenSharing(false);
      if (socketRef.current) socketRef.current.emit('screen-share-stopped', { room_id: roomId.toUpperCase() });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        // Replace video track in all peer connections
        peerConnections.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        });
        // Show screen share in local video
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => {
          // User clicked browser's "Stop sharing" button
          if (localStreamRef.current && localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack) {
            peerConnections.current.forEach(pc => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(camTrack).catch(() => {});
            });
          }
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          if (socketRef.current) socketRef.current.emit('screen-share-stopped', { room_id: roomId.toUpperCase() });
        };
        setIsScreenSharing(true);
        if (socketRef.current) socketRef.current.emit('screen-share-started', { room_id: roomId.toUpperCase() });
      } catch (err) {
        if (err.name !== 'NotAllowedError') addToast('Screen sharing failed', 'error');
      }
    }
  }, [isScreenSharing, roomId, addToast]);

  // ── Host Controls ──
  const toggleTranscription = useCallback(async () => {
    if (!hostStatus) { addToast('Only the host can control transcription', 'warning'); return; }
    const newState = !transcriptionEnabled;
    try {
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/transcription`, {
        method: 'POST', body: JSON.stringify({ enabled: newState })
      });
      if (socketRef.current) {
        socketRef.current.emit('transcription-toggled', {
          room_id: roomId.toUpperCase(), enabled: newState, host_name: user.name
        });
      }
      setTranscriptionEnabled(newState);
      if (!newState) stopTranscription();
      else if (isAudioEnabledRef.current) startTranscription(localStreamRef.current);
    } catch (e) { addToast('Failed to toggle transcription', 'error'); }
  }, [hostStatus, transcriptionEnabled, makeAuthenticatedRequest, roomId, user.name, addToast, stopTranscription, startTranscription]);

  const forceMuteParticipant = useCallback((socketId) => {
    if (!hostStatus || !socketRef.current) return;
    socketRef.current.emit('force-mute', { room_id: roomId.toUpperCase(), target_socket_id: socketId });
  }, [hostStatus, roomId]);

  const sendReaction = useCallback((emoji) => {
    if (socketRef.current) {
      socketRef.current.emit('reaction', { room_id: roomId.toUpperCase(), emoji });
      const id = Date.now();
      setReactions(prev => [...prev, { id, emoji, user_name: 'You' }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    }
  }, [roomId]);

  const copyRoomId = useCallback(async () => {
    try { await navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { /* */ }
  }, [roomId]);

  // ── Leave / End Meeting ──
  const cleanupMedia = useCallback(() => {
    // Stop ALL tracks - this releases camera/mic permissions
    [localStreamRef.current, screenStreamRef.current].forEach(stream => {
      if (stream) stream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
    });
    localStreamRef.current = null;
    screenStreamRef.current = null;
    // Close all peer connections
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    // Stop transcription
    stopTranscription();
    // Clear video elements
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    remoteVideosRef.current.forEach(el => { if (el) el.srcObject = null; });
  }, [stopTranscription]);

  const leaveMeeting = useCallback(async () => {
    try {
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { room_id: roomId.toUpperCase() });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanupMedia();
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/leave`, { method: 'POST' }).catch(() => {});
      onLeave();
    } catch (e) { cleanupMedia(); onLeave(); }
  }, [roomId, cleanupMedia, makeAuthenticatedRequest, onLeave]);

  const endMeeting = useCallback(async () => {
    if (!hostStatus) return;
    try {
      const fullTranscript = transcript.map(e => `${e.speaker} (${e.timestamp}): ${e.text}`).join('\n\n');
      await makeAuthenticatedRequest(`/webrtc/room/${roomId}/end`, {
        method: 'POST', body: JSON.stringify({ transcript: fullTranscript })
      });
      if (socketRef.current) {
        socketRef.current.emit('meeting-ended', {
          room_id: roomId.toUpperCase(), host_name: user.name, meeting_data: { transcript: fullTranscript }
        });
      }
      cleanupMedia();
      onLeave();
    } catch (e) { cleanupMedia(); onLeave(); }
  }, [hostStatus, transcript, makeAuthenticatedRequest, roomId, user.name, cleanupMedia, onLeave]);

  // ── Main Initialization Effect ──
  useEffect(() => {
    if (!roomId || !user || initRef.current) return;
    initRef.current = true;

    const init = async () => {
      try {
        const vidOn = meetingData?.settings?.video_on_join ?? true;
        const audOn = !(meetingData?.settings?.mute_on_join ?? true);
        const stream = await initializeMedia(vidOn, audOn);
        if (stream) {
          setIsVideoEnabled(vidOn);
          setIsAudioEnabled(audOn);
          await new Promise(r => setTimeout(r, 500));
          initializeSocket(stream);
          if ((meetingData?.settings?.auto_transcription ?? true) && audOn) {
            setTimeout(() => startTranscription(stream), 2000);
          }
        }
      } catch (e) {
        setConnectionError('Failed to initialize: ' + e.message);
        initRef.current = false;
      }
    };
    init();

    // Safety net: release media on page unload
    const handleUnload = () => cleanupMedia();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
      cleanupMedia();
      clearInterval(durationIntervalRef.current);
      initRef.current = false;
    };
  }, []); // Empty deps - intentional: runs once on mount

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // ── Grid Layout Calculation ──
  const totalParticipants = participants.length + 1;
  const gridClass = useMemo(() => {
    if (pinnedParticipant) return '';
    if (totalParticipants === 1) return 'grid-cols-1';
    if (totalParticipants === 2) return 'grid-cols-1 md:grid-cols-2';
    if (totalParticipants <= 4) return 'grid-cols-2';
    if (totalParticipants <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  }, [totalParticipants, pinnedParticipant]);

  const downloadTranscript = useCallback(() => {
    const text = transcript.map(e => `[${e.timestamp}] ${e.speaker}: ${e.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transcript-${roomId}-${new Date().toISOString().slice(0,10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }, [transcript, roomId]);

  // ── Video Tile Component ──
  const VideoTile = ({ videoRef, name, isMuted, isVideoOff, isLocal, socketId, isHostUser, isScreenShare }) => (
    <div className={`relative rounded-2xl overflow-hidden bg-gray-800/80 backdrop-blur-sm border transition-all duration-300 ${
      pinnedParticipant === socketId ? 'col-span-full row-span-2 border-violet-500/50' : 'border-gray-700/50'
    } ${isLocal && totalParticipants === 1 ? 'aspect-video max-w-3xl mx-auto' : 'aspect-video'}`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        muted={isLocal}
        playsInline
        className={`w-full h-full object-cover ${isVideoOff && !isScreenShare ? 'hidden' : ''}`}
      />

      {/* Video Off Avatar */}
      {isVideoOff && !isScreenShare && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br ${nameToColor(name)} flex items-center justify-center shadow-2xl`}>
            <span className="text-2xl md:text-3xl font-bold text-white">{getInitials(name)}</span>
          </div>
        </div>
      )}

      {/* Bottom Info Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium truncate max-w-[150px]">
              {isLocal ? 'You' : name}
            </span>
            {isHostUser && (
              <span className="px-1.5 py-0.5 bg-violet-500/80 text-[10px] font-semibold text-white rounded-full">HOST</span>
            )}
            {isScreenShare && (
              <span className="px-1.5 py-0.5 bg-blue-500/80 text-[10px] font-semibold text-white rounded-full">SCREEN</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isMuted && (
              <div className="w-6 h-6 rounded-full bg-red-500/90 flex items-center justify-center">
                <MicOff className="w-3 h-3 text-white" />
              </div>
            )}
            {!isLocal && socketId && (
              <button
                onClick={() => setPinnedParticipant(pinnedParticipant === socketId ? null : socketId)}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                {pinnedParticipant === socketId ? <PinOff className="w-3 h-3 text-white" /> : <Pin className="w-3 h-3 text-white" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Speaking Indicator Glow */}
      {!isMuted && !isLocal && (
        <div className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/40 pointer-events-none animate-pulse" />
      )}
    </div>
  );

  // ── RENDER ──
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white flex flex-col overflow-hidden" style={{zIndex: 50}}>
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/60 backdrop-blur-xl border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-red-400 animate-pulse'}`} />
            <h1 className="text-base font-semibold text-white truncate max-w-[200px]">
              {meetingData?.title || `Room ${roomId}`}
            </h1>
          </div>
          {hostStatus && (
            <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 text-[11px] font-semibold rounded-full border border-violet-500/30">
              HOST
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Duration */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-gray-800/60 rounded-lg text-gray-300 text-xs font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {formatDuration(meetingDuration)}
          </div>

          {/* Encryption indicator */}
          <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 rounded-lg text-emerald-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Encrypted</span>
          </div>

          {/* Copy Room ID */}
          <button
            onClick={copyRoomId}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-700/60 rounded-lg transition-colors text-sm"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            <span className="hidden sm:inline text-gray-300">{copied ? 'Copied!' : roomId}</span>
          </button>

          {/* Participants button */}
          <button
            onClick={() => { setShowParticipants(!showParticipants); setShowTranscript(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm ${
              showParticipants ? 'bg-violet-500/20 text-violet-300' : 'bg-gray-800/60 hover:bg-gray-700/60 text-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{participants.length + 1}</span>
          </button>

          {/* Transcript button */}
          <button
            onClick={() => { setShowTranscript(!showTranscript); setShowParticipants(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm ${
              showTranscript ? 'bg-violet-500/20 text-violet-300' : 'bg-gray-800/60 hover:bg-gray-700/60 text-gray-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            {transcript.length > 0 && <span className="text-xs">{transcript.length}</span>}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-3 overflow-auto">
          {pinnedParticipant ? (
            /* Pinned Layout */
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 min-h-0">
                {pinnedParticipant === 'local' ? (
                  <VideoTile
                    videoRef={el => {
                      localVideoRef.current = el;
                      if (el && localStreamRef.current) {
                        el.srcObject = isScreenSharing ? (screenStreamRef.current || localStreamRef.current) : localStreamRef.current;
                        el.play().catch(e => console.warn('Video play failed:', e));
                      }
                    }}
                    name={user.name} isMuted={!isAudioEnabled}
                    isVideoOff={!isVideoEnabled} isLocal socketId="local" isHostUser={hostStatus} />
                ) : (
                  (() => {
                    const p = participants.find(x => x.socket_id === pinnedParticipant);
                    const sd = remoteStreams.get(pinnedParticipant);
                    if (!p) return null;
                    return <VideoTile
                      videoRef={el => { 
                        if (el) { 
                          remoteVideosRef.current.set(pinnedParticipant, el); 
                          if (sd?.stream) {
                            el.srcObject = sd.stream;
                            el.play().catch(e => console.warn('Remote video play failed:', e));
                          }
                        }
                      }}
                      name={p.user_name} isMuted={participantMuteStatus.get(pinnedParticipant) ?? true}
                      isVideoOff={participantVideoStatus.get(pinnedParticipant) ?? true}
                      socketId={pinnedParticipant} isHostUser={p.is_host}
                      isScreenShare={participantScreenShares.has(pinnedParticipant)}
                    />;
                  })()
                )}
              </div>
              {/* Filmstrip */}
              <div className="flex gap-2 overflow-x-auto pb-1" style={{minHeight: '120px'}}>
                {pinnedParticipant !== 'local' && (
                  <div className="w-48 flex-shrink-0">
                    <VideoTile
                      videoRef={el => {
                        localVideoRef.current = el;
                        if (el && localStreamRef.current) {
                          el.srcObject = isScreenSharing ? (screenStreamRef.current || localStreamRef.current) : localStreamRef.current;
                          el.play().catch(e => console.warn('Video play failed:', e));
                        }
                      }}
                      name={user.name} isMuted={!isAudioEnabled}
                      isVideoOff={!isVideoEnabled} isLocal socketId="local" isHostUser={hostStatus}
                      isScreenShare={isScreenSharing} />
                  </div>
                )}
                {participants.filter(p => p.socket_id !== pinnedParticipant).map((p) => {
                  const sd = remoteStreams.get(p.socket_id);
                  return (
                    <div key={p.socket_id} className="w-48 flex-shrink-0">
                      <VideoTile
                        videoRef={el => { 
                          if (el) { 
                            remoteVideosRef.current.set(p.socket_id, el); 
                            if (sd?.stream) {
                              el.srcObject = sd.stream;
                              el.play().catch(e => console.warn('Remote video play failed:', e));
                            }
                          }
                        }}
                        name={p.user_name} isMuted={participantMuteStatus.get(p.socket_id) ?? true}
                        isVideoOff={participantVideoStatus.get(p.socket_id) ?? true}
                        socketId={p.socket_id} isHostUser={p.is_host}
                        isScreenShare={participantScreenShares.has(p.socket_id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Grid Layout */
            <div className={`grid ${gridClass} gap-3 h-full auto-rows-fr`}>
              {/* Local Video */}
              <VideoTile
                videoRef={el => {
                  localVideoRef.current = el;
                  if (el && localStreamRef.current) el.srcObject = isScreenSharing ? (screenStreamRef.current || localStreamRef.current) : localStreamRef.current;
                }}
                name={user.name} isMuted={!isAudioEnabled}
                isVideoOff={!isVideoEnabled} isLocal socketId="local" isHostUser={hostStatus}
                isScreenShare={isScreenSharing} />

              {/* Remote Videos */}
              {participants.map((p) => {
                const sd = remoteStreams.get(p.socket_id);
                return (
                  <VideoTile
                    key={p.socket_id}
                    videoRef={el => {
                      if (el) { 
                        remoteVideosRef.current.set(p.socket_id, el); 
                        if (sd?.stream) {
                          el.srcObject = sd.stream; 
                          el.play().catch(e => console.warn('Remote video play failed:', e));
                        }
                      }
                    }}
                    name={p.user_name}
                    isMuted={participantMuteStatus.get(p.socket_id) ?? true}
                    isVideoOff={participantVideoStatus.get(p.socket_id) ?? true}
                    socketId={p.socket_id}
                    isHostUser={p.is_host}
                    isScreenShare={participantScreenShares.has(p.socket_id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Side Panel (Participants / Transcript) ── */}
        {(showParticipants || showTranscript) && (
          <div className="w-full sm:w-80 bg-gray-900/80 backdrop-blur-xl border-l border-gray-800/50 flex flex-col absolute sm:relative inset-0 sm:inset-auto z-10 sm:z-auto">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800/50">
              <h3 className="font-semibold text-white">
                {showParticipants ? `Participants (${participants.length + 1})` : 'Live Transcript'}
              </h3>
              <button onClick={() => { setShowParticipants(false); setShowTranscript(false); }}
                className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {showParticipants && (
                <>
                  {/* Local User */}
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-800/40">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${nameToColor(user.name)} flex items-center justify-center`}>
                      <span className="text-xs font-bold text-white">{getInitials(user.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white truncate">{user.name}</span>
                        <span className="text-[10px] text-gray-500">(You)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isAudioEnabled && <MicOff className="w-3.5 h-3.5 text-red-400" />}
                      {hostStatus && <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 text-[10px] rounded-full">Host</span>}
                    </div>
                  </div>

                  {/* Remote Participants */}
                  {participants.map(p => (
                    <div key={p.socket_id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-800/40 transition-colors group">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${nameToColor(p.user_name)} flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{getInitials(p.user_name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-white truncate block">{p.user_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {participantMuteStatus.get(p.socket_id) && <MicOff className="w-3.5 h-3.5 text-red-400" />}
                        {p.is_host && <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 text-[10px] rounded-full">Host</span>}
                        {hostStatus && !p.is_host && (
                          <button onClick={() => forceMuteParticipant(p.socket_id)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded transition-all"
                            title="Force mute">
                            <MicOff className="w-3 h-3 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {showTranscript && (
                <>
                  {/* Transcription controls */}
                  <div className="flex items-center justify-between mb-3 p-2 bg-gray-800/40 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isTranscribing ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                      <span className="text-xs text-gray-400">
                        {isTranscribing ? 'Listening...' : transcriptionEnabled ? 'Standby' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {transcript.length > 0 && (
                        <button onClick={downloadTranscript} className="p-1 hover:bg-gray-700 rounded transition-colors" title="Download">
                          <Download className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      )}
                      {hostStatus && (
                        <button onClick={toggleTranscription}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                            transcriptionEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700 text-gray-400'
                          }`}>
                          {transcriptionEnabled ? 'ON' : 'OFF'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Transcript entries */}
                  {transcript.length > 0 ? (
                    transcript.map(entry => (
                      <div key={entry.id} className="p-2.5 rounded-xl bg-gray-800/30 hover:bg-gray-800/50 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-violet-400">{entry.speaker}</span>
                          <span className="text-[10px] text-gray-600">{entry.timestamp}</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{entry.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <FileText className="w-8 h-8 mb-3 opacity-30" />
                      <p className="text-sm">Transcript will appear here...</p>
                      <p className="text-xs mt-1">Unmute to start transcribing</p>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Reactions ── */}
      <div className="fixed bottom-24 right-8 flex flex-col-reverse gap-2 pointer-events-none" style={{zIndex: 100}}>
        {reactions.map(r => (
          <div key={r.id} className="animate-bounce text-4xl opacity-90 filter drop-shadow-lg" style={{
            animation: 'floatUp 3s ease-out forwards'
          }}>
            {r.emoji}
          </div>
        ))}
      </div>

      {/* ── Control Bar ── */}
      <div className="flex items-center justify-center py-3 px-4 bg-gray-900/60 backdrop-blur-xl border-t border-gray-800/50">
        <div className="flex items-center gap-2 bg-gray-800/60 backdrop-blur-xl rounded-2xl px-4 py-2 border border-gray-700/30">
          {/* Mic */}
          <button onClick={toggleAudio} title={isAudioEnabled ? 'Mute' : 'Unmute'}
            className={`p-3 rounded-xl transition-all duration-200 ${
              isAudioEnabled ? 'bg-gray-700/60 hover:bg-gray-600/60 text-white' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
            }`}>
            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Camera */}
          <button onClick={toggleVideo} title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
            className={`p-3 rounded-xl transition-all duration-200 ${
              isVideoEnabled ? 'bg-gray-700/60 hover:bg-gray-600/60 text-white' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
            }`}>
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button onClick={toggleScreenShare} title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            className={`p-3 rounded-xl transition-all duration-200 ${
              isScreenSharing ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-700/60 hover:bg-gray-600/60 text-white'
            }`}>
            {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>

          <div className="w-px h-8 bg-gray-700/50 mx-1" />

          {/* Reactions */}
          <div className="hidden sm:flex gap-1">
            {['👍', '👏', '❤️', '😂'].map(emoji => (
              <button key={emoji} onClick={() => sendReaction(emoji)}
                className="p-2 hover:bg-gray-700/60 rounded-xl transition-all hover:scale-110 text-lg">
                {emoji}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-gray-700/50 mx-1" />

          {/* Leave */}
          <button onClick={leaveMeeting} title="Leave Meeting"
            className="p-3 bg-red-500 hover:bg-red-600 rounded-xl text-white transition-all duration-200 shadow-lg shadow-red-500/20">
            <Phone className="w-5 h-5 rotate-[135deg]" />
          </button>

          {/* End Meeting (Host) */}
          {hostStatus && (
            <button onClick={endMeeting} title="End Meeting for All"
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-red-600/20">
              End All
            </button>
          )}
        </div>
      </div>

      {/* ── Toasts ── */}
      <div className="fixed top-16 right-4 flex flex-col gap-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl backdrop-blur-xl border animate-slide-up ${
            t.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-200' :
            t.type === 'warning' ? 'bg-amber-500/20 border-amber-500/30 text-amber-200' :
            'bg-gray-800/80 border-gray-700/50 text-gray-200'
          }`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Connection Error Banner ── */}
      {connectionError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/20 backdrop-blur-xl border border-red-500/30 rounded-xl text-red-200 text-sm z-50">
          {connectionError}
        </div>
      )}

      {/* ── Meeting Ended Modal ── */}
      {showMeetingEndedModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <PhoneOff className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white text-center mb-2">Meeting Ended</h2>
            <p className="text-gray-400 text-center mb-6">
              The meeting has been ended by {meetingEndedBy}.
            </p>
            <button onClick={() => { cleanupMedia(); onLeave(); }}
              className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all">
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* ── Float-up animation for reactions ── */}
      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-100px) scale(1.5); }
        }
      `}</style>
    </div>
  );
};

export default WebRTCMeeting;
