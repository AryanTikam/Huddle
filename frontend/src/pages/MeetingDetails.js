import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Users, 
  Share2, 
  Download, 
  Edit, 
  Save, 
  X, 
  Check, 
  FolderOpen,
  FileText,
  MessageSquare,
  Brain,
  RefreshCw,
  ClipboardList  
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TranscriptViewer from '../components/TranscriptViewer';
import KnowledgeGraph from '../components/KnowledgeGraph';
import MeetingChatbot from '../components/MeetingChatbot';
import MarkdownRenderer from '../components/MarkdownRenderer';

const MeetingDetails = ({ meetingId, activeTab, onBack, onTabChange }) => {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [folders, setFolders] = useState([]);
  
  // Move dialog state
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedTargetFolder, setSelectedTargetFolder] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  
  const { makeAuthenticatedRequest, downloadFile } = useAuth();

  const tabs = [
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'minutes', label: 'Minutes', icon: ClipboardList },
    { id: 'insights', label: 'Insights', icon: Brain },
    { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Brain },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  ];

  useEffect(() => {
    fetchMeetingDetails();
    fetchFolders();
  }, [meetingId]);

  const fetchMeetingDetails = async () => {
    try {
      setLoading(true);
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`);
      const data = await response.json();
      
      if (response.ok) {
        setMeeting(data);
        setEditForm({
          title: data.title || '',
          description: data.description || '',
          folder_id: data.folder_id || 'recent'
        });
      } else {
        setError(data.error || 'Failed to fetch meeting details');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
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

  const handleSaveEdit = async () => {
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        setMeeting(prev => ({ ...prev, ...editForm }));
        setEditing(false);
      }
    } catch (error) {
      console.error('Error updating meeting:', error);
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/meeting/${meetingId}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleMoveClick = () => {
    setSelectedTargetFolder(meeting.folder_id || 'recent');
    setShowMoveDialog(true);
  };

  const handleMoveMeeting = async () => {
    if (!selectedTargetFolder) return;

    setIsMoving(true);
    try {
      const response = await makeAuthenticatedRequest(`/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify({ folder_id: selectedTargetFolder })
      });

      if (response.ok) {
        setMeeting(prev => ({ ...prev, folder_id: selectedTargetFolder }));
        setShowMoveDialog(false);
      }
    } catch (error) {
      console.error('Error moving meeting:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const parseDateTime = (dateValue) => {
    if (!dateValue) return null;
    
    try {
      let date;
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue.$date) {
        if (typeof dateValue.$date === 'string') {
          date = new Date(dateValue.$date);
        } else {
          date = new Date(dateValue.$date);
        }
      } else if (typeof dateValue === 'object' && dateValue.getTime) {
        date = dateValue;
      } else {
        date = new Date(dateValue);
      }
      
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', dateValue);
        return null;
      }
      
      return date;
    } catch (error) {
      console.error('Error parsing date:', error, dateValue);
      return null;
    }
  };

  const formatDuration = () => {
    if (!meeting) return 'N/A';
    
    const createdAt = parseDateTime(meeting.created_at);
    const endedAt = parseDateTime(meeting.ended_at);
    
    if (!createdAt) {
      console.warn('No valid created_at date found:', meeting.created_at);
      return 'N/A';
    }
    
    let endTime;
    if (endedAt) {
      endTime = endedAt;
    } else if (meeting.status === 'completed') {
      endTime = new Date(createdAt.getTime() + (60 * 60 * 1000)); // Add 1 hour as default
    } else {
      return 'Ongoing';
    }
    
    const durationMs = endTime.getTime() - createdAt.getTime();
    
    if (durationMs <= 0) {
      console.warn('Invalid duration calculated:', { createdAt, endTime, durationMs });
      return 'N/A';
    }
    
    const totalMinutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      case 'recording': return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300';
      case 'processing': return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  const downloadReport = async (format) => {
    try {
      await downloadFile(`/report/${meetingId}/${format}`, `meeting_${meetingId}.${format}`);
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  };

  const getFolderName = (folderId) => {
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : 'Unknown';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading meeting details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Meeting</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Meeting Not Found</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">The requested meeting could not be found.</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'transcript':
        return <TranscriptViewer transcript={meeting.transcript} meetingId={meetingId} />;
      case 'summary':
        return <SummaryView summary={meeting.summary} meetingId={meetingId} />;
      case 'knowledge-graph':
        return <KnowledgeGraphView meeting={meeting} meetingId={meetingId} />;
      case 'chat':
        return <MeetingChatbot meetingId={meetingId} />;
      case 'insights':
        return <InsightsView insights={meeting.insights} meetingId={meetingId} />;
      case 'minutes':
        return <MinutesView minutes={meeting.minutes} meetingId={meetingId} />;
      default:
        return <TranscriptViewer transcript={meeting.transcript} meetingId={meetingId} />;
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Meetings</span>
          </button>

          <div className="flex items-center space-x-3">
            {/* Download Dropdown */}
            <div className="relative group">
              <button className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                <div className="p-2">
                  <button
                    onClick={() => downloadReport('pdf')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => downloadReport('json')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => downloadReport('csv')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => downloadReport('txt')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    Export TXT
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleShare}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Share'}</span>
            </button>

            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows="3"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Folder
              </label>
              <select
                value={editForm.folder_id}
                onChange={(e) => setEditForm({ ...editForm, folder_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleSaveEdit}
                className="flex items-center space-x-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              {meeting.title || 'Untitled Meeting'}
            </h1>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(meeting.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Duration</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatDuration()}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Users className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Participants</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {meeting.participants?.length || 0}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <FolderOpen className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Folder</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {getFolderName(meeting.folder_id)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(meeting.status)}`}>
                {meeting.status}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Language: {meeting.language || 'en-US'}
              </span>
            </div>

            {meeting.description && (
              <div className="mt-4">
                <p className="text-gray-700 dark:text-gray-300">{meeting.description}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex space-x-1 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderContent()}
        </div>
      </div>

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Move Meeting
            </h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Folder
              </label>
              <select
                value={selectedTargetFolder}
                onChange={(e) => setSelectedTargetFolder(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveMeeting}
                disabled={isMoving}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isMoving ? 'Moving...' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SummaryView = ({ summary, meetingId }) => {
  const { makeAuthenticatedRequest } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState(summary);
  const [error, setError] = useState('');

  const generateSummary = async () => {
    setIsGenerating(true);
    setError('');
    
    try {
      const response = await makeAuthenticatedRequest(`/summary/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedSummary(data.summary);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      setError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!generatedSummary && !isGenerating && !error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Summary Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Generate an AI-powered summary of this meeting's key points and decisions.
        </p>
        <button
          onClick={generateSummary}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Generate Summary
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generating Summary...
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          AI is analyzing the meeting transcript and creating a comprehensive summary.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Summary Generation Failed
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {error}
        </p>
        <button
          onClick={generateSummary}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Meeting Summary
          </h3>
          <button
            onClick={generateSummary}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>
      </div>
      
      <div className="p-6">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6">
          <MarkdownRenderer 
            content={generatedSummary} 
            className="text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
};

const MinutesView = ({ minutes, meetingId }) => {
  const { makeAuthenticatedRequest } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMinutes, setGeneratedMinutes] = useState(minutes);
  const [error, setError] = useState('');

  const generateMinutes = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const response = await makeAuthenticatedRequest(`/minutes/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedMinutes(data.minutes);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate minutes');
      }
    } catch (error) {
      console.error('Error generating minutes:', error);
      setError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!generatedMinutes && !isGenerating && !error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Minutes Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Generate the official Minutes of the Meeting from the transcript.
        </p>
        <button
          onClick={generateMinutes}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Generate Minutes
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generating Minutes...
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Our AI is analyzing the transcript and drafting the minutes. Please wait.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Failed to Generate Minutes
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <button
          onClick={generateMinutes}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Minutes of Meeting
        </h3>
        <button
          onClick={generateMinutes}
          disabled={isGenerating}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>Regenerate</span>
        </button>
      </div>

      <div className="p-6">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6">
          <MarkdownRenderer
            content={generatedMinutes}
            className="text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
};

const InsightsView = ({ insights, meetingId }) => {
  const { makeAuthenticatedRequest } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedInsights, setGeneratedInsights] = useState(insights);
  const [error, setError] = useState('');

  const generateInsights = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const response = await makeAuthenticatedRequest(`/insights/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedInsights(data.insights);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate insights');
      }
    } catch (error) {
      console.error('Error generating insights:', error);
      setError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!generatedInsights && !isGenerating && !error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Insights Available
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Generate AI-powered insights to understand key trends, participation, sentiment, and metrics from this meeting.
        </p>
        <button
          onClick={generateInsights}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Generate Insights
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generating Insights...
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          AI is analyzing the meeting transcript and creating a comprehensive set of insights.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Insights Generation Failed
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {error}
        </p>
        <button
          onClick={generateInsights}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Meeting Insights
        </h3>
        <button
          onClick={generateInsights}
          disabled={isGenerating}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>Regenerate</span>
        </button>
      </div>

      <div className="p-6">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6">
          <MarkdownRenderer
            content={generatedInsights}
            className="text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
};

const KnowledgeGraphView = ({ meeting, meetingId }) => {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { makeAuthenticatedRequest } = useAuth();

  const fetchKnowledgeGraph = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await makeAuthenticatedRequest(`/knowledge-graph/${meetingId}`);
      
      if (response.ok) {
        const data = await response.json();
        setGraphData(data.graph);
      } else if (response.status === 404) {
        await generateKnowledgeGraph();
      } else {
        throw new Error('Failed to fetch knowledge graph');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateKnowledgeGraph = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await makeAuthenticatedRequest(`/knowledge-graph/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({
          transcript: meeting.transcript
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setGraphData(data.graph);
      } else {
        throw new Error('Failed to generate knowledge graph');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (meetingId && meeting) {
      fetchKnowledgeGraph();
    }
  }, [meetingId, meeting]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">
          Generating knowledge graph...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Failed to Load Knowledge Graph
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error}
          </p>
          <button
            onClick={generateKnowledgeGraph}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return <KnowledgeGraph graphData={graphData} />;
};

const formatDate = (dateValue) => {
  if (!dateValue) return 'N/A';
  
  try {
    let date;
    
    if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (dateValue.$date) {
      date = new Date(dateValue.$date);
    } else {
      date = new Date(dateValue);
    }
    
    if (isNaN(date.getTime())) {
      return 'N/A';
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'N/A';
  }
};

export default MeetingDetails; 