/**
 * PrivacyShield - Side Panel Controller
 * SIH 26171: On-device Visual Perception for Light-weight Browser Agents
 * 
 * Orchestrates on-device redaction, Before/After preview rendering,
 * and autonomous multi-turn loops communicating with FastAPI backend (port 8000).
 */

const BACKEND_URL = "http://localhost:8000/api/analyze";

let agentState = {
  isRunning: false,
  shouldAbort: false,
  currentStep: 0,
  maxSteps: 8,
  actionHistory: [],
  lastRedaction: null
};

// UI Elements
const captureBtn = document.getElementById("captureRedactBtn");
const previewCard = document.getElementById("previewCard");
const previewImage = document.getElementById("previewImage");
const tabRedacted = document.getElementById("tabRedacted");
const tabOriginal = document.getElementById("tabOriginal");
const previewTag = document.getElementById("previewTag");

const taskInput = document.getElementById("taskInput");
const startAgentBtn = document.getElementById("startAgentBtn");
const stopAgentBtn = document.getElementById("stopAgentBtn");
const agentStatusBadge = document.getElementById("agentStatusBadge");

const metricDomPii = document.getElementById("metricDomPii");
const metricFaces = document.getElementById("metricFaces");
const metricLatency = document.getElementById("metricLatency");
const metricLeakage = document.getElementById("metricLeakage");
const logList = document.getElementById("logList");

function log(text) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const item = document.createElement("div");
  item.className = "log-item";
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = timeStr;
  const message = document.createElement("span");
  message.className = "log-text";
  message.textContent = text;
  item.append(time, message);
  logList.prepend(item);
}

function updateTelemetry(piiCount, facesCount, latencyMs) {
  metricDomPii.textContent = String(piiCount);
  metricFaces.textContent = String(facesCount);
  metricLatency.textContent = `${latencyMs} ms`;
  metricLeakage.textContent = "0 Bytes";
}

function setStatus(statusText, badgeClass) {
  agentStatusBadge.textContent = statusText;
  agentStatusBadge.className = `status-badge ${badgeClass}`;
}

// Preset chips click
document.querySelectorAll(".preset-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    taskInput.value = chip.getAttribute("data-task") || "";
  });
});

// Toggle between Redacted and Original views
tabRedacted.addEventListener("click", () => {
  if (!agentState.lastRedaction) return;
  tabRedacted.classList.add("active");
  tabOriginal.classList.remove("active");
  previewImage.src = agentState.lastRedaction.redactedBase64;
  previewTag.textContent = "Protected version";
  previewTag.style.color = "#34d399";
});

tabOriginal.addEventListener("click", () => {
  if (!agentState.lastRedaction) return;
  tabOriginal.classList.add("active");
  tabRedacted.classList.remove("active");
  previewImage.src = agentState.lastRedaction.originalBase64;
  previewTag.textContent = "Original (Private)";
  previewTag.style.color = "#f87171";
});

/**
 * Capture active tab and run full on-device visual redaction pipeline.
 */
async function captureAndRedact() {
  log("Capturing active viewport...");
  setStatus("Scanning", "running");

  try {
    // 1. Capture tab via background service worker
    const captureRes = await chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" });
    if (!captureRes || !captureRes.success) {
      throw new Error(captureRes?.error || "Failed to capture active tab screenshot");
    }

    const { dataUrl, tabId } = captureRes;

    // 2. Query page DOM for sensitive fields, text PII, and avatar elements
    const piiData = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_PII_REGIONS" }, (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve({ regions: [], viewport: null });
        } else {
          resolve(res);
        }
      });
    });

    log(`Perception: ${piiData.regions.length} DOM regions detected.`);

    // 3. Run ScreenRedactor locally in sidepanel
    const redaction = await window.PrivacyEngine.ScreenRedactor.redact(
      dataUrl,
      piiData.regions,
      piiData.viewport
    );

    agentState.lastRedaction = redaction;

    // 4. Update UI
    previewCard.classList.remove("hidden");
    previewImage.src = redaction.redactedBase64;
    tabRedacted.classList.add("active");
    tabOriginal.classList.remove("active");
    previewTag.textContent = "Protected version";

    updateTelemetry(redaction.domPiiCount, redaction.facesCount, redaction.latencyMs);
    log(`Redacted: ${redaction.domPiiCount} PII fields blacked out, ${redaction.facesCount} faces blurred in ${redaction.latencyMs}ms.`);
    if (!agentState.isRunning) {
      setStatus("Idle", "idle");
    }

    return { ...redaction, tabId };
  } catch (err) {
    log(`Error: ${err.message}`);
    setStatus("Error", "idle");
    throw err;
  }
}

captureBtn.addEventListener("click", () => {
  captureAndRedact().catch(() => {});
});

/**
 * Autonomous Multi-Turn Agent Loop
 */
async function runAutonomousLoop() {
  const task = taskInput.value.trim();
  if (!task) {
    alert("Please enter an agent goal or select a preset.");
    return;
  }

  agentState.isRunning = true;
  agentState.shouldAbort = false;
  agentState.currentStep = 0;
  agentState.actionHistory = [];

  startAgentBtn.classList.add("hidden");
  stopAgentBtn.classList.remove("hidden");
  setStatus("Running", "running");
  log(`Started agent: "${task}"`);

  try {
    while (agentState.currentStep < agentState.maxSteps) {
      if (agentState.shouldAbort) {
        log("Agent paused by user.");
        break;
      }

      agentState.currentStep++;
      const step = agentState.currentStep;
      log(`[Step ${step}] Capturing and redacting on-device...`);

      // 1. Capture and redact locally
      const redactResult = await captureAndRedact();
      const tabId = redactResult.tabId;

      if (agentState.shouldAbort) break;

      // 2. Fetch sanitized DOM excerpt
      const domSnapshot = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "GET_DOM_SNAPSHOT" }, (res) => {
          resolve(res || {});
        });
      });

      // 3. Send ONLY sanitized screenshot + sanitized DOM to FastAPI backend (Port 8000)
      log(`[Step ${step}] Consulting Cloud VLM (Gemini 2.0 Flash)...`);
      let analysisRes;
      try {
        analysisRes = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_base64: redactResult.redactedBase64,
            dom_snapshot: domSnapshot,
            task_description: task,
            redaction_manifest: redactResult.manifest,
            action_history: agentState.actionHistory,
            current_step: step,
            max_steps: agentState.maxSteps
          })
        });
      } catch (netErr) {
        throw new Error("Cannot connect to FastAPI backend at http://localhost:8000. Ensure 'python server.py' is running in backend/");
      }

      if (!analysisRes.ok) {
        const errText = await analysisRes.text();
        throw new Error(`Backend error (${analysisRes.status}): ${errText}`);
      }

      const action = await analysisRes.json();
      log(`[Step ${step}] Planned: ${action.description || action.action}`);

      // Check if task is finished
      if (action.action === "finish") {
        log(`✓ Task completed: ${action.description || "Goal satisfied!"}`);
        setStatus("Done", "done");
        break;
      }

      if (agentState.shouldAbort) break;

      // 4. Execute action on live page with visual overlay
      const execResult = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "EXECUTE_ACTION", action }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, message: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { success: false, message: "The page did not respond." });
        });
      });

      if (!execResult.success) {
        throw new Error(execResult.message || "The page could not complete the requested action.");
      }

      agentState.actionHistory.push({
        step,
        action: action.action,
        target: action.target_selector,
        value: action.value,
        description: action.description,
        timestamp: Date.now()
      });

      // Brief settling pause
      await new Promise((r) => setTimeout(r, 450));
    }

    if (agentState.currentStep >= agentState.maxSteps && agentState.isRunning) {
      log(`Reached maximum step limit (${agentState.maxSteps}).`);
      setStatus("Finished", "done");
    }
  } catch (loopErr) {
    log(`Agent error: ${loopErr.message}`);
    setStatus("Error", "idle");
  } finally {
    agentState.isRunning = false;
    startAgentBtn.classList.remove("hidden");
    stopAgentBtn.classList.add("hidden");
  }
}

startAgentBtn.addEventListener("click", runAutonomousLoop);

stopAgentBtn.addEventListener("click", () => {
  agentState.shouldAbort = true;
  agentState.isRunning = false;
  log("Aborting agent loop...");
  setStatus("Stopping", "idle");
});
