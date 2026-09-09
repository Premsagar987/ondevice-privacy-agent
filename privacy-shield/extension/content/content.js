/**
 * PrivacyShield - Content Script (Manifest V3)
 * Runs in the context of the active web page.
 * - Detects DOM PII elements and bounding boxes locally
 * - Generates sanitized DOM snapshots (zero personal data leakage)
 * - Executes agent actions (click, type, scroll, navigate) with visual feedback overlay
 */

(() => {
  if (window.__privacyShieldInjected) return;
  window.__privacyShieldInjected = true;

  const SENSITIVE_KEYWORDS = [
    "card", "ssn", "pan", "cvv", "dob", "address", "credit",
    "pin", "phone", "pass", "account", "routing", "iban", "swift",
    "aadhaar", "beneficiary", "secret"
  ];

  // Regex patterns for text nodes
  const PII_REGEXES = {
    aadhaar: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    pan: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    phone: /(?:\+91[\-\s]?)?[6-9]\d{9}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g
  };

  /**
   * Generates a unique CSS selector for a given DOM element.
   */
  function generateSelector(el) {
    if (!el || !(el instanceof Element)) return "body";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const name = el.getAttribute("name");
    if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;
    const classes = el.className ? String(el.className).split(/\s+/).filter(Boolean) : [];
    if (classes.length) {
      return `${el.tagName.toLowerCase()}.${classes[0]}`;
    }
    return el.tagName.toLowerCase();
  }

  function isSensitiveField(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.matches('input[type="password"], input[type="email"], input[type="tel"]')) {
      return true;
    }
    const text = [
      el.name,
      el.id,
      el.getAttribute("placeholder"),
      el.getAttribute("autocomplete"),
      el.getAttribute("aria-label")
    ].filter(Boolean).join(" ").toLowerCase();

    return SENSITIVE_KEYWORDS.some((kw) => text.includes(kw));
  }

  /**
   * Scans live page for sensitive form fields and records client bounding boxes.
   */
  function detectFormPii() {
    const findings = [];
    const elements = document.querySelectorAll('input, textarea, select');

    elements.forEach((el) => {
      if (!isSensitiveField(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      findings.push({
        type: "dom_field",
        category: "form_field",
        selector: generateSelector(el),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        label: el.getAttribute("aria-label") || el.name || el.id || el.placeholder || "Sensitive field"
      });
    });

    return findings;
  }

  /**
   * Scans visible text nodes for PII patterns (Aadhaar, PAN, phone, email, card).
   */
  function detectTextNodePii() {
    const findings = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;

    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || text.trim().length < 4) continue;
      const parent = node.parentElement;
      if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") continue;

      for (const [category, regex] of Object.entries(PII_REGEXES)) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
          try {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const rangeRects = [...range.getClientRects()];
            const rect = rangeRects[0] || range.getBoundingClientRect();
            const container = parent.closest(".pii-value, .balance-box, [data-visual-pii]");
            const containerRect = container?.getBoundingClientRect();
            const useContainer = containerRect && containerRect.width > 0 && containerRect.height > 0 &&
              containerRect.width <= window.innerWidth * 0.8 && containerRect.height <= 120;

            if (rect.width > 0 && rect.height > 0) {
              const targetRect = useContainer ? containerRect : rect;
              findings.push({
                type: "dom_text",
                category,
                x: Math.round(targetRect.left),
                y: Math.round(targetRect.top),
                width: Math.round(targetRect.width),
                height: Math.round(targetRect.height),
                label: `PII (${category.toUpperCase()})`
              });
            }
          } catch (e) {
            // Range creation error ignore
          }
        }
      }
    }
    return findings.filter((finding, index, all) => all.findIndex((other) =>
      other.category === finding.category &&
      other.x === finding.x && other.y === finding.y &&
      other.width === finding.width && other.height === finding.height
    ) === index);
  }

  /**
   * Scans for face/avatar regions in DOM (images, SVGs with profile hints, classes).
   */
  function detectAvatarRegions() {
    const findings = [];
    const selectors = [
      'img[src*="avatar"]',
      'img[src*="profile"]',
      'img[alt*="avatar" i]',
      'img[alt*="profile" i]',
      'img[alt*="face" i]',
      'svg[data-face]',
      '[data-visual-pii]',
      ".user-avatar",
      ".avatar",
      '[class*="avatar"]',
      '[class*="profile-pic"]',
      '[class*="user-photo"]'
    ];

    document.querySelectorAll(selectors.join(", ")).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 20 && rect.height >= 20 && rect.width <= 500 && rect.height <= 500) {
        findings.push({
          type: "vision_face",
          category: "face_avatar",
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          label: el.getAttribute("alt") || el.getAttribute("aria-label") || "User Face / Avatar"
        });
      }
    });

    return findings;
  }

  /**
   * Sanitizes DOM tree before sending text excerpt to cloud.
   */
  function sanitizeDomTree() {
    try {
      const clone = document.body.cloneNode(true);

      // Strip sensitive form values
      clone.querySelectorAll('input, textarea, select').forEach((el) => {
        if (isSensitiveField(el) || el.value) {
          el.setAttribute("value", "[REDACTED]");
          el.textContent = "[REDACTED]";
        }
      });

      // Strip dangerous or bloat tags
      clone.querySelectorAll('script, style, link, noscript, iframe').forEach((el) => el.remove());

      // Replace visible text PII too; form-value replacement alone is not enough.
      const textWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let textNode;
      while ((textNode = textWalker.nextNode())) textNodes.push(textNode);
      textNodes.forEach((node) => {
        let safeText = node.nodeValue || "";
        for (const regex of Object.values(PII_REGEXES)) {
          regex.lastIndex = 0;
          safeText = safeText.replace(regex, "[REDACTED]");
        }
        node.nodeValue = safeText;
      });

      const rawHtml = clone.innerHTML;
      const snippet = rawHtml.replace(/\s+/g, " ").slice(0, 8000);

      return {
        title: document.title,
        url: `${window.location.origin}${window.location.pathname}`,
        htmlSnippet: snippet
      };
    } catch (e) {
      return {
        title: document.title,
        url: window.location.href,
        htmlSnippet: "Failed to sanitize DOM"
      };
    }
  }

  /**
   * Visual feedback: highlights element and shows HUD badge.
   */
  let toastEl = null;
  function showVisualOverlay(el, description) {
    // Clear previous highlight
    document.querySelectorAll(".privacyshield-target-highlight").forEach((e) => {
      e.classList.remove("privacyshield-target-highlight");
    });
    document.querySelectorAll(".privacyshield-action-badge").forEach((e) => e.remove());

    if (el && el instanceof Element) {
      el.classList.add("privacyshield-target-highlight");
      const badge = document.createElement("div");
      badge.className = "privacyshield-action-badge";
      badge.textContent = `🛡️ ${description || "Agent Action"}`;
      el.parentElement?.insertBefore(badge, el);

      setTimeout(() => {
        el.classList.remove("privacyshield-target-highlight");
        badge.remove();
      }, 1500);
    }

    // In-page toast
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "privacyshield-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<span class="privacyshield-toast-shield">🛡️</span><span>${description || "PrivacyShield Executing Action"}</span>`;
    toastEl.classList.remove("hidden");

    setTimeout(() => {
      if (toastEl) toastEl.classList.add("hidden");
    }, 2000);
  }

  /**
   * Executes structured action returned from VLM.
   */
  async function executeAction(action) {
    const { action: type, target_selector, value, pixels, url, ms } = action;

    let targetElement = null;
    if (target_selector) {
      try {
        targetElement = document.querySelector(target_selector);
      } catch (e) {
        console.warn("[PrivacyShield Content] Invalid selector:", target_selector);
      }
    }

    showVisualOverlay(targetElement, action.description);

    switch (type) {
      case "click":
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          await new Promise((r) => setTimeout(r, 150));
          targetElement.click();
          return { success: true, message: `Clicked ${target_selector}` };
        }
        return { success: false, message: `Element not found: ${target_selector}` };

      case "type":
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          targetElement.focus();
          targetElement.value = value || "";
          targetElement.dispatchEvent(new Event("input", { bubbles: true }));
          targetElement.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, message: `Typed value into ${target_selector}` };
        }
        return { success: false, message: `Target not found for typing: ${target_selector}` };

      case "scroll":
        window.scrollBy({ top: pixels || 350, behavior: "smooth" });
        return { success: true, message: `Scrolled viewport by ${pixels || 350}px` };

      case "navigate":
        if (url) {
          window.location.href = url;
          return { success: true, message: `Navigating to ${url}` };
        }
        return { success: false, message: "No URL provided for navigation" };

      case "wait":
        await new Promise((r) => setTimeout(r, ms || 1000));
        return { success: true, message: `Waited for ${ms || 1000}ms` };

      case "finish":
        return { success: true, message: "Task completed successfully" };

      default:
        return { success: false, message: `Unknown action type: ${type}` };
    }
  }

  // Runtime message listener
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.type === "PING") {
      sendResponse({ pong: true });
      return true;
    }

    if (req.type === "GET_PAGE_PII_REGIONS") {
      const forms = detectFormPii();
      const texts = detectTextNodePii();
      const avatars = detectAvatarRegions();
      const regions = [...forms, ...texts, ...avatars].filter((region, index, all) => all.findIndex((other) =>
        other.type === region.type &&
        other.x === region.x && other.y === region.y &&
        other.width === region.width && other.height === region.height
      ) === index);
      sendResponse({
        regions,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });
      return true;
    }

    if (req.type === "PREPARE_CAPTURE") {
      (async () => {
        if (document.fonts?.ready) await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        sendResponse({
          ready: true,
          viewport: {
            width: window.visualViewport?.width || window.innerWidth,
            height: window.visualViewport?.height || window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
            scrollX: window.scrollX,
            scrollY: window.scrollY
          }
        });
      })();
      return true;
    }

    if (req.type === "GET_DOM_SNAPSHOT") {
      sendResponse(sanitizeDomTree());
      return true;
    }

    if (req.type === "EXECUTE_ACTION") {
      executeAction(req.action).then((res) => sendResponse(res));
      return true;
    }

    return false;
  });
})();
