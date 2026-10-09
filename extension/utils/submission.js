(function attachApplicationSubmission(globalScope) {
  const STORAGE_KEY = "application-tracker:submission-state";
  const URL_POLL_INTERVAL_MS = 1000;
  const RECENT_SUBMISSION_WINDOW_MS = 2 * 60 * 1000;

  const SUCCESS_LANGUAGE_PATTERNS = [
    /\bapplication\s+(?:has\s+been\s+)?submitted\b/i,
    /\bthank\s+you\s+for\s+applying\b/i,
    /\bthank\s+you\s+for\s+your\s+application\b/i,
    /\bapplication\s+received\b/i,
    /\bwe\s+(?:have\s+)?received\s+your\s+application\b/i,
    /\byour\s+application\s+(?:has\s+been\s+)?received\b/i,
    /\bwe'?ll\s+review\s+your\s+application\b/i,
    /\bapplication\s+complete\b/i,
    /\bsuccessfully\s+(?:submitted|applied)\b/i,
  ];

  const APPLICATION_FORM_PATTERNS = [
    /\bapply\b/i,
    /\bapplication\b/i,
    /\bjob\b/i,
    /\bcareer\b/i,
    /\bcandidate\b/i,
    /\bresume\b/i,
    /\bcv\b/i,
    /\bcover\s+letter\b/i,
    /\blinkedin\b/i,
  ];

  const SUCCESS_ELEMENT_SELECTORS = [
    '[role="alert"]',
    '[role="status"]',
    '[aria-live]',
    '[class*="success" i]',
    '[class*="confirmation" i]',
    '[class*="submitted" i]',
    '[data-testid*="success" i]',
    '[data-testid*="confirmation" i]',
    '[data-qa*="success" i]',
    '[data-qa*="confirmation" i]',
  ];

  const APPLICATION_FORM_SELECTORS = [
    'form[action*="apply" i]',
    'form[action*="application" i]',
    'form[id*="apply" i]',
    'form[id*="application" i]',
    'form[class*="apply" i]',
    'form[class*="application" i]',
    'input[type="file"]',
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
  ];

  const SUBMIT_CONTROL_SELECTOR = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button',
    '[role="button"]',
  ].join(",");

  function createApplicationSubmissionDetector(options = {}) {
    const doc = options.document || globalScope.document;
    const locationLike = options.location || globalScope.location;
    const storage = options.storage || getDefaultStorage(globalScope);
    const metadataProvider =
      options.metadataProvider ||
      (() =>
        globalScope.ApplicationMetadata
          ? globalScope.ApplicationMetadata.extractMetadata(doc, locationLike)
          : {});
    const now = options.now || (() => Date.now());
    const setIntervalFn = options.setInterval || globalScope.setInterval;
    const clearIntervalFn = options.clearInterval || globalScope.clearInterval;
    const onSubmitted = typeof options.onSubmitted === "function" ? options.onSubmitted : null;

    let state = loadState(storage);
    let lastUrl = locationLike && locationLike.href ? locationLike.href : null;
    let observer = null;
    let intervalId = null;
    let lastNotifiedSubmissionKey = getSubmissionNotificationKey(state);

    function start() {
      if (!doc || typeof doc.addEventListener !== "function") {
        return getState();
      }

      doc.addEventListener("submit", handleFormSubmit, true);
      doc.addEventListener("click", handleSubmitClick, true);
      installNavigationListeners();
      startDomObserver();
      checkForConfirmation("initial_scan");

      if (typeof setIntervalFn === "function") {
        intervalId = setIntervalFn(checkForUrlChange, URL_POLL_INTERVAL_MS);
      }

      return getState();
    }

    function stop() {
      if (doc && typeof doc.removeEventListener === "function") {
        doc.removeEventListener("submit", handleFormSubmit, true);
        doc.removeEventListener("click", handleSubmitClick, true);
      }

      if (observer && typeof observer.disconnect === "function") {
        observer.disconnect();
      }

      if (intervalId && typeof clearIntervalFn === "function") {
        clearIntervalFn(intervalId);
      }
    }

    function getState() {
      state = normalizeState(state);
      return state;
    }

    function handleFormSubmit(event) {
      const form = event && event.target ? event.target : null;
      if (isApplicationLikeForm(form, doc)) {
        recordSubmissionAttempt("form_submit", form);
      }
    }

    function handleSubmitClick(event) {
      const target = event && event.target ? event.target : null;
      const submitControl = getClosest(target, SUBMIT_CONTROL_SELECTOR);
      if (!submitControl || !isLikelySubmitControl(submitControl)) {
        return;
      }

      const form = getClosest(submitControl, "form");
      const context = form || getClosest(submitControl, "main,section,article,body");

      if (isApplicationLikeForm(context, doc)) {
        recordSubmissionAttempt("submit_click", context);
      }
    }

    function recordSubmissionAttempt(source, element) {
      const submittedAt = new Date(now()).toISOString();
      const applicationData = metadataProvider() || {};
      const normalizedApplicationData = normalizeApplicationData(applicationData);

      state = {
        status: "pending_confirmation",
        submitted_at: submittedAt,
        confirmed_at: null,
        confirmation_source: null,
        confirmation_text: null,
        original_url: lastUrl,
        current_url: locationLike && locationLike.href ? locationLike.href : lastUrl,
        source,
        company_name: normalizedApplicationData.company_name,
        position: normalizedApplicationData.position,
        application_data: normalizedApplicationData,
      };

      saveState(storage, state);
      checkForConfirmation("submission_recorded", element);
      return state;
    }

    function installNavigationListeners() {
      if (typeof globalScope.addEventListener === "function") {
        globalScope.addEventListener("popstate", () => checkForUrlChange());
        globalScope.addEventListener("hashchange", () => checkForUrlChange());
        globalScope.addEventListener("pageshow", () => checkForConfirmation("page_show"));
      }
    }

    function startDomObserver() {
      const MutationObserverConstructor = globalScope.MutationObserver;
      if (typeof MutationObserverConstructor !== "function" || !doc.body) {
        return;
      }

      observer = new MutationObserverConstructor(() => {
        checkForConfirmation("dom_mutation");
      });
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
      });
    }

    function checkForUrlChange() {
      const currentUrl = locationLike && locationLike.href ? locationLike.href : null;
      if (!currentUrl || currentUrl === lastUrl) {
        return;
      }

      const previousUrl = lastUrl;
      lastUrl = currentUrl;

      if (hasRecentPendingSubmission()) {
        confirmSubmission("url_change", `Navigated from ${previousUrl} to ${currentUrl}`);
      }
    }

    function checkForConfirmation(source, rootElement = doc) {
      if (!hasRecentPendingSubmission()) {
        return state;
      }

      const successSignal = detectSubmissionSuccess(rootElement || doc);
      if (successSignal) {
        confirmSubmission(source || successSignal.source, successSignal.text);
      }

      return state;
    }

    function confirmSubmission(source, confirmationText) {
      state = {
        ...state,
        status: "submitted",
        confirmed_at: new Date(now()).toISOString(),
        confirmation_source: source,
        confirmation_text: normalizeString(confirmationText),
        current_url: locationLike && locationLike.href ? locationLike.href : state.current_url,
      };
      saveState(storage, state);
      notifySubmittedOnce();
      return state;
    }

    function notifySubmittedOnce() {
      if (!onSubmitted) {
        return;
      }

      const submissionKey = getSubmissionNotificationKey(state);
      if (!submissionKey || submissionKey === lastNotifiedSubmissionKey) {
        return;
      }

      lastNotifiedSubmissionKey = submissionKey;
      onSubmitted(normalizeState(state));
    }

    function hasRecentPendingSubmission() {
      const normalizedState = normalizeState(state);
      if (normalizedState.status !== "pending_confirmation") {
        return false;
      }

      const submittedAt = Date.parse(normalizedState.submitted_at);
      return Number.isFinite(submittedAt) && now() - submittedAt <= RECENT_SUBMISSION_WINDOW_MS;
    }

    return {
      start,
      stop,
      getState,
      recordSubmissionAttempt,
      checkForConfirmation,
      checkForUrlChange,
    };
  }

  function detectSubmissionSuccess(rootElement) {
    if (!rootElement) {
      return null;
    }

    const successElement = findSuccessElement(rootElement);
    if (successElement) {
      const text = normalizeString(successElement.textContent) || getAccessibleElementText(successElement);
      return {
        source: "success_element",
        text,
      };
    }

    const text = getRootText(rootElement);
    if (matchesSuccessLanguage(text)) {
      return {
        source: "confirmation_text",
        text: truncateText(text, 180),
      };
    }

    return null;
  }

  function findSuccessElement(rootElement) {
    for (const selector of SUCCESS_ELEMENT_SELECTORS) {
      for (const element of safeQuerySelectorAll(rootElement, selector)) {
        const text = getAccessibleElementText(element);
        if (matchesSuccessLanguage(text)) {
          return element;
        }
      }
    }

    return null;
  }

  function isApplicationLikeForm(element, doc = globalScope.document) {
    if (!element) {
      return false;
    }

    const form = element.tagName && element.tagName.toLowerCase() === "form" ? element : getClosest(element, "form");
    const candidate = form || element;
    const contextText = collectApplicationContext(candidate, doc);
    const matchedTerms = APPLICATION_FORM_PATTERNS.filter((pattern) => pattern.test(contextText)).length;
    const hasApplicationFields = hasApplicationField(candidate);
    const hasSubmitControl = hasSubmitLikeControl(candidate);

    return (hasApplicationFields && matchedTerms >= 1) || (hasSubmitControl && matchedTerms >= 2);
  }

  function collectApplicationContext(element, doc) {
    const parts = [
      getElementAttribute(element, "action"),
      getElementAttribute(element, "id"),
      getElementAttribute(element, "name"),
      getElementAttribute(element, "class"),
      getElementAttribute(element, "aria-label"),
      getElementAttribute(element, "data-testid"),
      getElementAttribute(element, "data-qa"),
      getVisibleText(element),
      doc && doc.title,
    ];

    for (const field of safeQuerySelectorAll(element, "input,textarea,select,button,[role='button']")) {
      parts.push(
        getElementAttribute(field, "name"),
        getElementAttribute(field, "id"),
        getElementAttribute(field, "placeholder"),
        getElementAttribute(field, "aria-label"),
        getElementAttribute(field, "value"),
        normalizeString(field.textContent),
      );
    }

    return normalizeString(parts.filter(Boolean).join(" ")) || "";
  }

  function hasApplicationField(element) {
    return APPLICATION_FORM_SELECTORS.some((selector) => safeQuerySelectorAll(element, selector).length > 0);
  }

  function hasSubmitLikeControl(element) {
    return safeQuerySelectorAll(element, SUBMIT_CONTROL_SELECTOR).some(isLikelySubmitControl);
  }

  function isLikelySubmitControl(element) {
    const text = getAccessibleElementText(element);
    const type = normalizeString(getElementAttribute(element, "type"));

    if (type && type.toLowerCase() === "submit") {
      return true;
    }

    return /\b(submit|apply|send|finish|complete)\b/i.test(text || "");
  }

  function matchesSuccessLanguage(value) {
    const normalized = normalizeString(value);
    return Boolean(normalized && SUCCESS_LANGUAGE_PATTERNS.some((pattern) => pattern.test(normalized)));
  }

  function loadState(storage) {
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }

    try {
      return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY)));
    } catch (_error) {
      return null;
    }
  }

  function saveState(storage, state) {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    } catch (_error) {
      // Ignore unavailable storage; popup messaging still gets in-memory state.
    }
  }

  function normalizeState(rawState) {
    if (!rawState || typeof rawState !== "object") {
      return {
        status: "not_detected",
        submitted_at: null,
        confirmed_at: null,
        confirmation_source: null,
        confirmation_text: null,
        original_url: null,
        current_url: null,
        source: null,
        company_name: null,
        position: null,
        application_data: normalizeApplicationData(null),
      };
    }

    return {
      status: normalizeString(rawState.status) || "not_detected",
      submitted_at: normalizeString(rawState.submitted_at),
      confirmed_at: normalizeString(rawState.confirmed_at),
      confirmation_source: normalizeString(rawState.confirmation_source),
      confirmation_text: normalizeString(rawState.confirmation_text),
      original_url: normalizeString(rawState.original_url),
      current_url: normalizeString(rawState.current_url),
      source: normalizeString(rawState.source),
      company_name: normalizeString(rawState.company_name),
      position: normalizeString(rawState.position),
      application_data: normalizeApplicationData(rawState.application_data),
    };
  }

  function buildFinalApplication(applicationData, options = {}) {
    const normalizedApplicationData = normalizeApplicationData(applicationData);
    const dateApplied =
      normalizeString(options.dateApplied) ||
      formatDateOnly(
        typeof options.today === "function" ? options.today() : new Date(),
      );

    return {
      company_name: normalizedApplicationData.company_name,
      position: normalizedApplicationData.position,
      website_link: normalizedApplicationData.website_link,
      date_posted: normalizeDateOnly(normalizedApplicationData.date_posted),
      date_applied: dateApplied,
      cover_letter_req: normalizedApplicationData.cover_letter_req === true,
      resume_req: normalizedApplicationData.resume_req === true,
      response_status: "Applied",
    };
  }

  function validateFinalApplication(application) {
    const missingFields = [];

    for (const fieldName of ["company_name", "position", "website_link", "date_applied"]) {
      if (!normalizeString(application && application[fieldName])) {
        missingFields.push(fieldName);
      }
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }

  function normalizeApplicationData(applicationData) {
    const rawData = applicationData && typeof applicationData === "object" ? applicationData : {};

    return {
      company_name: normalizeString(rawData.company_name),
      position: normalizeString(rawData.position),
      website_link: normalizeString(rawData.website_link),
      date_posted: normalizeString(rawData.date_posted),
      date_applied: normalizeString(rawData.date_applied),
      cover_letter_req: normalizeBoolean(rawData.cover_letter_req),
      resume_req: normalizeBoolean(rawData.resume_req),
      response_status: normalizeString(rawData.response_status),
    };
  }

  function normalizeDateOnly(value) {
    const normalized = normalizeString(value);
    if (!normalized) {
      return null;
    }

    const dateOnlyMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return normalized;
    }

    return formatDateOnly(date);
  }

  function formatDateOnly(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    return null;
  }

  function getSubmissionNotificationKey(state) {
    const normalizedState = normalizeState(state);
    if (normalizedState.status !== "submitted") {
      return null;
    }

    return [
      normalizedState.submitted_at,
      normalizedState.confirmed_at,
      normalizedState.current_url,
    ]
      .filter(Boolean)
      .join("|");
  }

  function getDefaultStorage(scope) {
    try {
      return scope.sessionStorage;
    } catch (_error) {
      return null;
    }
  }

  function safeQuerySelectorAll(rootElement, selector) {
    try {
      if (!rootElement || typeof rootElement.querySelectorAll !== "function") {
        return [];
      }

      return Array.from(rootElement.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function getClosest(element, selector) {
    if (!element || typeof element.closest !== "function") {
      return null;
    }

    try {
      return element.closest(selector);
    } catch (_error) {
      return null;
    }
  }

  function getElementAttribute(element, attributeName) {
    if (!element || typeof element.getAttribute !== "function") {
      return null;
    }

    return element.getAttribute(attributeName);
  }

  function getVisibleText(element) {
    return truncateText(normalizeString(element && element.textContent), 1200);
  }

  function getRootText(rootElement) {
    if (!rootElement) {
      return null;
    }

    return getVisibleText(rootElement.body || rootElement.documentElement || rootElement);
  }

  function getAccessibleElementText(element) {
    return normalizeString(
      [
        element && element.textContent,
        getElementAttribute(element, "aria-label"),
        getElementAttribute(element, "title"),
        getElementAttribute(element, "value"),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  function truncateText(value, maxLength) {
    const normalized = normalizeString(value);
    if (!normalized || normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 3).trim()}...`;
  }

  function normalizeString(value) {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  const api = {
    createApplicationSubmissionDetector,
    buildFinalApplication,
    detectSubmissionSuccess,
    isApplicationLikeForm,
    matchesSuccessLanguage,
    validateFinalApplication,
  };

  globalScope.ApplicationSubmission = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
