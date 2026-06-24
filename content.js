/**
 * Content script for the PageToMD extension (v1.3).
 * Extracts web page content and converts it to Markdown using Turndown.
 * Supports front matter templates, TOC, image handling, multiple export formats,
 * custom rules, and readability scoring.
 */

(function () {
  "use strict";

  var TRACKING_PARAMS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "gclsrc", "dclid", "msclkid",
    "mc_eid", "mc_cid", "_ga", "_gl", "_hsenc", "_hsmi",
    "hsCtaTracking", "vero_id", "oly_anon_id", "oly_enc_id",
    "otc", "igshid", "wickedid", "twclid", "ttclid", "li_fat_id",
    "sc_ref", "si"
  ];

  browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {

    if (request.action === "convertToMarkdown") {
      try {
        var opts = request.options || {};
        var markdown = convertPageToMarkdown(opts);
        var readability = calculateReadability(markdown);
        sendResponse({ success: true, markdown: markdown, readability: readability });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "getSelection") {
      try {
        var selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          var range = selection.getRangeAt(0);
          var html = range.cloneContents();
          var div = document.createElement("div");
          div.appendChild(html);
          sendResponse({ success: true, html: div.innerHTML, hasSelection: true });
        } else {
          sendResponse({ success: true, html: null, hasSelection: false });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "convertSelection") {
      try {
        var opts = request.options || {};
        var turndownService = createTurndownService(opts);
        var markdown = turndownService.turndown(request.html);
        var readability = calculateReadability(markdown);
        sendResponse({ success: true, markdown: markdown, readability: readability });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "contextConvertPage") {
      try {
        var opts = request.options || {};
        var markdown = convertPageToMarkdown(opts);
        copyToClipboard(markdown);
        sendResponse({ success: true, markdown: markdown });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "contextConvertSelection") {
      try {
        var selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          var range = selection.getRangeAt(0);
          var html = range.cloneContents();
          var div = document.createElement("div");
          div.appendChild(html);
          var opts = request.options || {};
          var turndownService = createTurndownService(opts);
          var markdown = turndownService.turndown(div.innerHTML);
          copyToClipboard(markdown);
          sendResponse({ success: true, markdown: markdown });
        } else {
          sendResponse({ success: false, error: "No text selected." });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  });

  function copyToClipboard(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {}
    document.body.removeChild(textarea);
  }

  /**
   * Create a configured TurndownService instance.
   */
  function createTurndownService(opts) {
    opts = opts || {};

    var headingStyle = opts.headingStyle || "atx";

    var service = new TurndownService({
      headingStyle: headingStyle,
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
    });

    // Custom rule: images with handling modes
    service.addRule("images", {
      filter: "img",
      replacement: function (content, node) {
        if (opts.imageMode === "strip") {
          return node.alt || content || "";
        }

        var alt = node.alt || content || "image";
        var src = node.getAttribute("src") || "";

        // Convert relative URLs to absolute
        if (opts.imageMode === "absolute" && src) {
          try {
            src = new URL(src, window.location.origin).href;
          } catch (e) {}
        }

        if (opts.stripTracking) {
          src = stripTrackingParams(src);
        }

        var title = node.getAttribute("title") || "";
        if (title) {
          return "![" + alt + "](" + src + ' "' + title + '")';
        }
        return "![" + alt + "](" + src + ")";
      },
    });

    // Custom rule: links with tracking param stripping
    service.addRule("links", {
      filter: function (node) {
        return node.nodeName === "A" && node.getAttribute("href");
      },
      replacement: function (content, node) {
        var href = node.getAttribute("href") || "";
        if (opts.stripTracking) {
          href = stripTrackingParams(href);
        }
        var title = node.getAttribute("title") || "";
        if (title) {
          return "[" + content + "](" + href + ' "' + title + '")';
        }
        return "[" + content + "](" + href + ")";
      },
    });

    // Custom rule: code blocks
    service.addRule("codeBlock", {
      filter: function (node) {
        return (
          node.nodeName === "PRE" &&
          node.firstChild &&
          node.firstChild.nodeName === "CODE"
        );
      },
      replacement: function (content, node) {
        var codeEl = node.firstChild;
        var langMatch = (codeEl.getAttribute("class") || "").match(/language-(\w+)/);
        var language = langMatch ? langMatch[1] : "";
        return "\n```" + language + "\n" + content.trimEnd() + "\n```\n";
      },
    });

    // Custom rule: tables
    service.addRule("table", {
      filter: "table",
      replacement: function (content, node) {
        return convertTable(node) + "\n";
      },
    });

    return service;
  }

  function stripTrackingParams(url) {
    try {
      var urlObj = new URL(url, window.location.origin);
      var keys = Object.keys(urlObj.searchParams);
      for (var i = 0; i < keys.length; i++) {
        if (TRACKING_PARAMS.indexOf(keys[i].toLowerCase()) !== -1) {
          urlObj.searchParams.delete(keys[i]);
        }
      }
      return urlObj.toString();
    } catch (e) {
      return url;
    }
  }

  function shiftHeadingLevels(markdown, offset) {
    if (!offset || offset === 0) return markdown;
    return markdown.replace(/^(#{1,6})\s/gm, function (match, hashes) {
      var level = hashes.length + offset;
      level = Math.max(1, Math.min(6, level));
      var newHashes = "";
      for (var i = 0; i < level; i++) {
        newHashes += "#";
      }
      return newHashes + " ";
    });
  }

  function estimateReadingTime(text) {
    var clean = text.replace(/^---[\s\S]*?---\n\n/, "");
    clean = clean.replace(/[#*`\[\]()>|~-]/g, "");
    clean = clean.replace(/\s+/g, " ").trim();
    var words = clean.split(" ").length;
    var minutes = Math.round(words / 200);
    if (minutes < 1) minutes = 1;
    return minutes;
  }

  function countWords(text) {
    var clean = text.replace(/^---[\s\S]*?---\n\n/, "");
    clean = clean.replace(/[#*`\[\]()>|~-]/g, "");
    clean = clean.replace(/\s+/g, " ").trim();
    return clean.split(" ").filter(function (w) { return w.length > 0; }).length;
  }

  /**
   * Calculate readability scores for the converted text.
   * Returns Flesch-Kincaid Grade Level and Flesch Reading Ease.
   */
  function calculateReadability(markdown) {
    // Strip front matter and markdown formatting for text analysis
    var text = markdown.replace(/^---[\s\S]*?---\n\n/, "");
    text = text.replace(/[#*`\[\]()>|~_\-]/g, " ");
    text = text.replace(/```[\s\S]*?```/g, " ");
    text = text.replace(/\s+/g, " ").trim();

    // Count sentences (approximate: split on . ! ?)
    var sentences = text.split(/[.!?]+/).filter(function (s) { return s.trim().length > 0; });
    var sentenceCount = sentences.length || 1;

    // Count words
    var words = text.split(/\s+/).filter(function (w) { return w.length > 0; });
    var wordCount = words.length || 1;

    // Count syllables (approximate algorithm)
    var syllableCount = 0;
    for (var i = 0; i < words.length; i++) {
      syllableCount += countSyllables(words[i]);
    }

    // Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
    var readingEase = 206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * (syllableCount / wordCount));
    readingEase = Math.round(readingEase * 10) / 10;
    readingEase = Math.max(0, Math.min(100, readingEase));

    // Flesch-Kincaid Grade Level: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    var gradeLevel = (0.39 * (wordCount / sentenceCount)) + (11.8 * (syllableCount / wordCount)) - 15.59;
    gradeLevel = Math.round(gradeLevel * 10) / 10;
    gradeLevel = Math.max(0, gradeLevel);

    // Determine a human-friendly label
    var label, labelColor;
    if (readingEase >= 90) { label = "Very Easy"; labelColor = "green"; }
    else if (readingEase >= 70) { label = "Easy"; labelColor = "green"; }
    else if (readingEase >= 60) { label = "Standard"; labelColor = "yellow"; }
    else if (readingEase >= 40) { label = "Fairly Difficult"; labelColor = "orange"; }
    else { label = "Difficult"; labelColor = "red"; }

    return {
      readingEase: readingEase,
      gradeLevel: gradeLevel,
      label: label,
      labelColor: labelColor,
      wordCount: wordCount,
      sentenceCount: sentenceCount,
      syllableCount: syllableCount
    };
  }

  /**
   * Approximate syllable count for a single word.
   */
  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (word.length <= 3) return 1;

    var count = 0;
    var vowels = "aeiouy";
    var prevWasVowel = false;

    for (var i = 0; i < word.length; i++) {
      var isVowel = vowels.indexOf(word[i]) !== -1;
      if (isVowel && !prevWasVowel) {
        count++;
      }
      prevWasVowel = isVowel;
    }

    // Adjust for silent e at end
    if (word.endsWith("e") && count > 1) {
      count--;
    }

    // Adjust for common suffixes
    if (word.endsWith("le") && word.length > 2 && vowels.indexOf(word[word.length - 3]) === -1) {
      count++;
    }

    return Math.max(1, count);
  }

  /**
   * Extract description from page (meta description or first paragraph).
   */
  function extractDescription() {
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.getAttribute("content")) {
      return metaDesc.getAttribute("content").substring(0, 200);
    }
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.getAttribute("content")) {
      return ogDesc.getAttribute("content").substring(0, 200);
    }
    return "";
  }

  /**
   * Extract tags/keywords from the page.
   */
  function extractTags() {
    var metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords && metaKeywords.getAttribute("content")) {
      var raw = metaKeywords.getAttribute("content");
      return raw.split(",").map(function (t) { return t.trim().replace(/"/g, ""); });
    }
    return [];
  }

  /**
   * Extract author from the page.
   */
  function extractAuthor() {
    var metaAuthor = document.querySelector('meta[name="author"]');
    if (metaAuthor) return metaAuthor.getAttribute("content") || "";
    var ldJson = document.querySelector('script[type="application/ld+json"]');
    if (ldJson) {
      try {
        var data = JSON.parse(ldJson.textContent);
        if (data.author && typeof data.author === "string") return data.author;
        if (data.author && data.author.name) return data.author.name;
      } catch (e) {}
    }
    return "";
  }

  /**
   * Generate a table of contents from markdown headings.
   */
  function generateTableOfContents(markdown) {
    var headingRegex = /^(#{1,6})\s+(.+)$/gm;
    var entries = [];
    var match;
    while ((match = headingRegex.exec(markdown)) !== null) {
      var level = match[1].length;
      var text = match[2].trim();
      // Strip inline formatting for the TOC link
      var linkText = text.replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[(.+?)\]\([^)]+\)/g, "$1");
      // Generate anchor: lowercase, spaces to hyphens, strip special chars
      var anchor = linkText.toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      entries.push({ level: level, text: linkText, anchor: anchor });
    }

    if (entries.length === 0) return "";

    var toc = "## Table of Contents\n\n";
    for (var i = 0; i < entries.length; i++) {
      var indent = "";
      for (var j = 2; j < entries[i].level; j++) {
        indent += "  ";
      }
      // Skip h1 from TOC (it is usually the page title)
      if (entries[i].level <= 1) continue;
      toc += indent + "- [" + entries[i].text + "](#" + entries[i].anchor + ")\n";
    }
    toc += "\n";
    return toc;
  }

  /**
   * Build front matter string based on template type.
   */
  function buildFrontMatter(opts) {
    var title = document.title || "Untitled Page";
    var url = window.location.href;
    var date = new Date().toISOString().split("T")[0];
    var dateISO = new Date().toISOString();
    var readingTime = estimateReadingTime("");
    var description = extractDescription();
    var tags = extractTags();
    var author = extractAuthor();
    var template = opts.frontMatterTemplate || "generic";

    switch (template) {
      case "jekyll":
        return "---\n" +
          "layout: post\n" +
          'title: "' + title.replace(/"/g, '\\"') + '"\n' +
          (description ? 'description: "' + description.replace(/"/g, '\\"') + '"\n' : "") +
          'date: ' + dateISO + '\n' +
          (author ? 'author: ' + author + '\n' : "") +
          (tags.length > 0 ? 'tags: [' + tags.map(function (t) { return '"' + t + '"'; }).join(", ") + ']\n' : "") +
          'source: "' + url + '"\n' +
          "---\n\n";

      case "hugo":
        return "---\n" +
          'title: "' + title.replace(/"/g, '\\"') + '"\n' +
          'date: ' + dateISO + '\n' +
          'lastmod: ' + dateISO + '\n' +
          (description ? 'description: "' + description.replace(/"/g, '\\"') + '"\n' : "") +
          (author ? 'author: [' + author + ']\n' : "") +
          (tags.length > 0 ? 'tags: [' + tags.map(function (t) { return '"' + t + '"'; }).join(", ") + ']\n' : "") +
          'source: "' + url + '"\n' +
          'reading_time: "' + readingTime + ' min"\n' +
          "---\n\n";

      case "obsidian":
        return "---\n" +
          'title: "' + title.replace(/"/g, '\\"') + '"\n' +
          'source: "' + url + '"\n' +
          'date: ' + date + '\n' +
          (tags.length > 0 ? 'tags: [' + tags.map(function (t) { return '"' + t + '"'; }).join(", ") + ']\n' : "") +
          (description ? 'description: "' + description.replace(/"/g, '\\"') + '"\n' : "") +
          "---\n\n";

      case "astro":
        return "---\n" +
          'title: "' + title.replace(/"/g, '\\"') + '"\n' +
          'published: ' + dateISO + '\n' +
          (description ? 'description: "' + description.replace(/"/g, '\\"') + '"\n' : "") +
          (author ? 'author: "' + author + '"\n' : "") +
          (tags.length > 0 ? 'tags: [' + tags.map(function (t) { return '"' + t + '"'; }).join(", ") + ']\n' : "") +
          'source: "' + url + '"\n' +
          'reading_time: "' + readingTime + ' min"\n' +
          "---\n\n";

      default: // generic
        return "---\n" +
          'title: "' + title.replace(/"/g, '\\"') + '"\n' +
          'source: "' + url + '"\n' +
          'date: "' + date + '"\n' +
          (author ? 'author: "' + author + '"\n' : "") +
          (description ? 'description: "' + description.replace(/"/g, '\\"') + '"\n' : "") +
          (tags.length > 0 ? 'tags: [' + tags.map(function (t) { return '"' + t + '"'; }).join(", ") + ']\n' : "") +
          "---\n\n";
    }
  }

  /**
   * Apply custom rules defined by the user in settings.
   */
  function applyCustomRules(node, rules) {
    if (!rules || !Array.isArray(rules) || rules.length === 0) return;

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule.selector || !rule.action) continue;

      try {
        var els = node.querySelectorAll(rule.selector);
        for (var j = 0; j < els.length; j++) {
          if (rule.action === "remove") {
            els[j].remove();
          } else if (rule.action === "unwrap") {
            // Replace element with its children (keep content, lose the tag)
            var parent = els[j].parentNode;
            while (els[j].firstChild) {
              parent.insertBefore(els[j].firstChild, els[j]);
            }
            parent.removeChild(els[j]);
          } else if (rule.action === "collapse") {
            // Replace element with its plain text content
            var text = document.createTextNode(els[j].textContent + "\n");
            els[j].parentNode.replaceChild(text, els[j]);
          }
        }
      } catch (e) {
        // Invalid selector or other error, skip this rule
      }
    }
  }

  /**
   * Main conversion: extract page HTML, clean it, convert to Markdown.
   */
  function convertPageToMarkdown(opts) {
    opts = opts || {};
    var title = document.title || "Untitled Page";

    var html = extractMainContent();
    var node = html; // This is a cloned DOM node

    // Apply custom rules before cleaning
    applyCustomRules(node, opts.customRules);

    var cleanedHTML = cleanHTML(node);

    var turndownService = createTurndownService(opts);
    var markdown = turndownService.turndown(cleanedHTML);

    // Shift heading levels if requested
    if (opts.shiftHeadings) {
      markdown = shiftHeadingLevels(markdown, opts.shiftHeadings);
    }

    // Build front matter (with reading time based on actual content)
    var frontMatter = buildFrontMatter(opts);

    // Add word count and reading time to generic front matter
    var wordCount = countWords(markdown);
    var readingTime = estimateReadingTime(markdown);

    // For generic template, append reading time and word count
    if (opts.frontMatterTemplate === "generic" || !opts.frontMatterTemplate) {
      // Rebuild generic front matter with counts
      frontMatter = buildFrontMatter(opts);
      // Insert before closing ---
      frontMatter = frontMatter.replace(/---\n$/,
        'reading_time: "' + readingTime + ' min"\n' +
        'word_count: ' + wordCount + '\n---\n');
    }

    // Generate table of contents if requested
    var toc = "";
    if (opts.generateToc) {
      toc = generateTableOfContents(markdown);
    }

    markdown = frontMatter + "# " + title + "\n\n" + toc + markdown;
    return markdown;
  }

  function extractMainContent() {
    var selectors = [
      "article",
      '[role="article"]',
      "main",
      '[role="main"]',
      ".post-content",
      ".article-content",
      ".entry-content",
      ".content",
      "#content",
      "#main-content",
      "#article-content",
      ".markdown-body",
      ".prose",
      ".doc-content",
      "section",
    ];

    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.innerText.trim().length > 200) {
        return el.cloneNode(true);
      }
    }

    return document.body.cloneNode(true);
  }

  function cleanHTML(node) {
    var removeSelectors = [
      "script", "style", "noscript", "iframe", "svg", "nav", "header", "footer",
      ".sidebar", "#sidebar", ".ad", ".ads", ".advertisement", ".related-posts",
      ".comments", "#comments", ".share", ".social-share", ".cookie-banner",
      ".popup", ".modal", ".newsletter",
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    ];

    for (var i = 0; i < removeSelectors.length; i++) {
      var els = node.querySelectorAll(removeSelectors[i]);
      for (var j = 0; j < els.length; j++) {
        els[j].remove();
      }
    }

    var hidden = node.querySelectorAll('[style*="display:none"], [style*="display: none"], [hidden], [aria-hidden="true"]');
    for (var k = 0; k < hidden.length; k++) {
      hidden[k].remove();
    }

    return node.innerHTML;
  }

  function convertTable(tableNode) {
    var rows = [];
    var allRows = tableNode.querySelectorAll("tr");

    for (var i = 0; i < allRows.length; i++) {
      var cells = allRows[i].querySelectorAll("th, td");
      var rowText = [];

      for (var j = 0; j < cells.length; j++) {
        rowText.push(cells[j].textContent.trim().replace(/\|/g, "\\|"));
      }

      rows.push("| " + rowText.join(" | ") + " |");

      if (i === 0 || allRows[i].querySelector("th")) {
        var separator = rowText.map(function () { return "---"; }).join(" | ");
        rows.push("| " + separator + " |");
      }
    }

    return rows.join("\n");
  }
})();
