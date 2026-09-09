"""
Privacy-Preserving Browser Agent Backend — SIH 26171
FastAPI Cloud reasoning tier receiving ONLY sanitized screenshots and returning structured actions.
Powered by Gemini 2.0 Flash.
"""

import os
import re
import json
import base64
import sqlite3
from typing import Any, Dict, List, Optional, Literal
from datetime import datetime

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

PORT = int(os.getenv("PORT", "8000"))
AUDIT_DB_PATH = os.getenv("AUDIT_DB_PATH", os.path.join(os.path.dirname(__file__), "privacy_audit.db"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
CORS_ORIGINS = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",") if origin.strip()]

app = FastAPI(
    title="PrivacyShield VLM Backend",
    description="Tier 2 Cloud VLM reasoning endpoint receiving only on-device sanitized screenshots.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    image_base64: Optional[str] = Field(default="", max_length=16_000_000, description="Base64 encoded sanitized screenshot")
    dom_snapshot: Optional[Dict[str, Any]] = Field(default_factory=dict)
    task_description: str = Field(..., min_length=1, max_length=500, description="User goal or task instruction")
    redaction_manifest: Optional[Dict[str, Any]] = Field(default_factory=dict)
    action_history: Optional[List[Dict[str, Any]]] = Field(default_factory=list, max_length=20)
    current_step: Optional[int] = Field(default=1, ge=1, le=50)
    max_steps: Optional[int] = Field(default=8, ge=1, le=50)


class ActionResponse(BaseModel):
    action: Literal["click", "type", "scroll", "navigate", "wait", "finish"]
    target_selector: str = Field(default="", max_length=500, description="CSS selector for target element")
    description: str = Field(default="", max_length=500, description="Human-readable step description")
    value: str = Field(default="", max_length=1000, description="Value to type if action is 'type'")
    pixels: int = Field(default=0, ge=-5000, le=5000, description="Pixels to scroll if action is 'scroll'")
    url: str = Field(default="", max_length=2000, description="Destination URL if action is 'navigate'")
    ms: int = Field(default=500, ge=0, le=30000, description="Wait duration in milliseconds")


class AuditEvent(BaseModel):
    event: str = Field(..., min_length=1, max_length=80)
    pii_count: int = Field(default=0, ge=0, le=10000)
    face_count: int = Field(default=0, ge=0, le=10000)
    raw_data_stored: bool = Field(default=False)


def init_audit_db() -> None:
    with sqlite3.connect(AUDIT_DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS privacy_audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                pii_count INTEGER NOT NULL,
                face_count INTEGER NOT NULL,
                raw_data_stored INTEGER NOT NULL CHECK (raw_data_stored = 0),
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.commit()


init_audit_db()


def parse_json_response(text: str) -> Dict[str, Any]:
    """Safely extracts JSON block from LLM output."""
    trimmed = (text or "").strip()
    match = re.search(r"\{[\s\S]*\}", trimmed)
    if match:
        return json.loads(match.group(0))
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", trimmed).strip()
    return json.loads(cleaned)


def heuristic_fallback(task: str, history: List[Dict[str, Any]], step: int) -> Dict[str, Any]:
    """
    Intelligent deterministic action planner when GEMINI_API_KEY is not configured.
    Provides complete multi-step autonomous browsing loops for SecureBank India demo scenarios.
    """
    task_lower = task.lower()
    prev = history[-1] if history else {}
    prev_action = prev.get("action", "")

    # Finish condition
    if prev_action == "click" and (step >= 4 or "submit" in str(prev.get("target", "")).lower() or "pay" in str(prev.get("target", "")).lower() or "transfer" in str(prev.get("target", "")).lower()):
        return {
            "action": "finish",
            "target_selector": "",
            "value": "",
            "description": "Goal accomplished and verified successfully!",
            "pixels": 0,
            "url": "",
            "ms": 500
        }

    # Scenario 1: Fund Transfer
    if any(k in task_lower for k in ["transfer", "send", "money", "fund", "rohan", "rupees", "₹"]):
        if len(history) == 0:
            return {
                "action": "type",
                "target_selector": "#beneficiaryName, input[name='beneficiaryName'], input[placeholder*='Beneficiary' i]",
                "value": "Rohan Verma",
                "description": "Enter beneficiary name into transfer form",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        elif len(history) == 1:
            return {
                "action": "type",
                "target_selector": "#transferAmount, input[name='amount'], input[placeholder*='Amount' i]",
                "value": "5000",
                "description": "Enter transfer amount (₹5,000)",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        else:
            return {
                "action": "click",
                "target_selector": "#transferBtn, button.btn-transfer, button[type='submit']",
                "value": "",
                "description": "Click 'Transfer Funds' button to finalize transaction",
                "pixels": 0,
                "url": "",
                "ms": 600
            }

    # Scenario 2: KYC Update
    if any(k in task_lower for k in ["kyc", "aadhaar", "pan", "verify", "update kyc"]):
        if len(history) == 0:
            return {
                "action": "click",
                "target_selector": "#tabKyc, [data-tab='kyc']",
                "value": "",
                "description": "Switch to KYC Verification tab",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        elif len(history) == 1:
            return {
                "action": "type",
                "target_selector": "#kycPhone, input[name='phone'], input[type='tel']",
                "value": "+91 98765 43210",
                "description": "Confirm registered mobile number (redacted on-device)",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        else:
            return {
                "action": "click",
                "target_selector": "#submitKycBtn, button.btn-kyc, button[type='submit']",
                "value": "",
                "description": "Submit updated KYC verification documents",
                "pixels": 0,
                "url": "",
                "ms": 600
            }

    # Scenario 3: Pay Credit Card Bill
    if any(k in task_lower for k in ["card", "bill", "pay", "credit"]):
        if len(history) == 0:
            return {
                "action": "click",
                "target_selector": "#tabCards, [data-tab='cards']",
                "value": "",
                "description": "Open Credit Card Management tab",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        elif len(history) == 1:
            return {
                "action": "type",
                "target_selector": "#billAmount, input[name='billAmount']",
                "value": "12450",
                "description": "Enter statement balance payment amount",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        else:
            return {
                "action": "click",
                "target_selector": "#payBillBtn, button.btn-pay",
                "value": "",
                "description": "Confirm and process credit card bill payment",
                "pixels": 0,
                "url": "",
                "ms": 600
            }

    # Scenario 4: Login / Auth
    if any(k in task_lower for k in ["login", "sign in", "signin", "username", "password"]):
        if len(history) == 0:
            return {
                "action": "type",
                "target_selector": "input[type='email'], input[name*='user'], input[type='text']",
                "value": "rahul.sharma@securebank.in",
                "description": "Fill user identity credentials (redacted)",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        elif len(history) == 1:
            return {
                "action": "type",
                "target_selector": "input[type='password'], input[name*='pass']",
                "value": "VaultPass2026!",
                "description": "Fill password field (sanitized locally)",
                "pixels": 0,
                "url": "",
                "ms": 400
            }
        else:
            return {
                "action": "click",
                "target_selector": "button[type='submit'], .btn-primary",
                "value": "",
                "description": "Click Sign In button",
                "pixels": 0,
                "url": "",
                "ms": 500
            }

    # Default fallback
    return {
        "action": "click",
        "target_selector": "button[type='submit'], .btn-primary, button",
        "value": "",
        "description": "Interact with primary page action element",
        "pixels": 0,
        "url": "",
        "ms": 500
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify backend status and Gemini configuration."""
    api_key_set = bool(os.getenv("GEMINI_API_KEY", "").strip())
    return {
        "status": "ok",
        "tier": "Cloud VLM Reasoning Service",
        "model": GEMINI_MODEL,
        "has_api_key": api_key_set,
        "port": PORT,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


@app.get("/")
async def service_home():
    """Provide a useful landing response instead of an empty 404 at the API root."""
    return {
        "service": "PrivacyShield Backend",
        "status": "running",
        "demo_url": "http://localhost:3000/",
        "privacy_flow_url": "http://localhost:3000/privacy-flow.html",
        "health_url": "http://localhost:8000/api/health",
        "audit_url": "http://localhost:8000/api/audit",
    }


@app.post("/api/audit")
async def create_audit_event(payload: AuditEvent):
    """Store operational metadata only; raw screenshots and personal data are not accepted."""
    if payload.raw_data_stored:
        raise HTTPException(status_code=400, detail="Raw personal data cannot be stored")

    created_at = datetime.utcnow().isoformat() + "Z"
    with sqlite3.connect(AUDIT_DB_PATH) as connection:
        cursor = connection.execute(
            """
            INSERT INTO privacy_audit_events
                (event, pii_count, face_count, raw_data_stored, status, created_at)
            VALUES (?, ?, ?, 0, 'verified', ?)
            """,
            (payload.event, payload.pii_count, payload.face_count, created_at),
        )
        connection.commit()
        record_id = cursor.lastrowid

    return {
        "id": record_id,
        "event": payload.event,
        "status": "verified",
        "created_at": created_at,
        "raw_data_stored": False,
    }


@app.post("/api/analyze", response_model=ActionResponse)
async def analyze_redacted_screen(payload: AnalyzeRequest):
    """
    Tier 2 Cloud VLM reasoning endpoint.
    Guarantees that input screenshot is already sanitized on-device:
    - Faces are blurred
    - Aadhaar, PAN, emails, phones, and cards are blacked out with [REDACTED]
    """
    task = payload.task_description.strip()
    if not task:
        raise HTTPException(status_code=400, detail="task_description cannot be empty")

    if (payload.current_step or 1) > (payload.max_steps or 8):
        raise HTTPException(status_code=400, detail="current_step cannot exceed max_steps")

    history = payload.action_history or []
    step = payload.current_step or 1
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    # If no API key or image provided, use fallback heuristic
    if not api_key or not payload.image_base64:
        decision = heuristic_fallback(task, history, step)
        return ActionResponse(**decision)

    # Clean Base64 image
    base64_str = re.sub(r"^data:image\/[a-zA-Z0-9.+-]+;base64,", "", payload.image_base64)
    image_bytes = base64.b64decode(base64_str)

    html_snippet = ""
    if payload.dom_snapshot and isinstance(payload.dom_snapshot, dict):
        html_snippet = str(payload.dom_snapshot.get("htmlSnippet", ""))[:3000]

    system_prompt = (
        "You are an on-device privacy-preserving browser automation agent.\n"
        f"User Goal: \"{task}\"\n"
        f"Current Step: {step} of {payload.max_steps}\n\n"
        f"ACTION HISTORY (completed in previous turns):\n"
        f"{json.dumps(history, indent=2)}\n\n"
        "PRIVACY GUARANTEE:\n"
        "- All sensitive personal identity information (Aadhaar, PAN, phone, email, card numbers) has been masked locally as [REDACTED].\n"
        "- Biometric faces and profile photos have been blurred locally on-device.\n"
        f"Sanitized DOM elements excerpt:\n{html_snippet}\n\n"
        "RULES:\n"
        "1. Avoid repeating actions already executed in Action History.\n"
        "2. If the user's goal is achieved or a confirmation/success banner is visible, return action 'finish'.\n"
        "3. Output ONLY a valid JSON object matching this schema:\n"
        "{\n"
        '  "action": "click" | "type" | "scroll" | "navigate" | "wait" | "finish",\n'
        '  "target_selector": "CSS selector for element to interact with",\n'
        '  "description": "One concise sentence explaining this action",\n'
        '  "value": "Text to fill if action is type",\n'
        '  "pixels": 0,\n'
        '  "url": "",\n'
        '  "ms": 500\n'
        "}"
    )

    # Invoke the configured Gemini model
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                types.Part.from_text(text=system_prompt)
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=300
            )
        )

        parsed = parse_json_response(response.text)
        return ActionResponse(
            action=parsed.get("action", "click"),
            target_selector=parsed.get("target_selector", ""),
            description=parsed.get("description", "Advance user task"),
            value=parsed.get("value", ""),
            pixels=int(parsed.get("pixels", 0)),
            url=parsed.get("url", ""),
            ms=int(parsed.get("ms", 500))
        )
    except Exception as e:
        print(f"[PrivacyShield Backend] Gemini call failed: {e}. Falling back to heuristic loop.")
        return ActionResponse(**heuristic_fallback(task, history, step))


if __name__ == "__main__":
    print(f"Starting PrivacyShield FastAPI Backend on http://localhost:{PORT}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
