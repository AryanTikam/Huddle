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
  ClipboardList,
  FileDown  // Add this import
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

  // Add new function for comprehensive export
  const downloadComprehensiveReport = async (format) => {
    try {
      await downloadFile(`/report/${meetingId}/comprehensive/${format}`, `meeting_${meetingId}_complete.${format}`);
    } catch (error) {
      console.error('Error downloading comprehensive report:', error);
    }
  };

  // Add new function for tab-specific export
  const downloadTabContent = async (tab, format) => {
    try {
      await downloadFile(`/report/${meetingId}/${tab}/${format}`, `meeting_${meetingId}_${tab}.${format}`);
    } catch (error) {
      console.error(`Error downloading ${tab}:`, error);
    }
  };

  const getFolderName = (folderId) => {
    if (!folderId || folderId === 'recent') return 'Recent';
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
            {/* Export All - New comprehensive dropdown */}
            <div className="relative group">
              <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg transition-colors shadow-md">
                <Download className="w-4 h-4" />
                <span>Export Complete Report</span>
              </button>
              
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                <div className="p-2">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                    Complete Meeting Report
                  </div>
                  <button
                    onClick={() => downloadComprehensiveReport('pdf')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    📄 Export as PDF
                  </button>
                  <button
                    onClick={() => downloadComprehensiveReport('json')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    📋 Export as JSON
                  </button>
                  <button
                    onClick={() => downloadComprehensiveReport('txt')}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                  >
                    📝 Export as TXT
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
  const { makeAuthenticatedRequest, downloadFile } = useAuth();
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

  // Check if summary is structured JSON or plain text
  const isStructured = generatedSummary && typeof generatedSummary === 'object' && !generatedSummary.text;

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

  // Render structured summary
  if (isStructured) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Meeting Summary</h3>
            <div className="flex items-center space-x-2">
              <div className="relative group">
                <button className="flex items-center space-x-2 px-4 py-2 bg-green-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800 text-green-700 dark:text-green-300 rounded-lg transition-colors">
                  <FileDown className="w-4 h-4" />
                  <span>Export Summary</span>
                </button>
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="p-2">
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/summary/pdf`, `summary_${meetingId}.pdf`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/summary/json`, `summary_${meetingId}.json`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/summary/txt`, `summary_${meetingId}.txt`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      TXT
                    </button>
                  </div>
                </div>
              </div>
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

          {/* Metrics */}
          {generatedSummary.metrics && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {generatedSummary.metrics.total_topics || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Topics Discussed</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {generatedSummary.metrics.decisions_made || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Decisions Made</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {generatedSummary.metrics.action_items || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Action Items</div>
              </div>
            </div>
          )}

          {/* Executive Summary */}
          {generatedSummary.executive_summary && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6 border-l-4 border-blue-500">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Executive Summary</h4>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {generatedSummary.executive_summary}
              </p>
            </div>
          )}
        </div>

        {/* Key Points */}
        {generatedSummary.key_points && generatedSummary.key_points.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-blue-500" />
              Key Discussion Points
            </h4>
            <div className="space-y-3">
              {generatedSummary.key_points.map((point, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    point.importance === 'high' ? 'bg-red-500' :
                    point.importance === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <div className="flex-1">
                    <p className="text-gray-900 dark:text-white">{point.point}</p>
                    <span className={`text-xs px-2 py-1 rounded-full mt-1 inline-block ${
                      point.importance === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                      point.importance === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    }`}>
                      {point.importance} priority
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decisions */}
        {generatedSummary.decisions && generatedSummary.decisions.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Check className="w-5 h-5 mr-2 text-green-500" />
              Decisions Made
            </h4>
            <div className="space-y-4">
              {generatedSummary.decisions.map((decision, index) => (
                <div key={index} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                  <p className="font-medium text-gray-900 dark:text-white mb-2">{decision.decision}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{decision.context}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Items */}
        {generatedSummary.action_items && generatedSummary.action_items.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-purple-500" />
              Action Items
            </h4>
            <div className="space-y-3">
              {generatedSummary.action_items.map((item, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 dark:text-white flex-1">{item.task}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ml-2 ${
                      item.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                      item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      {item.owner}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {item.deadline}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Steps */}
        {generatedSummary.next_steps && generatedSummary.next_steps.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Next Steps</h4>
            <div className="space-y-2">
              {generatedSummary.next_steps.map((step, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <p className="text-gray-900 dark:text-white">{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Quotes */}
        {generatedSummary.key_quotes && generatedSummary.key_quotes.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-indigo-500" />
              Notable Quotes
            </h4>
            <div className="space-y-4">
              {generatedSummary.key_quotes.map((quote, index) => (
                <div key={index} className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border-l-4 border-indigo-500">
                  <p className="text-gray-900 dark:text-white italic mb-2">"{quote.quote}"</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">— {quote.speaker}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to markdown renderer
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
  const { makeAuthenticatedRequest, downloadFile } = useAuth();
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

  const isStructured = generatedMinutes && typeof generatedMinutes === 'object' && !generatedMinutes.text;

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

  if (isStructured) {
    const meetingInfo = generatedMinutes.meeting_info || {};
    
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-3xl font-bold">Minutes of Meeting</h3>
            <div className="flex items-center space-x-2">
              <div className="relative group">
                <button className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
                  <FileDown className="w-4 h-4" />
                  <span>Export Minutes</span>
                </button>
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="p-2">
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/minutes/pdf`, `minutes_${meetingId}.pdf`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/minutes/json`, `minutes_${meetingId}.json`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/minutes/txt`, `minutes_${meetingId}.txt`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      TXT
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={generateMinutes}
                disabled={isGenerating}
                className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {meetingInfo.date && (
              <div>
                <div className="opacity-80">Date</div>
                <div className="font-semibold">{meetingInfo.date}</div>
              </div>
            )}
            {meetingInfo.time && (
              <div>
                <div className="opacity-80">Time</div>
                <div className="font-semibold">{meetingInfo.time}</div>
              </div>
            )}
            {meetingInfo.duration && (
              <div>
                <div className="opacity-80">Duration</div>
                <div className="font-semibold">{meetingInfo.duration}</div>
              </div>
            )}
            {meetingInfo.location && (
              <div>
                <div className="opacity-80">Location</div>
                <div className="font-semibold">{meetingInfo.location}</div>
              </div>
            )}
          </div>
        </div>

        {/* Attendees */}
        {generatedMinutes.attendees && generatedMinutes.attendees.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-500" />
              Attendees
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {generatedMinutes.attendees.map((attendee, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{attendee.name}</div>
                    {attendee.role && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">{attendee.role}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agenda Items */}
        {generatedMinutes.agenda_items && generatedMinutes.agenda_items.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Agenda</h4>
            <div className="space-y-3">
              {generatedMinutes.agenda_items.map((item, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-1">{item.item}</div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                      {item.duration && <span>⏱️ {item.duration}</span>}
                      {item.presenter && <span>👤 {item.presenter}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discussion Points */}
        {generatedMinutes.discussion_points && generatedMinutes.discussion_points.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-green-500" />
              Discussion Points
            </h4>
            <div className="space-y-4">
              {generatedMinutes.discussion_points.map((point, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h5 className="font-semibold text-gray-900 dark:text-white">{point.topic}</h5>
                    {point.presenter && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                        {point.presenter}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 mb-3">{point.summary}</p>
                  {point.key_points && point.key_points.length > 0 && (
                    <ul className="space-y-1">
                      {point.key_points.map((kp, kpIndex) => (
                        <li key={kpIndex} className="text-sm text-gray-600 dark:text-gray-400 flex items-start">
                          <span className="mr-2">•</span>
                          <span>{kp}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decisions */}
        {generatedMinutes.decisions && generatedMinutes.decisions.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Check className="w-5 h-5 mr-2 text-green-500" />
              Decisions Made
            </h4>
            <div className="space-y-4">
              {generatedMinutes.decisions.map((decision, index) => (
                <div key={index} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                  <p className="font-semibold text-gray-900 dark:text-white mb-2">{decision.decision}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{decision.rationale}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-600 dark:text-gray-400">
                    {decision.decision_maker && <span>👤 {decision.decision_maker}</span>}
                    {decision.affected_parties && decision.affected_parties.length > 0 && (
                      <span>📋 Affects: {decision.affected_parties.join(', ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Items */}
        {generatedMinutes.action_items && generatedMinutes.action_items.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-orange-500" />
              Action Items
            </h4>
            <div className="space-y-3">
              {generatedMinutes.action_items.map((item, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 dark:text-white flex-1">{item.task}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ml-2 ${
                      item.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                      item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>👤 {item.assignee}</span>
                    <span>📅 {item.deadline}</span>
                    <span className={`px-2 py-0.5 rounded ${
                      item.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parking Lot */}
        {generatedMinutes.parking_lot && generatedMinutes.parking_lot.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Parking Lot</h4>
            <div className="space-y-2">
              {generatedMinutes.parking_lot.map((item, index) => (
                <div key={index} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-l-2 border-yellow-500">
                  <p className="text-gray-900 dark:text-white">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Meeting */}
        {generatedMinutes.next_meeting && generatedMinutes.next_meeting.scheduled && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-blue-500" />
              Next Meeting
            </h4>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              {generatedMinutes.next_meeting.date && (
                <p className="font-medium text-gray-900 dark:text-white mb-2">
                  📅 {generatedMinutes.next_meeting.date}
                </p>
              )}
              {generatedMinutes.next_meeting.agenda && (
                <p className="text-gray-700 dark:text-gray-300">
                  {generatedMinutes.next_meeting.agenda}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to markdown renderer
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Minutes of Meeting
          </h3>
          <button
            onClick={generateMinutes}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>
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
  const { makeAuthenticatedRequest, downloadFile } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedInsights, setGeneratedInsights] = useState(insights);
  const [error, setError] = useState('');

  const generateInsights = async () => {
    setIsGenerating(true);
    setError('');

    try {
      console.log('[DEBUG] Generating insights for meeting:', meetingId);
      const response = await makeAuthenticatedRequest(`/insights/${meetingId}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      console.log('[DEBUG] Response status:', response.status);
      const data = await response.json();
      console.log('[DEBUG] Response data:', data);

      if (response.ok) {
        console.log('[DEBUG] Insights data:', data.insights);
        console.log('[DEBUG] Insights type:', typeof data.insights);
        console.log('[DEBUG] Is object?', data.insights && typeof data.insights === 'object');
        console.log('[DEBUG] Has text field?', data.insights?.text);
        
        setGeneratedInsights(data.insights);
      } else {
        throw new Error(data.error || 'Failed to generate insights');
      }
    } catch (error) {
      console.error('[DEBUG] Error generating insights:', error);
      setError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Enhanced debugging for insights structure
  console.log('[DEBUG] Current insights:', generatedInsights);
  console.log('[DEBUG] Insights type:', typeof generatedInsights);
  console.log('[DEBUG] Is object?', generatedInsights && typeof generatedInsights === 'object');
  console.log('[DEBUG] Has text field?', generatedInsights?.text);
  console.log('[DEBUG] Has overview field?', generatedInsights?.overview);

  const isStructured = generatedInsights && 
                       typeof generatedInsights === 'object' && 
                       !generatedInsights.text &&
                       generatedInsights.format !== 'text';

  console.log('[DEBUG] isStructured:', isStructured);

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

  if (isStructured) {
    const overview = generatedInsights.overview || {};
    
    return (
      <div className="space-y-6">
        {/* Overview Card */}
        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Meeting Insights</h3>
            <div className="flex items-center space-x-2">
              <div className="relative group">
                <button className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
                  <FileDown className="w-4 h-4" />
                  <span>Export Insights</span>
                </button>
                <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="p-2">
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/insights/pdf`, `insights_${meetingId}.pdf`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/insights/json`, `insights_${meetingId}.json`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => downloadFile(`/report/${meetingId}/insights/txt`, `insights_${meetingId}.txt`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                    >
                      TXT
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={generateInsights}
                disabled={isGenerating}
                className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </button>
            </div>
          </div>
          
          {/* Metrics */}
          {generatedInsights.metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {generatedInsights.metrics.total_topics || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Topics Discussed</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {generatedInsights.metrics.decisions_made || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Decisions Made</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {generatedInsights.metrics.action_items || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Action Items</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {generatedInsights.metrics.risks || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Risks Identified</div>
              </div>
            </div>
          )}

          {/* Executive Summary */}
          {generatedInsights.executive_summary && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6 border-l-4 border-blue-500">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Executive Summary</h4>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {generatedInsights.executive_summary}
              </p>
            </div>
          )}
        </div>

        {/* Key Themes */}
        {generatedInsights.key_themes && generatedInsights.key_themes.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Brain className="w-5 h-5 mr-2 text-purple-500" />
              Key Themes & Patterns
            </h4>
            <div className="space-y-3">
              {generatedInsights.key_themes.map((theme, index) => (
                <div key={index} className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border-l-4 border-purple-500">
                  <div className="flex items-start justify-between mb-2">
                    <h5 className="font-semibold text-gray-900 dark:text-white">{theme.theme}</h5>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        theme.importance === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                        theme.importance === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}>
                        {theme.importance}
                      </span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                        {theme.frequency}x
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{theme.description}</p>
                </div>
              ))}
                       </div>
          </div>
        )}

        {/* Participation Analysis */}
        {generatedInsights.participation_analysis && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-500" />
              Participation Analysis
            </h4>
            
            {generatedInsights.participation_analysis.most_active_speakers && generatedInsights.participation_analysis.most_active_speakers.length > 0 && (
              <div className="mb-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">Most Active Speakers</h5>
                <div className="space-y-2">
                  {generatedInsights.participation_analysis.most_active_speakers.map((speaker, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-8 relative overflow-hidden">
                        <div 
                          className="bg-blue-500 h-full rounded-full flex items-center px-3"
                          style={{ width: `${speaker.contribution_percentage}%` }}
                        >
                          <span className="text-white text-sm font-medium">{speaker.name}</span>
                        </div>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          {speaker.contribution_percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              {generatedInsights.participation_analysis.speaking_distribution && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Distribution</div>
                  <div className="font-semibold text-gray-900 dark:text-white capitalize">
                    {generatedInsights.participation_analysis.speaking_distribution}
                  </div>
                </div>
              )}
              {generatedInsights.participation_analysis.quiet_participants && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Quiet Participants</div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {generatedInsights.participation_analysis.quiet_participants.join(', ') || 'None'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sentiment Analysis */}
        {generatedInsights.sentiment_analysis && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-green-500" />
              Sentiment Analysis
            </h4>
            
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Overall Tone</div>
              <div className={`text-2xl font-bold capitalize ${
                generatedInsights.sentiment_analysis.overall_tone === 'positive' ? 'text-green-600 dark:text-green-400' :
                generatedInsights.sentiment_analysis.overall_tone === 'negative' ? 'text-red-600 dark:text-red-400' :
                'text-yellow-600 dark:text-yellow-400'
              }`}>
                {generatedInsights.sentiment_analysis.overall_tone}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generatedInsights.sentiment_analysis.positive_moments && generatedInsights.sentiment_analysis.positive_moments.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-900 dark:text-white mb-3">Positive Moments</h5>
                  <div className="space-y-2">
                    {generatedInsights.sentiment_analysis.positive_moments.map((moment, index) => (
                      <div key={index} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
                        <p className="text-gray-900 dark:text-white">{moment.moment}</p>
                        {moment.timestamp && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{moment.timestamp}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {generatedInsights.sentiment_analysis.concerns_raised && generatedInsights.sentiment_analysis.concerns_raised.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-900 dark:text-white mb-2">Concerns Raised</h5>
                  <div className="space-y-2">
                    {generatedInsights.sentiment_analysis.concerns_raised.map((concern, index) => (
                      <div key={index} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm">
                        <p className="text-gray-900 dark:text-white">{concern.concern}</p>
                        <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${
                          concern.severity === 'high' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
                          concern.severity === 'medium' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                          'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                        }`}>
                          {concern.severity} severity
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Agreements */}
            {generatedInsights.sentiment_analysis.agreements && generatedInsights.sentiment_analysis.agreements.length > 0 && (
              <div className="mt-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Agreements Reached</h5>
                <div className="space-y-2">
                  {generatedInsights.sentiment_analysis.agreements.map((agreement, index) => (
                    <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-start space-x-2">
                      <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-900 dark:text-white">{agreement}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conflicts */}
            {generatedInsights.sentiment_analysis.conflicts && generatedInsights.sentiment_analysis.conflicts.length > 0 && (
              <div className="mt-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-2">Conflicts/Disagreements</h5>
                <div className="space-y-2">
                  {generatedInsights.sentiment_analysis.conflicts.map((conflict, index) => (
                    <div key={index} className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-start space-x-2">
                      <X className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-900 dark:text-white">{conflict}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Follow-up Recommendations */}
        {generatedInsights.follow_up_recommendations && generatedInsights.follow_up_recommendations.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Follow-up Recommendations</h4>
            <div className="space-y-3">
              {generatedInsights.follow_up_recommendations.map((rec, index) => (
                <div key={index} className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border-l-4 border-indigo-500">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 dark:text-white flex-1">{rec.recommendation}</p>
                    <span className={`text-xs px-2 py-1 rounded ml-2 ${
                      rec.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                      rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    }`}>
                      {rec.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{rec.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks and Concerns */}
        {generatedInsights.risks_and_concerns && generatedInsights.risks_and_concerns.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              ⚠️ Risks & Concerns
            </h4>
            <div className="space-y-3">
              {generatedInsights.risks_and_concerns.map((risk, index) => (
                <div key={index} className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-gray-900 dark:text-white flex-1">{risk.risk}</p>
                    <span className={`text-xs px-2 py-1 rounded ml-2 ${
                      risk.impact === 'high' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
                      risk.impact === 'medium' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                      'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                    }`}>
                      {risk.impact} impact
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Mitigation:</span> {risk.mitigation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interesting Observations */}
        {generatedInsights.interesting_observations && generatedInsights.interesting_observations.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">💡 Interesting Observations</h4>
            <div className="space-y-2">
              {generatedInsights.interesting_observations.map((obs, index) => (
                <div key={index} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-gray-900 dark:text-white">{obs}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Metrics */}
        {generatedInsights.key_metrics && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">📊 Key Metrics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(generatedInsights.key_metrics).map(([key, value]) => (
                <div key={key} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1 capitalize">
                    {value}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 capitalize">
                    {key.replace(/_/g, ' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to markdown renderer - FIX: Remove the incorrect nested structure
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
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
      </div>

      <div className="p-6">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6">
          <MarkdownRenderer 
            content={typeof generatedInsights === 'string' ? generatedInsights : (generatedInsights?.text || JSON.stringify(generatedInsights, null, 2))} 
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