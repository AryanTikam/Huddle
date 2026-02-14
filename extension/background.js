// Huddle Chrome Extension - Background Service Worker

// Open side panel when the extension action (icon) is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set side panel behavior - open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting panel behavior:', error));

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Huddle extension installed successfully!');
  } else if (details.reason === 'update') {
    console.log('Huddle extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] || null });
    });
    return true;
  }

  if (message.type === 'CREATE_NOTIFICATION') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: message.title || 'Huddle',
      message: message.message || '',
      priority: 2
    });
    sendResponse({ success: true });
    return true;
  }

  // Handle tab audio capture request from side panel
  if (message.type === 'START_TAB_CAPTURE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: 'No active tab found' });
        return;
      }
      const tabId = tabs[0].id;
      chrome.tabCapture.capture(
        { audio: true, video: false },
        (stream) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          // We can't send MediaStream via message, so we use a different approach
          // The stream will be handled via offscreen document or direct tab capture
          sendResponse({ success: true, tabId: tabId });
        }
      );
    });
    return true;
  }

  // Handle desktop media capture request  
  if (message.type === 'REQUEST_DESKTOP_MEDIA') {
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab', 'audio'],
      (streamId, options) => {
        if (!streamId) {
          sendResponse({ error: 'User cancelled or no source selected' });
          return;
        }
        sendResponse({ streamId: streamId, options: options });
      }
    );
    return true;
  }
});
