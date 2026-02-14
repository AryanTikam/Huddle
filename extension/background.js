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
    return true; // Keep the message channel open for async response
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
});
