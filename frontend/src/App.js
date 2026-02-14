import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import NewMeeting from './pages/NewMeeting';
import NewWebRTCMeeting from './pages/NewWebRTCMeeting';
import AllMeetings from './pages/AllMeetings';
import MeetingDetails from './pages/MeetingDetails';
import JoinMeeting from './pages/JoinMeeting';
import WebRTCMeeting from './pages/WebRTCMeeting';
import Auth from './components/Auth';
import LoadingSpinner from './components/LoadingSpinner';
import LandingPage from './pages/LandingPage';
import CaptureAudio from './pages/CaptureAudio';

const AppContent = () => {
  // Detect Chrome extension environment
  const isExtension = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);

  // Load initial states from localStorage
  const [activeView, setActiveView] = useState(() => {
    return localStorage.getItem('activeView') || 'dashboard';
  });
  const [selectedMeetingId, setSelectedMeetingId] = useState(() => {
    return localStorage.getItem('selectedMeetingId') || null;
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'transcript';
  });
  const [roomId, setRoomId] = useState(null);
  const [meetingData, setMeetingData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [showLanding, setShowLanding] = useState(!isExtension); // Skip landing in extension
  const [sidebarOpen, setSidebarOpen] = useState(false); // For extension sidebar toggle
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      setShowLanding(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('activeView', activeView);
  }, [activeView]);

  useEffect(() => {
    if (selectedMeetingId) {
      localStorage.setItem('selectedMeetingId', selectedMeetingId);
    } else {
      localStorage.removeItem('selectedMeetingId');
    }
  }, [selectedMeetingId]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    if (!showLanding) {
      return <Auth />;
    }
    return <LandingPage onGetStarted={() => setShowLanding(false)} />;
  }

  const handleMeetingClick = (meetingId, tab = 'transcript') => {
    setSelectedMeetingId(meetingId);
    setActiveTab(tab);
    setActiveView('meeting-details');
  };

  const handleBackFromMeeting = () => {
    setSelectedMeetingId(null);
    setActiveView('meetings');
  };

  const handleMeetingCreated = (meetingId) => {
    // When a recorded meeting is created, navigate to it
    handleMeetingClick(meetingId, 'transcript');
  };

  const handleWebRTCMeetingCreated = (meeting, roomIdParam) => {
    // When a WebRTC meeting is created, start the meeting
    setMeetingData(meeting);
    setRoomId(roomIdParam);
    setIsHost(true);
    setActiveView('webrtc-meeting');
  };

  const handleJoinRoom = (roomIdParam) => {
    setRoomId(roomIdParam);
    setActiveView('join-meeting');
  };

  const handleJoinMeeting = (meeting, isHostParam) => {
    setMeetingData(meeting);
    setIsHost(isHostParam);
    setActiveView('webrtc-meeting');
  };

  const handleLeaveMeeting = () => {
    setRoomId(null);
    setMeetingData(null);
    setIsHost(false);
    setActiveView('dashboard');
  };

  const handleBackFromJoin = () => {
    setRoomId(null);
    setActiveView('dashboard');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': 
        return (
          <Dashboard 
            onNavigate={setActiveView}
            onMeetingClick={handleMeetingClick}
            onJoinRoom={handleJoinRoom}
          />
        );
      case 'new-meeting': 
        return (
          <NewMeeting 
            onMeetingCreated={handleMeetingCreated}
            onNavigate={setActiveView}
          />
        );
      case 'new-webrtc-meeting':
        return (
          <NewWebRTCMeeting 
            onMeetingCreated={handleWebRTCMeetingCreated}
            onNavigate={setActiveView}
          />
        );
      case 'capture-audio':
        return (
          <CaptureAudio 
            onMeetingCreated={handleMeetingCreated}
            onNavigate={setActiveView}
          />
        );
      case 'join-meeting':
        return (
          <JoinMeeting 
            roomId={roomId}
            onJoin={handleJoinMeeting}
            onBack={handleBackFromJoin}
          />
        );
      case 'webrtc-meeting':
        return (
          <WebRTCMeeting 
            roomId={roomId}
            onLeave={handleLeaveMeeting}
            isHost={isHost}
            meetingData={meetingData}
          />
        );
      case 'meetings': 
        return (
          <AllMeetings 
            onMeetingClick={handleMeetingClick}
          />
        );
      case 'meeting-details': 
        return (
          <MeetingDetails 
            meetingId={selectedMeetingId}
            activeTab={activeTab}
            onBack={handleBackFromMeeting}
            onTabChange={setActiveTab}
          />
        );
      default: 
        return <Dashboard onNavigate={setActiveView} />;
    }
  };

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors ${isExtension ? 'extension-mode' : ''}`}>
      <Header onToggleSidebar={isExtension ? () => setSidebarOpen(!sidebarOpen) : undefined} isExtension={isExtension} />
      <div className="flex h-screen">
        {!['webrtc-meeting', 'join-meeting'].includes(activeView) && (
          <>
            <div className={isExtension ? `sidebar-container ${sidebarOpen ? 'sidebar-open' : ''}` : ''}>
              <Sidebar 
                activeView={activeView} 
                setActiveView={(view) => { setActiveView(view); if (isExtension) setSidebarOpen(false); }}
                onMeetingClick={(id, tab) => { handleMeetingClick(id, tab); if (isExtension) setSidebarOpen(false); }}
              />
            </div>
            {isExtension && sidebarOpen && (
              <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}
          </>
        )}
        <main className={`flex-1 overflow-y-auto ${
          ['webrtc-meeting', 'join-meeting'].includes(activeView) ? '' : 'pt-20'
        }`}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;