(() => {
  const HOST_PATTERN = /(zoom\.us|zoom\.com)$/i;

  if (!HOST_PATTERN.test(window.location.hostname)) {
    return;
  }

  const state = {
    lastSpeaker: '',
    lastUpdatedAt: 0,
    scheduled: false
  };

  const SPEAKING_SELECTORS = [
    '[class*="speaking" i]',
    '[class*="talking" i]',
    '[class*="active-speaker" i]',
    '[aria-label*="speaking" i]',
    '[aria-label*="speaker" i]',
    '[aria-label*="microphone" i]',
    '[title*="speaking" i]',
    '[title*="speaker" i]',
    '[data-testid*="speaking" i]',
    '[data-testid*="speaker" i]',
    '[data-testid*="active-speaker" i]'
  ];

  const NOISE_PATTERNS = [
    /zoom/i,
    /microphone/i,
    /mic/i,
    /mute/i,
    /unmute/i,
    /audio/i,
    /video/i,
    /settings/i,
    /participants?/i,
    /more/i,
    /share/i,
    /chat/i
  ];

  const NAME_NODE_SELECTORS = [
    '[data-testid*="display-name" i]',
    '[data-testid*="participant-name" i]',
    '[data-testid*="user-name" i]',
    '[class*="display-name" i]',
    '[class*="participant-name" i]',
    '[class*="participant__name" i]',
    '[class*="video-avatar" i]',
    '[class*="avatar-name" i]',
    '[class*="user-name" i]',
    '[class*="participants-item" i] [title]',
    '[role="listitem"] [title]',
    '[role="button"] [title]'
  ];

  function normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isLikelyName(text) {
    const value = normalizeText(text);
    if (!value || value.length > 80) {
      return false;
    }

    return !NOISE_PATTERNS.some((pattern) => pattern.test(value));
  }

  function extractSpeakerLabel(text) {
    const value = normalizeText(text);
    if (!value) {
      return '';
    }

    const directPatterns = [
      /^(.*?)\s*\((?:host|co-host|guest)\)$/i,
      /^(.*?)(?:\s*\(speaking\)|\s*-\s*speaking|\s+speaking)$/i,
      /^(.*?)(?:\s*\(active\)|\s*-\s*active)$/i,
      /^(.*?)(?:\s*is speaking)$/i,
      /^(.*?)(?:\s*speaking now)$/i,
      /^(.*?)\s*[:\-]\s*(?:speaking|active speaker)$/i
    ];

    for (const pattern of directPatterns) {
      const match = value.match(pattern);
      if (match && isLikelyName(match[1])) {
        return normalizeText(match[1]);
      }
    }

    if (isLikelyName(value)) {
      return value;
    }

    return '';
  }

  function pickCandidateText(element) {
    if (!element) {
      return '';
    }

    const values = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.dataset?.displayName,
      element.dataset?.username,
      element.textContent,
      element.parentElement?.getAttribute('aria-label'),
      element.parentElement?.getAttribute('title'),
      element.closest('[aria-label]')?.getAttribute('aria-label'),
      element.closest('[title]')?.getAttribute('title')
    ];

    for (const candidate of values) {
      const speaker = extractSpeakerLabel(candidate);
      if (speaker) {
        return speaker;
      }
    }

    return '';
  }

  function findNameInSubtree(root) {
    if (!root || !root.querySelectorAll) {
      return '';
    }

    const selector = NAME_NODE_SELECTORS.join(',');
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
      const speaker = pickCandidateText(node);
      if (speaker) {
        return speaker;
      }
    }

    return '';
  }

  function findSpeakerFromElement(element) {
    if (!element) {
      return '';
    }

    const direct = pickCandidateText(element);
    if (direct) {
      return direct;
    }

    let depth = 0;
    let current = element;
    while (current && depth < 6) {
      const nearby = findNameInSubtree(current);
      if (nearby) {
        return nearby;
      }
      current = current.parentElement;
      depth += 1;
    }

    return '';
  }

  function findActiveSpeaker() {
    const candidates = new Set();

    SPEAKING_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => candidates.add(element));
    });

    document.querySelectorAll('[class*="speaker-active" i], [class*="current-speaker" i], [class*="is-speaking" i], [aria-label*="is speaking" i], [aria-label*="active speaker" i]').forEach((element) => {
      candidates.add(element);
    });

    for (const element of candidates) {
      const speaker = findSpeakerFromElement(element);
      if (speaker) {
        return speaker;
      }
    }

    const fallbackRoots = document.querySelectorAll('[role="listitem"], [role="button"], [data-testid*="participant" i], [class*="participant" i], [class*="video" i]');
    for (const root of fallbackRoots) {
      const speaker = findSpeakerFromElement(root);
      if (speaker) {
        return speaker;
      }
    }

    return '';
  }

  function publishSpeaker(speaker) {
    const nextSpeaker = normalizeText(speaker);
    if (!nextSpeaker || nextSpeaker === state.lastSpeaker) {
      return;
    }

    state.lastSpeaker = nextSpeaker;
    state.lastUpdatedAt = Date.now();

    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'ZOOM_SPEAKER_CHANGED',
        speaker: nextSpeaker,
        url: window.location.href,
        title: document.title,
        source: 'zoom-dom'
      }, () => {
        if (chrome.runtime.lastError) {
          return;
        }
      });
    }
  }

  function scanForSpeaker() {
    const speaker = findActiveSpeaker();
    if (speaker) {
      publishSpeaker(speaker);
    }
  }

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== 'GET_ZOOM_ACTIVE_SPEAKER') {
        return false;
      }

      const detectedSpeaker = findActiveSpeaker() || state.lastSpeaker || '';
      if (detectedSpeaker) {
        publishSpeaker(detectedSpeaker);
      }

      sendResponse({
        speaker: state.lastSpeaker,
        updatedAt: state.lastUpdatedAt
      });

      return true;
    });
  }

  function scheduleScan() {
    if (state.scheduled) {
      return;
    }

    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      scanForSpeaker();
    });
  }

  function startObserver() {
    const root = document.body || document.documentElement;
    if (!root) {
      return;
    }

    const observer = new MutationObserver(scheduleScan);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });

    document.addEventListener('visibilitychange', scanForSpeaker, true);
    window.addEventListener('focus', scanForSpeaker, true);

    window.setInterval(scanForSpeaker, 1500);
    scanForSpeaker();

    return observer;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();