(function initializeApplicationTrackerContentScript() {
  let backendUpdate = {
    status: "idle",
    message: null,
    application: null,
    error: null,
  };

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
      backendUpdate,
      page: {
        title: document.title || null,
        url: window.location.href,
      },
    });

    return false;
  });

  function notifySubmitted(submission) {
    const applicationData =
      submission && submission.application_data ? submission.application_data : readApplicationData();
    const application = window.ApplicationSubmission.buildFinalApplication(applicationData, {
      originalUrl: submission && submission.original_url,
    });
    const validation = window.ApplicationSubmission.validateFinalApplication(application);

    if (!validation.valid) {
      backendUpdate = {
        status: "error",
        message: `Application was submitted, but required fields are missing: ${validation.missingFields.join(", ")}.`,
        application,
        error: "missing_required_fields",
      };
      chrome.runtime.sendMessage({
        type: "APPLICATION_SUBMITTED",
        submission,
        application,
        clientError: {
          code: "missing_required_fields",
          message: backendUpdate.message,
        },
      });
      return;
    }

    backendUpdate = {
      status: "pending",
      message: "Updating spreadsheet...",
      application,
      error: null,
    };

    chrome.runtime.sendMessage({
      type: "APPLICATION_SUBMITTED",
      submission,
      application,
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "APPLICATION_BACKEND_UPDATE") {
      return false;
    }

    backendUpdate = {
      status: message.success ? "success" : "error",
      message: message.message || (message.success ? "Spreadsheet updated." : "Spreadsheet update failed."),
      application: message.application || backendUpdate.application,
      error: message.error || null,
    };

    return false;
  });
})();
