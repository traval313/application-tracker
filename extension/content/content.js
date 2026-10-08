(function initializeApplicationTrackerContentScript() {
  const submissionDetector = window.ApplicationSubmission.createApplicationSubmissionDetector({
    onSubmitted: notifySubmitted,
  });
  submissionDetector.start();

  function readApplicationData() {
    return window.ApplicationMetadata.extractMetadata(document, window.location);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "GET_APPLICATION_DATA") {
      return false;
    }

    sendResponse({
      applicationData: readApplicationData(),
      submission: submissionDetector.getState(),
      page: {
        title: document.title || null,
        url: window.location.href,
      },
    });

    return false;
  });

  function notifySubmitted(submission) {
    chrome.runtime.sendMessage({
      type: "APPLICATION_SUBMITTED",
      submission,
    });
  }
})();
