chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "APPLICATION_SUBMITTED") {
    return false;
  }

  openApplicationPopup(sender);
  return false;
});

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
