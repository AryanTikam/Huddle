import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings as SettingsIcon, 
  Cloud, 
  Shield, 
  Zap, 
  Download, 
  Trash2, 
  Check,
  AlertCircle,
  Loader,
  HardDrive,
  Cpu,
  ArrowLeft,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const Settings = ({ onNavigate }) => {
  const { makeAuthenticatedRequest } = useAuth();
  
  // State
  const [currentMode, setCurrentMode] = useState('off-device');
  const [currentModel, setCurrentModel] = useState('llama3.2');
  const [availableModes, setAvailableModes] = useState([]);
  const [installedModels, setInstalledModels] = useState([]);
  const [recommendedModels, setRecommendedModels] = useState([]);
  const [ollamaStatus, setOllamaStatus] = useState({ available: false, message: '' });
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [pullingModel, setPullingModel] = useState(null);
  const [pullProgress, setPullProgress] = useState('');
  const [deletingModel, setDeletingModel] = useState(null);
  const [showModels, setShowModels] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modeWarning, setModeWarning] = useState('');

  const token = localStorage.getItem('token');

  // Fetch helpers that don't throw on non-ok
  const safeFetch = useCallback(async (url) => {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      return await response.json();
    } catch (err) {
      console.error(`Fetch error for ${url}:`, err);
      return null;
    }
  }, [token]);

  const safePost = useCallback(async (url, body) => {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      return await response.json();
    } catch (err) {
      console.error(`Post error for ${url}:`, err);
      return null;
    }
  }, [token]);

  const safeDelete = useCallback(async (url, body) => {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      return await response.json();
    } catch (err) {
      console.error(`Delete error for ${url}:`, err);
      return null;
    }
  }, [token]);

  // Load all settings data
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [modeData, ollamaData, modelsData, recommendedData] = await Promise.all([
        safeFetch('/settings/ai-mode'),
        safeFetch('/settings/ollama/status'),
        safeFetch('/settings/ollama/models'),
        safeFetch('/settings/ollama/models/recommended')
      ]);

      if (modeData) {
        setCurrentMode(modeData.mode || 'off-device');
        setCurrentModel(modeData.local_model || 'llama3.2');
        setAvailableModes(modeData.available_modes || []);
      }

      if (ollamaData) {
        setOllamaStatus(ollamaData);
      }

      if (modelsData && modelsData.models) {
        setInstalledModels(modelsData.models);
      }

      if (recommendedData && recommendedData.models) {
        setRecommendedModels(recommendedData.models);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [safeFetch]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Set AI Mode
  const handleSetMode = async (mode) => {
    setSavingMode(true);
    setError('');
    setSuccess('');
    setModeWarning('');
    
    try {
      const data = await safePost('/settings/ai-mode', { mode });
      
      if (data?.error) {
        setError(data.error);
        if (data.help) {
          setError(prev => `${prev} ${data.help}`);
        }
        setSavingMode(false);
        return;
      }
      
      if (data?.warning) {
        setModeWarning(data.warning);
      }
      
      setCurrentMode(mode);
      setSuccess(`Switched to ${mode === 'off-device' ? 'Off-Device (Cloud)' : mode === 'local' ? 'Local (On-Device)' : 'Hybrid'} mode`);
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to switch mode');
    } finally {
      setSavingMode(false);
    }
  };

  // Set active local model
  const handleSetLocalModel = async (modelName) => {
    try {
      const data = await safePost('/settings/local-model', { model: modelName });
      if (data?.model_set) {
        setCurrentModel(modelName);
        setSuccess(`Active model set to ${modelName}`);
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError('Failed to set model');
    }
  };

  // Pull/download model
  const handlePullModel = async (modelName) => {
    setPullingModel(modelName);
    setPullProgress('Starting download...');
    setError('');

    try {
      const response = await fetch(`${API_BASE}/settings/ollama/models/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ model: modelName, stream: true })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.status === 'complete') {
              setPullProgress('Download complete!');
            } else if (data.error) {
              setError(`Download failed: ${data.error}`);
              setPullingModel(null);
              return;
            } else if (data.total && data.completed) {
              const percent = Math.round((data.completed / data.total) * 100);
              setPullProgress(`Downloading... ${percent}%`);
            } else if (data.status) {
              setPullProgress(data.status);
            }
          } catch (e) {
            // ignore parse errors for partial lines
          }
        }
      }

      setSuccess(`Model "${modelName}" downloaded successfully!`);
      setTimeout(() => setSuccess(''), 3000);
      
      // Refresh model lists
      const [modelsData, recommendedData] = await Promise.all([
        safeFetch('/settings/ollama/models'),
        safeFetch('/settings/ollama/models/recommended')
      ]);
      if (modelsData?.models) setInstalledModels(modelsData.models);
      if (recommendedData?.models) setRecommendedModels(recommendedData.models);

    } catch (err) {
      setError(`Failed to download model: ${err.message}`);
    } finally {
      setPullingModel(null);
      setPullProgress('');
    }
  };

  // Delete model
  const handleDeleteModel = async (modelName) => {
    if (!window.confirm(`Delete model "${modelName}"? This will free up disk space but you'll need to re-download it to use it again.`)) return;
    
    setDeletingModel(modelName);
    setError('');
    
    try {
      const data = await safeDelete('/settings/ollama/models/delete', { model: modelName });
      
      if (data?.status === 'deleted') {
        setSuccess(`Model "${modelName}" deleted`);
        setTimeout(() => setSuccess(''), 3000);
        
        // Refresh lists
        const [modelsData, recommendedData] = await Promise.all([
          safeFetch('/settings/ollama/models'),
          safeFetch('/settings/ollama/models/recommended')
        ]);
        if (modelsData?.models) setInstalledModels(modelsData.models);
        if (recommendedData?.models) setRecommendedModels(recommendedData.models);
      } else {
        setError(data?.error || 'Failed to delete model');
      }
    } catch (err) {
      setError('Failed to delete model');
    } finally {
      setDeletingModel(null);
    }
  };

  // Mode icon mapping
  const getModeIcon = (modeId) => {
    switch (modeId) {
      case 'off-device': return <Cloud className="w-6 h-6" />;
      case 'local': return <Shield className="w-6 h-6" />;
      case 'hybrid': return <Zap className="w-6 h-6" />;
      default: return <SettingsIcon className="w-6 h-6" />;
    }
  };

  const getModeColor = (modeId) => {
    switch (modeId) {
      case 'off-device': return 'blue';
      case 'local': return 'green';
      case 'hybrid': return 'purple';
      default: return 'gray';
    }
  };

  // Category badge colors
  const getCategoryColor = (category) => {
    switch (category) {
      case 'recommended': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'lightweight': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'performance': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      case 'multilingual': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
      case 'embeddings': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-20">
          <Loader className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => onNavigate('dashboard')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose how Huddle processes your meeting data
            </p>
          </div>
        </div>
        <button
          onClick={loadSettings}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start space-x-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {success && (
        <div className="flex items-start space-x-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-300 text-sm">{success}</p>
        </div>
      )}

      {modeWarning && (
        <div className="flex items-start space-x-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
          <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
          <p className="text-yellow-700 dark:text-yellow-300 text-sm">{modeWarning}</p>
        </div>
      )}

      {/* ─── AI Processing Mode ─────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
          <Cpu className="w-5 h-5" />
          <span>AI Processing Mode</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {availableModes.map((mode) => {
            const color = getModeColor(mode.id);
            const isActive = currentMode === mode.id;
            const isWIP = mode.status === 'wip';
            
            return (
              <button
                key={mode.id}
                onClick={() => !savingMode && handleSetMode(mode.id)}
                disabled={savingMode}
                className={`relative p-5 rounded-xl border-2 text-left transition-all duration-200 ${
                  isActive 
                    ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/20 shadow-lg shadow-${color}-100 dark:shadow-none` 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                } ${savingMode ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
                style={isActive ? { 
                  borderColor: color === 'blue' ? '#3B82F6' : color === 'green' ? '#10B981' : '#8B5CF6',
                  backgroundColor: color === 'blue' ? 'rgba(59,130,246,0.05)' : color === 'green' ? 'rgba(16,185,129,0.05)' : 'rgba(139,92,246,0.05)'
                } : {}}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute top-3 right-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center`}
                         style={{ backgroundColor: color === 'blue' ? '#3B82F6' : color === 'green' ? '#10B981' : '#8B5CF6' }}>
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

                {/* WIP badge */}
                {isWIP && (
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">
                      WIP
                    </span>
                  </div>
                )}

                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3`}
                     style={{ 
                       backgroundColor: isActive 
                         ? (color === 'blue' ? '#3B82F6' : color === 'green' ? '#10B981' : '#8B5CF6')
                         : '#E5E7EB',
                       color: isActive ? 'white' : '#6B7280'
                     }}>
                  {getModeIcon(mode.id)}
                </div>
                
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {mode.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Ollama Status ──────────────────────────────────────── */}
      {(currentMode === 'local' || currentMode === 'hybrid') && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
            <HardDrive className="w-5 h-5" />
            <span>Ollama Runtime</span>
          </h2>
          
          <div className={`p-4 rounded-xl border ${
            ollamaStatus.available 
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20' 
              : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${ollamaStatus.available ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <div>
                  <p className={`font-medium ${ollamaStatus.available ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {ollamaStatus.available ? 'Ollama is running' : 'Ollama is not running'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {ollamaStatus.available 
                      ? 'Local AI inference is available' 
                      : 'Install from ollama.ai and run "ollama serve" in terminal'}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  const data = await safeFetch('/settings/ollama/status');
                  if (data) setOllamaStatus(data);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ─── Local Model Management ─────────────────────────────── */}
      {(currentMode === 'local' || currentMode === 'hybrid') && (
        <section>
          <div 
            className="flex items-center justify-between cursor-pointer mb-4"
            onClick={() => setShowModels(!showModels)}
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
              <Download className="w-5 h-5" />
              <span>Local Models</span>
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({installedModels.length} installed)
              </span>
            </h2>
            {showModels ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>

          {showModels && (
            <div className="space-y-6">
              {/* Installed Models */}
              {installedModels.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Installed Models</h3>
                  <div className="space-y-2">
                    {installedModels.map((model) => (
                      <div 
                        key={model.name}
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                          currentModel === model.name
                            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            currentModel === model.name 
                              ? 'bg-green-500 text-white' 
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }`}>
                            <Cpu className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {model.display_name || model.name}
                              </p>
                              {currentModel === model.name && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                                  Active
                                </span>
                              )}
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(model.category)}`}>
                                {model.category}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {model.description} · {model.parameters} params
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {currentModel !== model.name && (
                            <button
                              onClick={() => handleSetLocalModel(model.name)}
                              className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteModel(model.name)}
                            disabled={deletingModel === model.name}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Delete model"
                          >
                            {deletingModel === model.name 
                              ? <Loader className="w-4 h-4 animate-spin" /> 
                              : <Trash2 className="w-4 h-4" />
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Models to Download */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Available for Download
                </h3>
                <div className="space-y-2">
                  {recommendedModels.filter(m => !m.installed).map((model) => (
                    <div 
                      key={model.name}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          <Download className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {model.display_name}
                            </p>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(model.category)}`}>
                              {model.category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {model.description} · {model.size} · {model.parameters} params
                          </p>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handlePullModel(model.name)}
                        disabled={pullingModel !== null}
                        className="px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center space-x-2"
                      >
                        {pullingModel === model.name ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}

                  {recommendedModels.filter(m => !m.installed).length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
                      <p className="text-sm">All recommended models are installed!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Download Progress */}
              {pullingModel && pullProgress && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-center space-x-3">
                    <Loader className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-700 dark:text-blue-300 text-sm">
                        Downloading {pullingModel}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                        {pullProgress}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── Current Configuration Summary ──────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
          <Info className="w-5 h-5" />
          <span>Current Configuration</span>
        </h2>
        
        <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Processing Mode
              </p>
              <div className="flex items-center space-x-2">
                {getModeIcon(currentMode)}
                <span className="font-medium text-gray-900 dark:text-white capitalize">
                  {currentMode === 'off-device' ? 'Off-Device (Cloud / Gemini)' : currentMode === 'local' ? 'Local (On-Device / Ollama)' : 'Hybrid (Smart Routing)'}
                </span>
              </div>
            </div>
            
            {currentMode === 'off-device' && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Cloud Provider
                </p>
                <p className="font-medium text-gray-900 dark:text-white">Google Gemini 2.5 Flash</p>
              </div>
            )}
            
            {(currentMode === 'local' || currentMode === 'hybrid') && (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Local Model
                  </p>
                  <p className="font-medium text-gray-900 dark:text-white">{currentModel}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Ollama Status
                  </p>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${ollamaStatus.available ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {ollamaStatus.available ? 'Running' : 'Not Running'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Installed Models
                  </p>
                  <p className="font-medium text-gray-900 dark:text-white">{installedModels.length}</p>
                </div>
              </>
            )}
          </div>

          {/* Privacy note */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-start space-x-2">
              <Shield className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {currentMode === 'local' 
                  ? 'All data is processed locally on your machine. No meeting data or transcripts are sent to external servers.'
                  : currentMode === 'hybrid'
                  ? 'Simple queries are processed locally for privacy. Complex queries may be sent to Google Gemini for higher quality results.'
                  : 'Meeting transcripts are sent to Google\'s Gemini API for processing. Data is subject to Google\'s privacy policy.'
                }
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;
