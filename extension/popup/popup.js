const FIELD_CONFIG = {
  company_name: {
    elementId: "company-name",
    emptyText: "Not detected.",
  },
  position: {
    elementId: "position",
    emptyText: "Not detected.",
  },
  date_posted: {
    elementId: "date-posted",
    emptyText: "Not detected.",
    format: formatDate,
  },
  website_link: {
    elementId: "website-link",
    emptyText: "Not detected.",
    format: formatUrl,
  },
};

document.addEventListener("DOMContentLoaded", initializePopup);

async function initializePopup() {
  const statusElement = document.getElementById("status-message");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      renderApplicationData({});
      statusElement.textContent = "No active page detected.";
      return;
    }

    document.getElementById("page-title").textContent = tab.title || "Current page";

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_APPLICATION_DATA",
    });

    const applicationData = response && response.applicationData ? response.applicationData : {};
    renderApplicationData(applicationData);
  } catch (_error) {
    renderApplicationData({});
    statusElement.textContent = "Open a job posting page to detect metadata.";
  }
}

function renderApplicationData(applicationData) {
  Object.entries(FIELD_CONFIG).forEach(([fieldName, config]) => {
    const element = document.getElementById(config.elementId);
    const rawValue = applicationData[fieldName];
    const displayValue = rawValue && config.format ? config.format(rawValue) : rawValue;

    if (displayValue) {
      element.textContent = displayValue;
      element.classList.remove("empty-value");
    } else {
      element.textContent = config.emptyText;
      element.classList.add("empty-value");
    }
  });
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch (_error) {
    return value;
  }
}
