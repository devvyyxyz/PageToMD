/**
 * Popup script for the PageToMD extension (v1.3).
 * Uses browser.* APIs with on-demand script injection + message passing.
 * Supports batch convert, cloud sync, readability scoring, and saved settings.
 */

document.addEventListener("DOMContentLoaded", function () {
  var convertBtn = document.getElementById("convertBtn");
  var batchBtn = document.getElementById("batchBtn");
  var cloudBtn = document.getElementById("cloudBtn");
  var copyBtn = document.getElementById("copyBtn");
  var downloadBtn = document.getElementById("downloadBtn");
  var settingsBtn = document.getElementById("settingsBtn");
  var statusEl = document.getElementById("status");
  var previewPanel = document.getElementById("previewPanel");
  var previewContent = document.getElementById("previewContent");
  var charCount = document.getElementById("charCount");
  var pageTitle = document.getElementById("pageTitle");
  var includeMetadata = document.getElementById("includeMetadata");
  var frontMatterTemplate = document.getElementById("frontMatterTemplate");
  var generateToc = document.getElementById("generateToc");
  var convertSelection = document.getElementById("convertSelection");
  var autoCopy = document.getElementById("autoCopy");
  var stripTracking = document.getElementById("stripTracking");
  var shiftHeadings = document.getElementById("shiftHeadings");
  var headingShift = document.getElementById("headingShift");
  var headingShiftWrap = document.getElementById("headingShiftWrap");
  var imageMode = document.getElementById("imageMode");
  var exportFormat = document.getElementById("exportFormat");
  var readabilityPanel = document.getElementById("readabilityPanel");
  var readabilityScore = document.getElementById("readabilityScore");
  var readabilityDetails = document.getElementById("readabilityDetails");

  var currentMarkdown = "";
  var currentExportFormat = "markdown";
  var currentReadability = null;
  var savedSettings = {};

  // Toggle heading shift sub-option visibility
  shiftHeadings.addEventListener("change", function () {
    if (shiftHeadings.checked) {
      headingShiftWrap.classList.add("visible");
    } else {
      headingShiftWrap.classList.remove("visible");
    }
  });

  // Get current tab info on load
  browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
    if (tabs[0]) {
      pageTitle.textContent = tabs[0].title || "Untitled Page";
    }
  });

  // Load saved settings and apply as defaults
  browser.runtime.sendMessage({ action: "getSettings" }).then(function (response) {
    if (response && response.success) {
      savedSettings = response.settings || {};
      applySavedDefaults();
    }
  }).catch(function () {
    // Settings not available, use UI defaults
  });

  function applySavedDefaults() {
    if (savedSettings.defaultIncludeMetadata !== undefined) includeMetadata.checked = savedSettings.defaultIncludeMetadata;
    if (savedSettings.defaultAutoCopy !== undefined) autoCopy.checked = savedSettings.defaultAutoCopy;
    if (savedSettings.defaultStripTracking !== undefined) stripTracking.checked = savedSettings.defaultStripTracking;
    if (savedSettings.defaultGenerateToc !== undefined) generateToc.checked = savedSettings.defaultGenerateToc;
    if (savedSettings.defaultExportFormat) exportFormat.value = savedSettings.defaultExportFormat;
    if (savedSettings.defaultFrontMatterTemplate) frontMatterTemplate.value = savedSettings.defaultFrontMatterTemplate;
    if (savedSettings.defaultImageMode) imageMode.value = savedSettings.defaultImageMode;
  }

  // Settings button - open options page
  settingsBtn.addEventListener("click", function () {
    browser.runtime.openOptionsPage();
  });

  /**
   * Collect current options from the UI.
   */
  function getOptions() {
    return {
      includeMetadata: includeMetadata.checked,
      frontMatterTemplate: frontMatterTemplate.value,
      generateToc: generateToc.checked,
      stripTracking: stripTracking.checked,
      shiftHeadings: shiftHeadings.checked ? parseInt(headingShift.value, 10) : 0,
      headingStyle: savedSettings.defaultHeadingStyle || "atx",
      imageMode: imageMode.value,
      exportFormat: exportFormat.value,
      customRules: savedSettings.customRules || []
    };
  }

  /**
   * Get file extension and MIME type for the selected export format.
   */
  function getExportInfo(format) {
    switch (format) {
      case "html":  return { ext: ".html", mime: "text/html;charset=utf-8" };
      case "txt":   return { ext: ".txt",  mime: "text/plain;charset=utf-8" };
      case "rst":   return { ext: ".rst",  mime: "text/x-rst;charset=utf-8" };
      default:      return { ext: ".md",   mime: "text/markdown;charset=utf-8" };
    }
  }

  /**
   * Convert markdown to the selected export format.
   */
  function convertExportFormat(markdown, format) {
    switch (format) {
      case "html":  return markdownToHtml(markdown);
      case "txt":   return markdownToTxt(markdown);
      case "rst":   return markdownToRst(markdown);
      default:      return markdown;
    }
  }

  /**
   * Simple markdown to HTML converter.
   */
  function markdownToHtml(md) {
    var html = md;
    // Strip YAML front matter
    html = html.replace(/^---[\s\S]*?---\n\n/, "");
    // Headings
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, function (m, hashes, text) {
      var level = hashes.length;
      return "<h" + level + ">" + inlineMdToHtml(text) + "</h" + level + ">";
    });
    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
    // Horizontal rules
    html = html.replace(/^---$/gm, "<hr>");
    // Unordered lists
    html = html.replace(/^(-|\*)\s+(.+)$/gm, "<li>$2</li>");
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
    // Paragraphs: wrap remaining non-tag lines
    html = html.replace(/^(?!<[a-z/])(.+)$/gm, "<p>$1</p>");
    return html;
  }

  function inlineMdToHtml(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return text;
  }

  /**
   * Strip markdown formatting to plain text.
   */
  function markdownToTxt(md) {
    var txt = md;
    // Strip YAML front matter
    txt = txt.replace(/^---[\s\S]*?---\n\n/, "");
    // Strip headings markers
    txt = txt.replace(/^#{1,6}\s+/gm, "");
    // Strip bold/italic
    txt = txt.replace(/\*\*\*/g, "");
    txt = txt.replace(/\*\*/g, "");
    txt = txt.replace(/\*/g, "");
    // Strip inline code
    txt = txt.replace(/`([^`]+)`/g, "$1");
    // Strip code block markers
    txt = txt.replace(/```\w*\n?/g, "");
    // Strip links, keep text
    txt = txt.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // Strip images
    txt = txt.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
    // Strip horizontal rules
    txt = txt.replace(/^---$/gm, "");
    // Strip list markers
    txt = txt.replace(/^[-*+]\s+/gm, "");
    // Collapse multiple blank lines
    txt = txt.replace(/\n{3,}/g, "\n\n");
    return txt.trim();
  }

  /**
   * Convert markdown to reStructuredText.
   */
  function markdownToRst(md) {
    var rst = md;
    // Strip YAML front matter
    rst = rst.replace(/^---[\s\S]*?---\n\n/, "");
    // Headings: underlines with = - ~ ^ " based on level
    rst = rst.replace(/^(#{1})\s+(.+)$/gm, function (m, h, text) {
      return text + "\n" + "=".repeat(text.length) + "\n";
    });
    rst = rst.replace(/^(#{2})\s+(.+)$/gm, function (m, h, text) {
      return text + "\n" + "-".repeat(text.length) + "\n";
    });
    rst = rst.replace(/^(#{3})\s+(.+)$/gm, function (m, h, text) {
      return text + "\n" + "~".repeat(text.length) + "\n";
    });
    rst = rst.replace(/^(#{4})\s+(.+)$/gm, function (m, h, text) {
      return text + "\n" + "^".repeat(text.length) + "\n";
    });
    rst = rst.replace(/^(#{5})\s+(.+)$/gm, function (m, h, text) {
      return text + "\n" + '"'.repeat(text.length) + "\n";
    });
    rst = rst.replace(/^(#{6})\s+(.+)$/gm, function (m, h, text) {
      return text + "\n" + "=".repeat(text.length) + "\n";
    });
    // Bold/italic
    rst = rst.replace(/\*\*(.+?)\*\*/g, "**$1**");
    rst = rst.replace(/\*(.+?)\*/g, "*$1*");
    // Inline code
    rst = rst.replace(/`([^`]+)`/g, "``$1``");
    // Code blocks
    rst = rst.replace(/```(\w*)\n([\s\S]*?)```/g, ".. code-block:: $1\n\n$2\n");
    // Links
    rst = rst.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "`$1 <$2>`_");
    // Images
    rst = rst.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, ".. image:: $2\n   :alt: $1\n");
    // Horizontal rules
    rst = rst.replace(/^---$/gm, "----\n");
    // Unordered lists
    rst = rst.replace(/^[-*+]\s+/gm, "* ");
    // Collapse multiple blank lines
    rst = rst.replace(/\n{3,}/g, "\n\n");
    return rst.trim();
  }

  /**
   * Inject turndown.js + content.js into the tab, then send a message.
   */
  function injectAndSend(tabId, message) {
    return browser.tabs.executeScript(tabId, { file: "turndown.js" }).then(function () {
      return browser.tabs.executeScript(tabId, { file: "content.js" });
    }).then(function () {
      return browser.tabs.sendMessage(tabId, message);
    });
  }

  /**
   * Display readability score in the preview panel.
   */
  function displayReadability(readability) {
    if (!readability) {
      readabilityPanel.classList.add("hidden");
      return;
    }

    readabilityPanel.classList.remove("hidden");
    readabilityScore.textContent = readability.label + " (" + readability.readingEase + ")";
    readabilityScore.className = "readability-score " + readability.labelColor;

    readabilityDetails.innerHTML =
      "<span>Grade: " + readability.gradeLevel + "</span>" +
      "<span>Words: " + readability.wordCount.toLocaleString() + "</span>" +
      "<span>Sentences: " + readability.sentenceCount.toLocaleString() + "</span>";
  }

  // Convert button
  convertBtn.addEventListener("click", function () {
    setLoading(true);
    hideStatus();
    previewPanel.classList.add("hidden");
    readabilityPanel.classList.add("hidden");

    browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (!tabs || !tabs[0]) {
        showStatus("Error: Could not find active tab.", "error");
        setLoading(false);
        return;
      }

      var tab = tabs[0];
      var opts = getOptions();
      currentExportFormat = exportFormat.value;

      if (convertSelection.checked) {
        injectAndSend(tab.id, { action: "getSelection" }).then(function (response) {
          if (response && response.hasSelection) {
            return injectAndSend(tab.id, {
              action: "convertSelection",
              html: response.html,
              options: opts
            });
          } else {
            showStatus("No text selected on the page. Please select some text first.", "error");
            setLoading(false);
            return null;
          }
        }).then(function (result) {
          if (!result) return;
          if (result && result.success) {
            currentReadability = result.readability || null;
            finishConversion(result.markdown, tab, opts);
          } else {
            showStatus("Error: " + (result ? result.error : "Unknown error"), "error");
            setLoading(false);
          }
        }).catch(function (err) {
          showStatus("Error: " + err.message, "error");
          setLoading(false);
        });
      } else {
        injectAndSend(tab.id, {
          action: "convertToMarkdown",
          options: opts
        }).then(function (response) {
          if (response && response.success) {
            currentReadability = response.readability || null;
            finishConversion(response.markdown, tab, opts);
          } else {
            showStatus("Error: " + (response ? response.error : "Could not convert page."), "error");
            setLoading(false);
          }
        }).catch(function (err) {
          showStatus("Error: " + err.message, "error");
          setLoading(false);
        });
      }
    }).catch(function (err) {
      showStatus("Error: " + err.message, "error");
      setLoading(false);
    });
  });

  function finishConversion(markdown, tab, opts) {
    currentMarkdown = markdown;

    // Strip front matter if not wanted
    if (!opts.includeMetadata) {
      currentMarkdown = currentMarkdown.replace(/^---[\s\S]*?---\n\n/, "");
    }

    // Convert to selected export format for display/download
    var exported = convertExportFormat(currentMarkdown, currentExportFormat);

    previewContent.textContent = exported;
    charCount.textContent = exported.length.toLocaleString() + " chars \u00b7 " + exported.split(/\n/).length + " lines";
    previewPanel.classList.remove("hidden");

    // Show readability score
    displayReadability(currentReadability);

    showStatus("Converted to " + currentExportFormat.toUpperCase() + "!", "success");
    setLoading(false);

    // Auto-copy if enabled
    if (autoCopy.checked) {
      doCopy(exported);
    }
  }

  // ===== Batch Convert =====
  batchBtn.addEventListener("click", function () {
    batchBtn.disabled = true;
    batchBtn.innerHTML = '<span class="spinner-dark"></span> Batch converting...';
    hideStatus();

    var opts = getOptions();

    // Request <all_urls> permission if not already granted
    browser.permissions.contains({ origins: ["<all_urls>"] }).then(function (hasPermission) {
      if (hasPermission) {
        return doBatchConvert(opts);
      } else {
        return browser.permissions.request({ origins: ["<all_urls>"] }).then(function (granted) {
          if (granted) {
            return doBatchConvert(opts);
          } else {
            showStatus("Batch mode needs access to all URLs. Permission was denied.", "error");
            resetBatchBtn();
            return null;
          }
        });
      }
    }).then(function (result) {
      if (result && result.success) {
        showStatus("Batch complete! Converted " + result.converted + " of " + result.total + " tabs. Files downloaded.", "success");
      }
      resetBatchBtn();
    }).catch(function (err) {
      showStatus("Batch error: " + err.message, "error");
      resetBatchBtn();
    });
  });

  function doBatchConvert(opts) {
    return browser.runtime.sendMessage({
      action: "batchConvert",
      options: opts
    });
  }

  function resetBatchBtn() {
    batchBtn.disabled = false;
    batchBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/></svg> Batch Convert';
  }

  // ===== Cloud Save =====
  cloudBtn.addEventListener("click", function () {
    if (!currentMarkdown) {
      showStatus("Convert a page first before saving to cloud.", "error");
      return;
    }

    cloudBtn.disabled = true;
    cloudBtn.innerHTML = '<span class="spinner-dark"></span> Saving...';
    hideStatus();

    var exported = convertExportFormat(currentMarkdown, currentExportFormat);
    var info = getExportInfo(currentExportFormat);
    var safeName = (document.getElementById("pageTitle").textContent || "page")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 80);
    var filename = safeName + info.ext;

    browser.runtime.sendMessage({
      action: "saveToCloud",
      content: exported,
      filename: filename,
      format: currentExportFormat
    }).then(function (result) {
      if (result && result.success) {
        var path = result.path || result.name || result.fileId || filename;
        showStatus("Saved to " + result.service + ": " + path, "success");
      } else {
        showStatus("Cloud save failed: " + (result ? result.error : "Unknown error"), "error");
      }
      resetCloudBtn();
    }).catch(function (err) {
      showStatus("Cloud error: " + err.message, "error");
      resetCloudBtn();
    });
  });

  function resetCloudBtn() {
    cloudBtn.disabled = false;
    cloudBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2a4 4 0 00-3.8 2.8A3 3 0 005 11h6a3 3 0 001-5.8A4 4 0 008 2z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M5 13v1M8 13v1M11 13v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Cloud Save';
  }

  function doCopy(text) {
    text = text || convertExportFormat(currentMarkdown, currentExportFormat);
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      // silent
    } finally {
      document.body.removeChild(textarea);
    }
  }

  // Copy button
  copyBtn.addEventListener("click", function () {
    if (!currentMarkdown) return;

    var exported = convertExportFormat(currentMarkdown, currentExportFormat);
    doCopy(exported);
    copyBtn.classList.add("copied");
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg> Copied!';
    showStatus("Copied to clipboard!", "success");
    setTimeout(function () {
      copyBtn.classList.remove("copied");
      copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" stroke="currentColor" stroke-width="1.3"/></svg> Copy';
    }, 2000);
  });

  // Download button
  downloadBtn.addEventListener("click", function () {
    if (!currentMarkdown) return;

    var exported = convertExportFormat(currentMarkdown, currentExportFormat);
    var info = getExportInfo(currentExportFormat);
    var blob = new Blob([exported], { type: info.mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");

    var safeName = (document.getElementById("pageTitle").textContent || "page")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 80);

    a.href = url;
    a.download = safeName + info.ext;
    a.click();
    URL.revokeObjectURL(url);
    showStatus("Downloaded: " + safeName + info.ext, "success");
  });

  // --- Helpers ---

  function setLoading(loading) {
    if (loading) {
      convertBtn.disabled = true;
      convertBtn.innerHTML = '<span class="spinner"></span> Converting...';
    } else {
      convertBtn.disabled = false;
      convertBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2h4l2 2h6v10H2V2z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 7l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg> Convert';
    }
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status " + type;
  }

  function hideStatus() {
    statusEl.className = "status hidden";
  }
});
