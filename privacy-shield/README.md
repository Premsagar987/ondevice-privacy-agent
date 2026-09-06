# Privacy-Preserving Browser Agent — SIH 26171

> On-device Visual Perception for Light-weight Browser Agents

## Architecture

Split-processing architecture with two tiers:
- **Local (Chrome Extension)**: Screen capture → Local ViT (MediaPipe) → PII Detection (Tesseract OCR + Regex) → Canvas Redaction → Sanitized Screenshot
- **Cloud (FastAPI)**: Receives ONLY sanitized screenshots → Gemini 2.0 Flash VLM reasoning → Structured action commands → Sent back to extension

**Key principle**: Raw PII data NEVER leaves the user's device.

## Project Structure

```
AI Agent/
├── extension/                        # Chrome Extension (Manifest V3)
│   ├── manifest.json                 # Extension config + CSP
│   ├── background/service-worker.js  # Screenshot capture
│   ├── content/content.js            # DOM action executor (click, type, scroll)
│   ├── content/content.css           # Visual feedback overlay
│   └── sidepanel/
│       ├── sidepanel.html            # Side Panel UI
│       ├── sidepanel.js              # Agent loop orchestrator
│       ├── sidepanel.css             # Dark theme styling
│       └── privacy-engine.js         # Core: FaceDetector + TextPIIDetector + ScreenRedactor
├── backend/
│   ├── server.py                     # FastAPI + Gemini 2.0 Flash
│   ├── requirements.txt              # Python deps
│   └── .env.example                  # API key template
└── demo-page/
    └── index.html                    # SecureBank India (fake PII demo page)
```

## Quick Start

### 1. Start the Demo Page
```bash
cd demo-page
python3 -m http.server 3000
```
Open http://localhost:3000

### 2. Start the Backend
```bash
cd backend
cp .env.example .env
# Edit .env → add your GEMINI_API_KEY
pip install -r requirements.txt
python server.py
```
Server runs on http://localhost:8000

### 3. Load the Extension
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon → Side Panel opens

### 4. Test
1. Go to http://localhost:3000 (SecureBank India)
2. Click **"Capture & Redact"** in the Side Panel
3. See before/after: faces blurred, PII blacked out
4. Enter a goal → click **Start Agent** → watch autonomous browsing

## PII Types Detected
- Emails, Phone numbers, SSNs
- Aadhaar numbers, PAN cards (Indian-specific)
- Credit card numbers
- Faces / profile photos

## Tech Stack
| Component | Technology |
|---|---|
| Face Detection | MediaPipe BlazeFace (~230 KB) |
| OCR | Tesseract.js v5 (WASM) |
| PII Matching | Regex patterns |
| Redaction | HTML5 Canvas API |
| Extension | Chrome Manifest V3 + Side Panel |
| Backend | FastAPI (Python) |
| AI Reasoning | Gemini 2.0 Flash |

## 👥 Team Members

| Name | Role | GitHub Profile |
|---|---|---|
| Team Leader | Full Stack / AI Pipeline | [@username](https://github.com/) |
| Teammate 1 | Chrome Extension / Frontend | [@username](https://github.com/) |
| Teammate 2 | Backend & API Integration | [@username](https://github.com/) |
| Teammate 3 | Computer Vision & Testing | [@username](https://github.com/) |

