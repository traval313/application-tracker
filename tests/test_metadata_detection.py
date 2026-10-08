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
