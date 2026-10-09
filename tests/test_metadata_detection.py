import subprocess
import textwrap


def test_detects_resume_and_cover_letter_fields() -> None:
    script = textwrap.dedent(
        """
        const assert = require("node:assert/strict");
        const metadata = require("./extension/utils/metadata.js");

        class FakeElement {
          constructor(tagName, attributes = {}, textContent = "") {
            this.tagName = tagName.toLowerCase();
            this.attributes = attributes;
            this.textContent = textContent;
            this.parentElement = null;
            this.children = [];
            this.labels = [];
          }

          appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
          }

          getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attributes, name)
              ? String(this.attributes[name])
              : null;
          }

          hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attributes, name);
          }

          closest(selector) {
            const selectors = selector.split(",").map((item) => item.trim());
            let current = this;

            while (current) {
              if (selectors.some((item) => current.matches(item))) {
                return current;
              }
              current = current.parentElement;
            }

            return null;
          }

          matches(selector) {
            if (selector === this.tagName) {
              return true;
            }

            if (selector === '[contenteditable="true"]') {
              return this.getAttribute("contenteditable") === "true";
            }

            if (selector === '[role="textbox"]') {
              return this.getAttribute("role") === "textbox";
            }

            if (selector === '[data-testid]') {
              return this.hasAttribute("data-testid");
            }

            if (selector === '[data-qa]') {
              return this.hasAttribute("data-qa");
            }

            if (selector === 'input[type="file"]') {
              return this.tagName === "input" && this.getAttribute("type") === "file";
            }

            if (selector.startsWith(".")) {
              return (this.getAttribute("class") || "")
                .split(/\\s+/)
                .includes(selector.slice(1));
            }

            return false;
          }
        }

        class FakeDocument {
          constructor(elements) {
            this.elements = elements;
          }

          querySelectorAll(selector) {
            const labelForMatch = selector.match(/^label\\[for="(.+)"\\]$/);
            if (labelForMatch) {
              return this.elements.filter(
                (element) =>
                  element.tagName === "label" && element.getAttribute("for") === labelForMatch[1],
              );
            }

            return this.elements.filter((element) => element.matches(selector));
          }

          getElementById(id) {
            return this.elements.find((element) => element.getAttribute("id") === id) || null;
          }

          querySelector() {
            return null;
          }
        }

        function buildDocument() {
          const root = new FakeElement("div");

          const resumeLabel = root.appendChild(new FakeElement("label", { for: "resume-upload" }, "Resume"));
          const resumeInput = root.appendChild(
            new FakeElement("input", { id: "resume-upload", type: "file" }),
          );
          resumeInput.labels = [resumeLabel];

          const optionalCoverGroup = root.appendChild(new FakeElement("div", {}, "Cover Letter optional"));
          optionalCoverGroup.appendChild(
            new FakeElement("textarea", { "aria-label": "Cover Letter optional" }),
          );

          const richTextLabel = root.appendChild(new FakeElement("span", { id: "cover-label" }, "Cover letter *"));
          root.appendChild(
            new FakeElement("div", { role: "textbox", "aria-labelledby": "cover-label" }),
          );

          root.appendChild(new FakeElement("input", { type: "file", name: "candidate_cv" }));
          root.appendChild(new FakeElement("input", { type: "file", name: "portfolio" }));

          const elements = [];
          function walk(element) {
            elements.push(element);
            element.children.forEach(walk);
          }
          walk(root);

          return new FakeDocument(elements);
        }

        assert.deepEqual(metadata.detectApplicationFields(buildDocument()), {
          cover_letter_req: true,
          resume_req: true,
        });

        const optionalOnlyDocument = new FakeDocument([
          new FakeElement("textarea", { name: "cover_letter" }, "Cover letter optional"),
          new FakeElement("input", { type: "file", name: "portfolio" }),
        ]);

        assert.deepEqual(metadata.detectApplicationFields(optionalOnlyDocument), {
          cover_letter_req: true,
          resume_req: false,
        });

        const noisyForm = new FakeElement(
          "form",
          {},
          "Resume upload ".repeat(30) + "Portfolio upload",
        );
        noisyForm.appendChild(new FakeElement("input", { type: "file", name: "portfolio" }));
        const noisyDocument = new FakeDocument([noisyForm, ...noisyForm.children]);

        assert.deepEqual(metadata.detectApplicationFields(noisyDocument), {
          cover_letter_req: false,
          resume_req: false,
        });
        """
    )

    subprocess.run(["node", "-e", script], check=True)


def test_detects_application_submission_success_signals() -> None:
    script = textwrap.dedent(
        """
        const assert = require("node:assert/strict");
        const submission = require("./extension/utils/submission.js");

        class FakeElement {
          constructor(tagName, attributes = {}, textContent = "") {
            this.tagName = tagName.toLowerCase();
            this.attributes = attributes;
            this.textContent = textContent;
            this.parentElement = null;
            this.children = [];
          }

          appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
          }

          getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attributes, name)
              ? String(this.attributes[name])
              : null;
          }

          hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this.attributes, name);
          }

          closest(selector) {
            const selectors = selector.split(",").map((item) => item.trim());
            let current = this;

            while (current) {
              if (selectors.some((item) => current.matches(item))) {
                return current;
              }
              current = current.parentElement;
            }

            return null;
          }

          querySelectorAll(selector) {
            const selectors = selector.split(",").map((item) => item.trim());
            const matches = [];

            function walk(element) {
              element.children.forEach((child) => {
                if (selectors.some((item) => child.matches(item))) {
                  matches.push(child);
                }
                walk(child);
              });
            }

            walk(this);
            return matches;
          }

          matches(selector) {
            if (selector === this.tagName) {
              return true;
            }

            if (selector === "main" || selector === "section" || selector === "article" || selector === "body") {
              return selector === this.tagName;
            }

            if (selector === "input") {
              return this.tagName === "input";
            }

            if (selector === "textarea") {
              return this.tagName === "textarea";
            }

            if (selector === "select") {
              return this.tagName === "select";
            }

            if (selector === "button") {
              return this.tagName === "button";
            }

            if (selector === '[role="button"]' || selector === "[role='button']") {
              return this.getAttribute("role") === "button";
            }

            if (selector === '[role="alert"]') {
              return this.getAttribute("role") === "alert";
            }

            if (selector === '[role="status"]') {
              return this.getAttribute("role") === "status";
            }

            if (selector === "[aria-live]") {
              return this.hasAttribute("aria-live");
            }

            if (selector === 'button[type="submit"]') {
              return this.tagName === "button" && this.getAttribute("type") === "submit";
            }

            if (selector === 'input[type="submit"]') {
              return this.tagName === "input" && this.getAttribute("type") === "submit";
            }

            if (selector === 'input[type="file"]') {
              return this.tagName === "input" && this.getAttribute("type") === "file";
            }

            if (selector === '[contenteditable="true"]') {
              return this.getAttribute("contenteditable") === "true";
            }

            if (selector === '[role="textbox"]') {
              return this.getAttribute("role") === "textbox";
            }

            const containsMatch = selector.match(/^\\[([^\\]*]+)\\*="([^"]+)" i\\]$/);
            if (containsMatch) {
              return (this.getAttribute(containsMatch[1]) || "")
                .toLowerCase()
                .includes(containsMatch[2].toLowerCase());
            }

            const formContainsMatch = selector.match(/^form\\[([^\\]*]+)\\*="([^"]+)" i\\]$/);
            if (formContainsMatch) {
              return (
                this.tagName === "form" &&
                (this.getAttribute(formContainsMatch[1]) || "")
                  .toLowerCase()
                  .includes(formContainsMatch[2].toLowerCase())
              );
            }

            return false;
          }
        }

        class FakeDocument {
          constructor(body) {
            this.body = body;
            this.documentElement = body;
            this.title = "Software Engineering Intern at Figma";
          }

          addEventListener() {}
          removeEventListener() {}

          querySelectorAll(selector) {
            return this.body.querySelectorAll(selector);
          }
        }

        const form = new FakeElement("form", { action: "/apply" }, "Apply for this job");
        form.appendChild(new FakeElement("input", { type: "file", name: "resume" }));
        form.appendChild(new FakeElement("button", { type: "submit" }, "Submit application"));
        const body = new FakeElement("body");
        body.appendChild(form);
        const doc = new FakeDocument(body);

        assert.equal(submission.isApplicationLikeForm(form, doc), true);

        const successBody = new FakeElement("body");
        successBody.appendChild(new FakeElement("div", { role: "status" }, "Thank you for applying."));
        assert.deepEqual(submission.detectSubmissionSuccess(new FakeDocument(successBody)), {
          source: "success_element",
          text: "Thank you for applying.",
        });

        let currentTime = Date.parse("2026-10-08T12:00:00Z");
        const location = { href: "https://jobs.example.com/apply" };
        const storage = new Map();
        const storageLike = {
          getItem: (key) => storage.get(key) || null,
          setItem: (key, value) => storage.set(key, value),
        };
        const detector = submission.createApplicationSubmissionDetector({
          document: doc,
          location,
          storage: storageLike,
          now: () => currentTime,
          metadataProvider: () => ({
            company_name: "Figma",
            position: "Software Engineering Intern",
          }),
        });

        detector.recordSubmissionAttempt("form_submit", form);
        location.href = "https://jobs.example.com/application/confirmation";
        currentTime += 1000;
        detector.checkForUrlChange();

        assert.deepEqual(detector.getState(), {
          status: "submitted",
          submitted_at: "2026-10-08T12:00:00.000Z",
          confirmed_at: "2026-10-08T12:00:01.000Z",
          confirmation_source: "url_change",
          confirmation_text: "Navigated from https://jobs.example.com/apply to https://jobs.example.com/application/confirmation",
          original_url: "https://jobs.example.com/apply",
          current_url: "https://jobs.example.com/application/confirmation",
          source: "form_submit",
          company_name: "Figma",
          position: "Software Engineering Intern",
          application_data: {
            company_name: "Figma",
            position: "Software Engineering Intern",
            website_link: null,
            date_posted: null,
            date_applied: null,
            cover_letter_req: null,
            resume_req: null,
            response_status: null,
          },
        });

        const finalApplication = submission.buildFinalApplication(
          {
            company_name: "Figma",
            position: "Software Engineering Intern",
            website_link: "https://www.figma.com/careers/job/123",
            date_posted: "2026-09-20T18:30:00Z",
            cover_letter_req: false,
            resume_req: true,
          },
          { today: () => new Date("2026-10-08T12:00:00Z") },
        );

        assert.deepEqual(finalApplication, {
          company_name: "Figma",
          position: "Software Engineering Intern",
          website_link: "https://www.figma.com/careers/job/123",
          date_posted: "2026-09-20",
          date_applied: "2026-10-08",
          cover_letter_req: false,
          resume_req: true,
          response_status: "Applied",
        });
        assert.deepEqual(submission.validateFinalApplication(finalApplication), {
          valid: true,
          missingFields: [],
        });

        const applicationWithoutDatePosted = submission.buildFinalApplication(
          {
            company_name: "Figma",
            position: "Software Engineering Intern",
            website_link: "https://www.figma.com/careers/job/123",
            resume_req: true,
          },
          { dateApplied: "2026-10-08" },
        );

        assert.deepEqual(applicationWithoutDatePosted, {
          company_name: "Figma",
          position: "Software Engineering Intern",
          website_link: "https://www.figma.com/careers/job/123",
          date_posted: null,
          date_applied: "2026-10-08",
          cover_letter_req: false,
          resume_req: true,
          response_status: "Applied",
        });
        assert.deepEqual(submission.validateFinalApplication(applicationWithoutDatePosted), {
          valid: true,
          missingFields: [],
        });

        assert.equal(
          submission.buildFinalApplication(
            {
              company_name: "Figma",
              position: "Software Engineering Intern",
              website_link: "https://www.figma.com/careers/job/123",
              date_posted: "2026-09-20",
            },
            { dateApplied: "2026-10-08" },
          ).date_posted,
          "2026-09-20",
        );
        """
    )

    subprocess.run(["node", "-e", script], check=True)
