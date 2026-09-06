# PrivacyShield Privacy Pipeline and Architecture Logic

This document describes the exact privacy-by-design flow used by the PrivacyShield browser agent for SIH 26171.

## 1. User Interaction via Chrome Side Panel

The side panel UI is defined in `extension/sidepanel/sidepanel.html` and orchestrated by `extension/sidepanel/sidepanel.js`.

The user can:
1. Click **"Capture & Redact"** to instantly inspect how the on-device perception engine detects and blurs biometric faces while blacking out text PII before anything is transmitted.
2. Enter an objective (or choose from presets like Fund Transfer, KYC update, or Card Bill Pay) and click **"Start Agent"** to begin autonomous browsing.

## 2. Background Service Worker Coordination

The logic is in `extension/background/service-worker.js`.

The service worker:
1. Configures the extension action click to open the Side Panel (`chrome.sidePanel.setPanelBehavior`).
2. Listens for `CAPTURE_ACTIVE_TAB` from the side panel.
3. Ensures content scripts (`content/content.js`, `content/content.css`) are injected on the target tab.
4. Executes `chrome.tabs.captureVisibleTab` to obtain the raw device viewport screenshot.
5. Returns the data URL to the side panel for strictly local processing.

## 3. On-Device Privacy Engine

The core privacy engine lives in `extension/sidepanel/privacy-engine.js` and works alongside `extension/content/content.js`.

### 3.1 Local Visual Face Perception (`FaceDetector`)
- Tier 1: Hardware-accelerated native Chromium `FaceDetector` API (when supported by the browser engine).
- Tier 2: Real-time skin-tone clustering in YCbCr color space running on HTML5 canvas.
- Tier 3: DOM-level avatar / user portrait element detection (`.user-avatar`, `svg[data-face]`, `img[src*='avatar']`).
- Guarantees biometric facial landmarks never leave the local environment.

### 3.2 Indian & Global Text PII Detection (`TextPIIDetector`)
Detects sensitive fields and page text nodes using strict regex validators:
- **Aadhaar Numbers**: `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`
- **PAN Cards**: `\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b`
- **Indian Mobile Numbers**: `(?:\+91[\-\s]?)?[6-9]\d{9}\b`
- **Email Addresses**: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`
- **Credit / Debit Cards**: `\b(?:\d{4}[-\s]?){3}\d{4}\b`
- **Passwords, SSNs, and PINs**

### 3.3 Pixel-Level Canvas Redaction (`ScreenRedactor`)
1. Draws screenshot onto an offscreen HTML5 `<canvas>`.
2. For all face bounding boxes:
   - Clips canvas path to the bounding rectangle.
   - Applies `ctx.filter = "blur(18px)"` and redraws the image.
   - Overlays a clear `[FACE BLURRED]` security indicator.
3. For all PII form fields and text bounding boxes:
   - Draws a solid black rectangle (`#050505`).
   - Renders a crisp monospace `[REDACTED]` label.
4. Exports only the sanitized Base64 JPEG.

## 4. DOM Sanitization

The `sanitizeDomTree()` function in `extension/content/content.js`:
- Clones `document.body`.
- Replaces all sensitive form inputs, passwords, and PII values with `[REDACTED]`.
- Strips `<script>`, `<style>`, `<iframe>`, and non-essential DOM tags.
- Produces a clean, non-confidential structural snippet.

## 5. Cloud Tier: FastAPI & Gemini 2.0 Flash

The cloud backend is in `backend/server.py` running on port 8000.

Payload sent to `POST /api/analyze`:
```json
{
  "image_base64": "<sanitized screenshot with blurred faces and blacked out PII>",
  "dom_snapshot": { "htmlSnippet": "<sanitized DOM snippet>" },
  "task_description": "Transfer ₹5,000 to Rohan Verma",
  "redaction_manifest": { "faces": 1, "pii": 4, "totalMasked": 5 },
  "action_history": [],
  "current_step": 1,
  "max_steps": 8
}
```

The cloud server:
1. Validates that the input image is already sanitized.
2. Formats a structured multimodal reasoning prompt for **Gemini 2.0 Flash** (`gemini-2.0-flash`).
3. If `GEMINI_API_KEY` is not set, an intelligent deterministic heuristic planner provides complete, end-to-end multi-step flows for demo scenarios.
4. Returns a typed JSON action response:
```json
{
  "action": "click|type|scroll|navigate|wait|finish",
  "target_selector": "#beneficiaryName",
  "description": "Enter beneficiary name into transfer form",
  "value": "Rohan Verma",
  "pixels": 0,
  "url": "",
  "ms": 400
}
```

## 6. Action Execution on Live Page

The side panel sends `EXECUTE_ACTION` to `extension/content/content.js`.
1. Highlights the target DOM element with `.privacyshield-target-highlight` and a glowing badge.
2. Dispatches genuine DOM events (`scrollIntoView`, `focus`, `input`, `change`, `click`).
3. Returns status to the side panel, updates the telemetry card, and records the step in the Activity Log.

## 7. Zero-Leakage Guarantee

At no point in the pipeline does unmasked personal data, unredacted text, or unblurred biometric imagery leave the user's browser.
