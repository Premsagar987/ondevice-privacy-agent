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
  } catch (e) {
    console.warn("[PrivacyShield Service Worker] Injection warning:", e.message);
  }
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

        await ensureContentScriptReady(tab.id);

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId || null, {
          format: "jpeg",
          quality: 90
        });

        sendResponse({ success: true, dataUrl, tabId: tab.id });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async sendResponse
  }

  return false;
});
