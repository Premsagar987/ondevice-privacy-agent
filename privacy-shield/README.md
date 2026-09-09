# PrivacyShield

PrivacyShield is a Chrome Manifest V3 extension and FastAPI demo for privacy-aware browser automation. It is designed around a local privacy boundary: the browser protects the visible page before the reasoning service receives it.

The banking page contains synthetic data only. Do not enter real credentials or personal information.

## The Flow

```text
Browser page
    -> local DOM and visual detection
    -> local screenshot redaction
    -> protected screenshot and structured context
    -> FastAPI action planner
    -> local action execution
```

The extension performs detection and redaction in the browser. The backend returns actions such as click, type, scroll, wait, navigate, or finish.

## Start the Demo

### Backend

From this directory:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python server.py
```

The backend listens on http://localhost:8000.

Useful endpoints:

- http://localhost:8000/ - service information
- http://localhost:8000/api/health - health and model configuration
- `POST /api/analyze` - protected screenshot reasoning
- `POST /api/audit` - metadata-only audit event

The backend uses `GEMINI_API_KEY` and `GEMINI_MODEL` from `.env` when configured. Without a key or image, the demo uses its deterministic local fallback planner.

### Demo page

Open a second terminal:

```powershell
cd demo-page
python -m http.server 3000
```

Open:

- http://localhost:3000 - synthetic banking page
- http://localhost:3000/privacy-flow.html - animated privacy explanation for judges

### Chrome extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder's `extension` directory.
5. Click the extension icon to open the side panel.
6. Reload the extension after changing JavaScript or CSS files.

## How To Test

1. Open the banking demo.
2. Click **Protect this page** in the side panel.
3. Check that the protected preview covers the synthetic profile, account, contact, balance, and card information.
4. Select a sample task such as transfer, KYC, or card bill.
5. Click **Start task** and watch the activity log.
6. Stop the task if needed with **Stop task**.

## Detection And Redaction

The current implementation combines:

- Sensitive form-field detection based on type, name, ID, label, and autocomplete attributes.
- DOM text patterns for email, phone, Aadhaar-shaped, PAN-shaped, card-shaped, account, currency, IFSC, and customer-ID-shaped values.
- Semantic blocks for profile details, PII cards, balances, and payment-card panels.
- Native browser face detection when available.
- A lightweight local skin-colour heuristic when native face detection is unavailable.
- Canvas masks for text and form information, and blur overlays for face regions.

The capture path waits for fonts and browser rendering to settle, records the exact viewport used for the screenshot, maps CSS coordinates to the captured image dimensions, removes duplicate regions, and clamps masks to the image boundary.

## What The Backend Stores

The SQLite audit database is created at `backend/privacy_audit.db`. It stores only:

- Event name
- Number of detected PII regions
- Number of face regions
- Verification status
- Timestamp

It does not accept raw screenshots, names, emails, account values, or face pixels. The database is ignored by Git using `*.db`.

## Known Weak Points

The following limitations are deliberate and should be included in any project presentation:

- The repository does not bundle OCR or a trained face model. DOM and regex detection cannot find every personal value in arbitrary page images or canvas content.
- Browser face detection is not guaranteed on every Chrome installation. The fallback heuristic can miss faces and can also produce false positives.
- Free-text names and unfamiliar ID formats are difficult to identify without a local OCR or NER model.
- `<all_urls>` permissions are wider than a production extension needs.
- The backend allows all CORS origins for local development.
- The demo planner can return typed values for synthetic tasks. A production version must use a local vault or explicit user confirmation for secrets and high-risk actions.
- The Gemini model name is configurable. Documentation should not assume a specific model when `.env` overrides it.
- This is a local demonstration. It has not been benchmarked across arbitrary websites, iframes, shadow DOM, or multiple tabs.

## Files Worth Knowing

- `extension/content/content.js` - local DOM detection, sanitization, and action execution.
- `extension/sidepanel/privacy-engine.js` - screenshot redaction and face detection.
- `extension/sidepanel/sidepanel.js` - capture, backend request, and agent loop.
- `extension/background/service-worker.js` - stable capture preparation and screenshot capture.
- `backend/server.py` - FastAPI endpoints, fallback planner, Gemini integration, and audit database.
- `demo-page/privacy-flow.html` - visual explanation of the privacy boundary.

## GitHub

https://github.com/Premsagar987/ondevice-privacy-agent
