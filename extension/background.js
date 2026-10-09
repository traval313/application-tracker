chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "APPLICATION_SUBMITTED") {
    return false;
  }

  handleApplicationSubmitted(message, sender);
  return false;
});

async function handleApplicationSubmitted(message, sender) {
  const tabId = sender && sender.tab ? sender.tab.id : undefined;

  await openApplicationPopup(sender);

  if (message.clientError) {
    await sendBackendUpdate(tabId, {
      success: false,
      message: message.clientError.message,
      application: message.application || null,
      error: message.clientError.code || "client_error",
    });
    return;
  }

  const result = await postApplication(message.application);
  await sendBackendUpdate(tabId, result);
}

async function postApplication(application) {
  try {
    const response = await fetch("http://127.0.0.1:8000/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(application),
    });

    const body = await parseJsonResponse(response);

    if (!response.ok) {
      return {
        success: false,
        message: getErrorMessage(body) || `Backend returned ${response.status}.`,
        application,
        error: "backend_error",
      };
    }

    return {
      success: true,
      message: body && body.message ? body.message : "Spreadsheet updated.",
      application: body && body.application ? body.application : application,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      message: "Could not reach the application tracker backend.",
      application,
      error: error && error.message ? error.message : "network_error",
    };
  }
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function getErrorMessage(body) {
  if (!body) {
    return null;
  }

  if (typeof body.detail === "string") {
    return body.detail;
  }

  if (body.detail && typeof body.detail.message === "string") {
    return body.detail.message;
  }

  if (typeof body.message === "string") {
    return body.message;
  }

  return null;
}

async function sendBackendUpdate(tabId, result) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "APPLICATION_BACKEND_UPDATE",
      success: result.success,
      message: result.message,
      application: result.application || null,
      error: result.error || null,
    });
  } catch (_error) {
    // The content script may be gone after navigation; the popup will still show live page data when available.
  }
}

async function openApplicationPopup(sender) {
  const windowId = sender && sender.tab ? sender.tab.windowId : undefined;

  try {
    if (chrome.action && typeof chrome.action.openPopup === "function") {
      await chrome.action.openPopup(
        Number.isInteger(windowId)
          ? {
              windowId,
            }
          : undefined,
      );
      return;
    }
  } catch (_error) {
    // Fall through to the badge signal for Chrome versions or windows that reject openPopup.
  }

  await markSubmittedBadge(sender && sender.tab ? sender.tab.id : undefined);
}

async function markSubmittedBadge(tabId) {
  if (!chrome.action || typeof chrome.action.setBadgeText !== "function") {
    return;
  }

  const details = Number.isInteger(tabId)
    ? {
        tabId,
        text: "OK",
      }
    : {
        text: "OK",
      };

  await chrome.action.setBadgeBackgroundColor({
    color: "#14643f",
  });
  await chrome.action.setBadgeText(details);
}
