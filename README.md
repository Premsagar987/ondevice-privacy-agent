# PrivacyShield

PrivacyShield is a Chrome extension demo that helps a browser agent work with sensitive pages without sending the original screenshot to the reasoning service.

The project was built for SIH 26171. Its main idea is simple: inspect and protect information in the browser first, then send only the protected result and a structured task context to the backend.

## What It Does

1. The extension captures the visible browser tab.
2. The page content script finds likely sensitive fields and displayed values locally.
3. The local redaction engine hides detected regions and blurs known face or avatar regions.
4. The backend receives the protected screenshot and returns a structured browser action.
5. The extension performs that action on the page and shows the result in the side panel.

The demo uses synthetic banking data. It is not connected to a real bank.

## Project Layout

```text
ondevice-privacy-agent/
├── privacy-shield/
│   ├── backend/              FastAPI reasoning and audit service
│   ├── demo-page/            Synthetic banking page and privacy walkthrough
│   └── extension/            Chrome Manifest V3 extension
└── README.md
```

The detailed implementation notes are in [privacy-shield/README.md](privacy-shield/README.md) and [privacy-shield/PRIVACY_PIPELINE.md](privacy-shield/PRIVACY_PIPELINE.md).

## Run It Locally

### 1. Start the backend

```powershell
cd privacy-shield\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python server.py
```

The backend runs at http://localhost:8000.

Check it at http://localhost:8000/api/health.

### 2. Start the demo page

Open a second terminal:

```powershell
cd privacy-shield\demo-page
python -m http.server 3000
```

Open the banking demo at http://localhost:3000.

The judge-friendly visual explanation is at http://localhost:3000/privacy-flow.html.

### 3. Load the extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `privacy-shield\extension` folder.
5. Reload the extension after changing extension files.

## Demo Walkthrough

1. Open http://localhost:3000.
2. Open the PrivacyShield side panel.
3. Click **Protect this page** to see the local redaction preview.
4. Compare **Protected version** with **Original page**.
5. Choose a sample task and click **Start task**.
6. Watch the activity log as the extension captures, protects, asks the backend for an action, and updates the demo page.

## What Is Implemented Today

- DOM field detection for common sensitive form fields.
- Regex detection for email, phone, Aadhaar-shaped, PAN-shaped, card-shaped, account, currency, IFSC, and customer-ID-shaped values.
- Semantic protection for demo blocks such as profile details, PII cards, balances, and card panels.
- Native browser `FaceDetector` when available.
- A lightweight local skin-colour heuristic as a fallback.
- Canvas redaction before the screenshot is sent to the backend.
- FastAPI structured action responses.
- A deterministic fallback planner when no Gemini key or image is provided.
- SQLite audit records containing metadata only: event, counts, status, and timestamp.

## Important Limitations

This is a working research demo, not a production security product.

- There is no Tesseract OCR or MediaPipe model bundled in this repository. Text protection currently uses DOM inspection and regular expressions.
- Face detection is strongest for known avatar/profile elements. The browser face API and colour heuristic can miss faces in arbitrary photographs.
- Free-text names and unknown personal identifiers are not reliably detected unless they are inside a known sensitive block.
- The extension currently requests `<all_urls>` access. That is convenient for a demo but broader than necessary for a production release.
- The task description and action history can contain values typed by the user. Do not use real credentials or real banking data.
- High-risk actions are demo actions and do not have a production-grade approval or transaction safety flow.
- The backend CORS policy is open for local development and must be restricted before deployment.
- The local audit database is metadata-only, but it is not a full compliance logging system.

## Security Rule

Never place real passwords, API keys, bank information, or personal documents in the demo. Keep `.env` files and `*.db` files out of Git.

## Repository

https://github.com/Premsagar987/ondevice-privacy-agent
