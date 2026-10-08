(function initializeApplicationTrackerContentScript() {
  function readApplicationData() {
    return window.ApplicationMetadata.extractMetadata(document, window.location);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "GET_APPLICATION_DATA") {
      return false;
    }

    sendResponse({
      applicationData: readApplicationData(),
      page: {
        title: document.title || null,
        url: window.location.href,
      },
    });

    return false;
  });
})();
