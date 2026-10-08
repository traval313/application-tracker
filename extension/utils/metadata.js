(function attachApplicationMetadata(globalScope) {
  const EMPTY_APPLICATION_DATA = Object.freeze({
    company_name: null,
    position: null,
    website_link: null,
    date_posted: null,
    date_applied: null,
    cover_letter_req: null,
    resume_req: null,
    response_status: null,
  });

  const GENERIC_JOB_BOARD_HOSTS = new Set([
    "jobs.lever.co",
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
  ]);

  function extractMetadata(doc = globalScope.document, locationLike = globalScope.location) {
    const applicationData = createApplicationData({
      website_link: locationLike && locationLike.href ? locationLike.href : null,
    });

    const structuredData = extractJobPostingData(doc);
    mergeDetectedFields(applicationData, structuredData);

    const fallbackData = extractFallbackData(doc, locationLike);
    mergeMissingFields(applicationData, fallbackData);

    return applicationData;
  }

  function createApplicationData(overrides = {}) {
    return {
      ...EMPTY_APPLICATION_DATA,
      ...overrides,
    };
  }

  function extractJobPostingData(doc) {
    const jobPosting = findJobPostingJsonLd(doc);

    if (!jobPosting) {
      return {};
    }

    return compactObject({
      company_name: getHiringOrganizationName(jobPosting, doc),
      position: normalizeString(jobPosting.title),
      date_posted: normalizeString(jobPosting.datePosted),
    });
  }

  function findJobPostingJsonLd(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return null;
    }

    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

    for (const script of scripts) {
      const parsed = parseJsonLd(script.textContent);
      const jobPosting = findJobPostingNode(parsed);

      if (jobPosting) {
        return jobPosting;
      }
    }

    return null;
  }

  function parseJsonLd(rawJson) {
    if (!rawJson || !rawJson.trim()) {
      return null;
    }

    try {
      return JSON.parse(rawJson);
    } catch (_error) {
      return null;
    }
  }

  function findJobPostingNode(node) {
    if (!node) {
      return null;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const match = findJobPostingNode(item);
        if (match) {
          return match;
        }
      }
      return null;
    }

    if (typeof node !== "object") {
      return null;
    }

    if (hasType(node, "JobPosting")) {
      return node;
    }

    return findJobPostingNode(node["@graph"]);
  }

  function hasType(node, expectedType) {
    const type = node["@type"];

    if (Array.isArray(type)) {
      return type.some((item) => schemaTypeMatches(item, expectedType));
    }

    return schemaTypeMatches(type, expectedType);
  }

  function schemaTypeMatches(type, expectedType) {
    const normalizedType = normalizeString(type);

    if (!normalizedType) {
      return false;
    }

    return normalizedType === expectedType || normalizedType.endsWith(`/${expectedType}`);
  }

  function extractFallbackData(doc, locationLike = globalScope.location) {
    if (!doc || typeof doc.querySelector !== "function") {
      return {};
    }

    const position = extractFallbackPosition(doc);

    return compactObject({
      company_name: extractFallbackCompanyName(doc, locationLike, position),
      position,
      date_posted: extractFallbackDatePosted(doc),
    });
  }

  function extractFallbackPosition(doc) {
    return firstNonEmpty([
      () => getMetaContent(doc, 'meta[property="og:title"]'),
      () => getMetaContent(doc, 'meta[name="twitter:title"]'),
      () => getTextContent(doc, "h1"),
      () => cleanTitle(doc.title),
    ]);
  }

  function extractFallbackCompanyName(doc, locationLike, position) {
    return firstNonEmpty([
      () => getMetaContent(doc, 'meta[itemprop="hiringOrganization"]'),
      () => getMetaContent(doc, 'meta[name="organization"]'),
      () => getCompanyTextBySelectors(doc),
      () => extractCompanyFromTitle(doc.title, position),
      () => getTrustedSiteName(doc, locationLike),
      () => extractCompanyFromJobBoardUrl(locationLike),
    ]);
  }

  function extractFallbackDatePosted(doc) {
    return firstNonEmpty([
      () => getMetaContent(doc, 'meta[itemprop="datePosted"]'),
      () => getMetaContent(doc, 'meta[property="article:published_time"]'),
      () => getMetaContent(doc, 'meta[name="date"]'),
      () => getMetaContent(doc, 'meta[name="datePosted"]'),
      () => getAttribute(doc, 'time[itemprop="datePosted"]', "datetime"),
      () => getAttribute(doc, "time[datetime]", "datetime"),
      () => getTextContent(doc, '[itemprop="datePosted"]'),
    ]);
  }

  function mergeDetectedFields(target, source) {
    Object.keys(source).forEach((key) => {
      target[key] = source[key];
    });
  }

  function mergeMissingFields(target, source) {
    Object.keys(source).forEach((key) => {
      if (target[key] === null || target[key] === undefined || target[key] === "") {
        target[key] = source[key];
      }
    });
  }

  function getNestedString(object, path) {
    const value = path.reduce((current, key) => {
      if (current && typeof current === "object") {
        return current[key];
      }
      return undefined;
    }, object);

    if (Array.isArray(value)) {
      return normalizeString(value[0]);
    }

    return normalizeString(value);
  }

  function getHiringOrganizationName(jobPosting, doc) {
    const organization = jobPosting.hiringOrganization;

    if (Array.isArray(organization)) {
      return getOrganizationName(organization[0], doc);
    }

    return getOrganizationName(organization, doc);
  }

  function getOrganizationName(organization, doc) {
    if (typeof organization === "string") {
      return normalizeString(organization);
    }

    if (!organization || typeof organization !== "object") {
      return null;
    }

    const directName = normalizeString(organization.name);
    if (directName) {
      return directName;
    }

    const referenceId = normalizeString(organization["@id"]);
    if (referenceId) {
      return getReferencedJsonLdName(doc, referenceId);
    }

    return null;
  }

  function getReferencedJsonLdName(doc, referenceId) {
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return null;
    }

    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

    for (const script of scripts) {
      const parsed = parseJsonLd(script.textContent);
      const referencedNode = findJsonLdNodeById(parsed, referenceId);
      const referencedName = referencedNode ? normalizeString(referencedNode.name) : null;

      if (referencedName) {
        return referencedName;
      }
    }

    return null;
  }

  function findJsonLdNodeById(node, referenceId) {
    if (!node) {
      return null;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const match = findJsonLdNodeById(item, referenceId);
        if (match) {
          return match;
        }
      }
      return null;
    }

    if (typeof node !== "object") {
      return null;
    }

    if (normalizeString(node["@id"]) === referenceId) {
      return node;
    }

    return findJsonLdNodeById(Object.values(node), referenceId);
  }

  function getMetaContent(doc, selector) {
    return getAttribute(doc, selector, "content");
  }

  function getAttribute(doc, selector, attributeName) {
    const element = safeQuerySelector(doc, selector);
    return normalizeString(element ? element.getAttribute(attributeName) : null);
  }

  function getTextContent(doc, selector) {
    const element = safeQuerySelector(doc, selector);
    return normalizeString(element ? element.textContent : null);
  }

  function getCompanyTextBySelectors(doc) {
    const selectors = [
      '[itemprop="hiringOrganization"] [itemprop="name"]',
      '[itemprop="hiringOrganization"]',
      '[data-automation-id="jobPostingCompany"]',
      '[data-automation-id="company"]',
      '[data-testid="company-name"]',
      '[data-testid="companyName"]',
      '[data-testid="employer-name"]',
      '[data-testid="inlineHeader-companyName"]',
      '[data-testid*="company" i]',
      '[data-qa*="company" i]',
      '[aria-label*="company" i]',
      ".topcard__org-name-link",
      ".topcard__flavor--black-link",
      ".job-details-jobs-unified-top-card__company-name a",
      '[class*="company-name" i]',
      '[class*="companyName" i]',
      '[class*="employer" i]',
      '[class*="organization" i]',
      '[id*="company-name" i]',
      '[id*="companyName" i]',
      '[id*="employer" i]',
    ];

    for (const selector of selectors) {
      const candidate = getFirstCompanyCandidate(doc, selector);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function getFirstCompanyCandidate(doc, selector) {
    const elements = safeQuerySelectorAll(doc, selector);

    for (const element of elements) {
      const candidate = cleanCompanyName(
        element.textContent ||
          getElementAttribute(element, "content") ||
          getElementAttribute(element, "aria-label") ||
          getElementAttribute(element, "title"),
      );
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function getTrustedSiteName(doc, locationLike) {
    const siteName = cleanCompanyName(getMetaContent(doc, 'meta[property="og:site_name"]'));

    if (!siteName || isGenericJobBoardName(siteName, locationLike)) {
      return null;
    }

    return siteName;
  }

  function extractCompanyFromTitle(title, position) {
    const normalizedTitle = normalizeString(title);
    const normalizedPosition = normalizeString(position);

    if (!normalizedTitle || !normalizedPosition) {
      return null;
    }

    const escapedPosition = escapeRegExp(normalizedPosition);
    const patterns = [
      new RegExp(`^${escapedPosition}\\s+(?:at|@)\\s+(.+)$`, "i"),
      new RegExp(`^(.+?)\\s+(?:is hiring|careers|jobs)\\s*[-|:]\\s*${escapedPosition}$`, "i"),
      new RegExp(`^${escapedPosition}\\s*[-|]\\s*(.+)$`, "i"),
    ];

    for (const pattern of patterns) {
      const match = normalizedTitle.match(pattern);
      const companyName = match ? cleanCompanyName(match[1]) : null;
      if (companyName && !companyNameIncludesPosition(companyName, normalizedPosition)) {
        return companyName;
      }
    }

    return null;
  }

  function extractCompanyFromJobBoardUrl(locationLike) {
    if (!locationLike || !locationLike.href) {
      return null;
    }

    try {
      const url = new URL(locationLike.href);
      const hostname = url.hostname.toLowerCase();
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (GENERIC_JOB_BOARD_HOSTS.has(hostname) && pathParts[0]) {
        return humanizeCompanySlug(pathParts[0]);
      }

      if (hostname.endsWith(".greenhouse.io")) {
        return humanizeCompanySlug(hostname.replace(".greenhouse.io", ""));
      }

      if (hostname.endsWith(".workdayjobs.com")) {
        return humanizeCompanySlug(hostname.replace(".workdayjobs.com", ""));
      }
    } catch (_error) {
      return null;
    }

    return null;
  }

  function safeQuerySelector(doc, selector) {
    try {
      return doc.querySelector(selector);
    } catch (_error) {
      return null;
    }
  }

  function safeQuerySelectorAll(doc, selector) {
    try {
      if (typeof doc.querySelectorAll !== "function") {
        return [];
      }

      return Array.from(doc.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function firstNonEmpty(extractors) {
    for (const extractor of extractors) {
      const value = normalizeString(extractor());
      if (value) {
        return value;
      }
    }

    return null;
  }

  function cleanTitle(title) {
    const normalizedTitle = normalizeString(title);
    if (!normalizedTitle) {
      return null;
    }

    const separators = [" | ", " - ", " – ", " — ", " @ "];
    for (const separator of separators) {
      const [firstPart] = normalizedTitle.split(separator);
      if (firstPart && firstPart.length >= 4) {
        return firstPart.trim();
      }
    }

    return normalizedTitle;
  }

  function cleanCompanyName(value) {
    const normalized = normalizeString(value);
    if (!normalized) {
      return null;
    }

    const cleaned = normalized
      .replace(/^(company|employer|organization)\s*[:\-]\s*/i, "")
      .replace(/\s+(careers|jobs|job openings|open roles)$/i, "")
      .trim();
    const [beforeSeparator] = cleaned.split(/\s+[|–—]\s+/);
    const companyName = beforeSeparator.trim();

    if (!companyName || companyName.length < 2 || companyName.length > 80) {
      return null;
    }

    if (/^(apply|job|jobs|careers|overview|about|current openings)$/i.test(companyName)) {
      return null;
    }

    return companyName;
  }

  function isGenericJobBoardName(siteName, locationLike) {
    const normalizedSiteName = siteName.toLowerCase();
    const genericNames = ["greenhouse", "lever", "workday", "linkedin", "indeed", "ashby"];

    if (genericNames.some((name) => normalizedSiteName.includes(name))) {
      return true;
    }

    if (!locationLike || !locationLike.hostname) {
      return false;
    }

    return GENERIC_JOB_BOARD_HOSTS.has(locationLike.hostname.toLowerCase());
  }

  function companyNameIncludesPosition(companyName, position) {
    return companyName.toLowerCase().includes(position.toLowerCase());
  }

  function humanizeCompanySlug(slug) {
    const cleanedSlug = normalizeString(slug);
    if (!cleanedSlug) {
      return null;
    }

    return cleanCompanyName(
      cleanedSlug
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    );
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getElementAttribute(element, attributeName) {
    if (!element || typeof element.getAttribute !== "function") {
      return null;
    }

    return element.getAttribute(attributeName);
  }

  function compactObject(object) {
    return Object.entries(object).reduce((result, [key, value]) => {
      const normalizedValue = normalizeString(value);
      if (normalizedValue) {
        result[key] = normalizedValue;
      }
      return result;
    }, {});
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
    createApplicationData,
    extractMetadata,
    extractJobPostingData,
    extractFallbackData,
  };

  globalScope.ApplicationMetadata = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
