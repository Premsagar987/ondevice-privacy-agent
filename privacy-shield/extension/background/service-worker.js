/**
 * PrivacyShield - Background Service Worker (Manifest V3)
 * Handles side panel opening, viewport screenshot capture, and content script injection.
 */

// Enable side panel to open upon clicking the extension action icon
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch((err) => {
  console.warn("[PrivacyShield Service Worker] setPanelBehavior warning:", err);
});

// Tab injection helper
async function ensureContentScriptReady(tabId) {
  try {
    const isAlive = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (!isAlive) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["content/content.css"]
      });
    }
    return true;
  } catch (e) {
    console.warn("[PrivacyShield Service Worker] Injection warning:", e.message);
    return false;
  }
}

async function prepareCapture(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "PREPARE_CAPTURE" }, (res) => {
      if (chrome.runtime.lastError || !res?.ready) {
        resolve(null);
        return;
      }
      resolve(res.viewport || null);
    });
  });
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CAPTURE_ACTIVE_TAB") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          sendResponse({ success: false, error: "No active browser tab found" });
          return;
        }

        if (!await ensureContentScriptReady(tab.id)) {
          sendResponse({ success: false, error: "PrivacyShield could not prepare the page safely." });
          return;
        }

        const viewport = await prepareCapture(tab.id);
        if (!viewport) {
          sendResponse({ success: false, error: "The page was not ready for a stable privacy capture." });
          return;
        }

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId || null, {
          format: "jpeg",
          quality: 90
        });

        sendResponse({ success: true, dataUrl, tabId: tab.id, viewport });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async sendResponse
  }

  return false;
});
