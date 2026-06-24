/**
 * Background script for the PageToMD extension (v1.3).
 * Handles context menus, keyboard shortcuts, batch conversion, and cloud sync.
 */

// Create right-click context menus on install
browser.runtime.onInstalled.addListener(function () {
  browser.contextMenus.create({
    id: "pagetomd-convert-page",
    title: "Convert page to Markdown",
    contexts: ["page", "link"]
  });

  browser.contextMenus.create({
    id: "pagetomd-convert-selection",
    title: "Convert selection to Markdown",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === "pagetomd-convert-page") {
    browser.tabs.sendMessage(tab.id, { action: "contextConvertPage" }).catch(function () {
      // Content script not injected yet, do it on-demand
      browser.tabs.executeScript(tab.id, { file: "turndown.js" }).then(function () {
        return browser.tabs.executeScript(tab.id, { file: "content.js" });
      }).then(function () {
        return browser.tabs.sendMessage(tab.id, { action: "contextConvertPage" });
      });
    });
  }

  if (info.menuItemId === "pagetomd-convert-selection") {
    browser.tabs.sendMessage(tab.id, { action: "contextConvertSelection" }).catch(function () {
      browser.tabs.executeScript(tab.id, { file: "turndown.js" }).then(function () {
        return browser.tabs.executeScript(tab.id, { file: "content.js" });
      }).then(function () {
        return browser.tabs.sendMessage(tab.id, { action: "contextConvertSelection" });
      });
    });
  }
});

// Handle keyboard shortcut
browser.commands.onCommand.addListener(function (command) {
  if (command === "_execute_action") {
    if (browser.browserAction && browser.browserAction.openPopup) {
      browser.browserAction.openPopup().catch(function () {});
    }
  }
});

// ===== Message handler for popup communication =====
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  // Batch convert all open tabs
  if (request.action === "batchConvert") {
    batchConvertTabs(request.options).then(function (results) {
      sendResponse(results);
    }).catch(function (err) {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }

  // Save to cloud
  if (request.action === "saveToCloud") {
    saveToCloud(request.content, request.filename, request.format).then(function (result) {
      sendResponse(result);
    }).catch(function (err) {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }

  // Get settings
  if (request.action === "getSettings") {
    browser.storage.local.get("pagetomd_settings").then(function (result) {
      sendResponse({ success: true, settings: result.pagetomd_settings || {} });
    }).catch(function (err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// ===== Batch Convert =====
function batchConvertTabs(opts) {
  opts = opts || {};

  return browser.tabs.query({ currentWindow: true }).then(function (tabs) {
    // Filter to only http/https tabs
    var convertibleTabs = tabs.filter(function (tab) {
      return tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://"));
    });

    if (convertibleTabs.length === 0) {
      return { success: false, error: "No convertible tabs found." };
    }

    var results = [];
    var converted = 0;
    var failed = 0;

    // Process tabs sequentially to avoid overwhelming the browser
    var index = 0;

    function processNext() {
      if (index >= convertibleTabs.length) {
        return Promise.resolve({
          success: true,
          converted: converted,
          failed: failed,
          total: convertibleTabs.length,
          results: results
        });
      }

      var tab = convertibleTabs[index];
      index++;

      return convertSingleTab(tab, opts).then(function (result) {
        if (result.success) {
          converted++;
          results.push(result);
        } else {
          failed++;
          results.push({ tabId: tab.id, title: tab.title, url: tab.url, success: false, error: result.error });
        }
        return processNext();
      }).catch(function (err) {
        failed++;
        results.push({ tabId: tab.id, title: tab.title, url: tab.url, success: false, error: err.message });
        return processNext();
      });
    }

    return processNext();
  });
}

function convertSingleTab(tab, opts) {
  return browser.tabs.executeScript(tab.id, { file: "turndown.js" }).then(function () {
    return browser.tabs.executeScript(tab.id, { file: "content.js" });
  }).then(function () {
    return browser.tabs.sendMessage(tab.id, {
      action: "convertToMarkdown",
      options: opts
    });
  }).then(function (response) {
    if (!response || !response.success) {
      return Promise.reject(new Error(response ? response.error : "Conversion failed"));
    }

    // Download the file
    var safeName = (tab.title || "page")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 80);

    var ext = ".md";
    var mime = "text/markdown;charset=utf-8";
    if (opts.exportFormat === "html") { ext = ".html"; mime = "text/html;charset=utf-8"; }
    else if (opts.exportFormat === "txt") { ext = ".txt"; mime = "text/plain;charset=utf-8"; }
    else if (opts.exportFormat === "rst") { ext = ".rst"; mime = "text/x-rst;charset=utf-8"; }

    var blob = new Blob([response.markdown], { type: mime });
    var reader = new FileReader();
    return new Promise(function (resolve, reject) {
      reader.onload = function () {
        var dataUrl = reader.result;
        browser.downloads.download({
          url: dataUrl,
          filename: safeName + ext,
          saveAs: false
        }).then(function (downloadId) {
          resolve({
            tabId: tab.id,
            title: tab.title,
            url: tab.url,
            filename: safeName + ext,
            downloadId: downloadId,
            success: true
          });
        }).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });
}

// ===== Cloud Sync =====
function saveToCloud(content, filename, format) {
  return browser.storage.local.get("pagetomd_settings").then(function (result) {
    var settings = result.pagetomd_settings || {};
    var service = settings.cloudService;

    if (!service) {
      return { success: false, error: "No cloud service configured. Open settings to set one up." };
    }

    if (service === "github") {
      return saveToGitHub(content, filename, settings);
    } else if (service === "dropbox") {
      return saveToDropbox(content, filename, settings);
    } else if (service === "gdrive") {
      return saveToGoogleDrive(content, filename, settings);
    } else {
      return { success: false, error: "Unknown cloud service: " + service };
    }
  });
}

function saveToGitHub(content, filename, settings) {
  var token = settings.githubToken;
  var owner = settings.githubOwner;
  var repo = settings.githubRepo;
  var path = (settings.githubPath || "").replace(/^\/|\/$/g, "");

  if (!token || !owner || !repo) {
    return Promise.resolve({ success: false, error: "GitHub not fully configured. Check settings." });
  }

  var fullPath = path ? path + "/" + filename : filename;
  var contentB64 = btoa(unescape(encodeURIComponent(content)));

  // Check if file already exists (to get SHA for update)
  var apiUrl = "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + encodeURIComponent(fullPath);

  return fetch(apiUrl, {
    headers: {
      "Authorization": "token " + token,
      "Accept": "application/vnd.github.v3+json"
    }
  }).then(function (r) {
    if (r.ok) {
      return r.json().then(function (data) { return data.sha; });
    }
    return null; // File doesn't exist yet
  }).then(function (sha) {
    var body = {
      message: "Add " + filename + " via PageToMD",
      content: contentB64
    };
    if (sha) {
      body.sha = sha;
    }

    return fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": "token " + token,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }).then(function (r) {
    if (r.ok) {
      return { success: true, service: "GitHub", path: owner + "/" + repo + "/" + fullPath };
    }
    return r.json().then(function (d) {
      return { success: false, error: "GitHub error: " + (d.message || r.status) };
    });
  }).catch(function (e) {
    return { success: false, error: "GitHub network error: " + e.message };
  });
}

function saveToDropbox(content, filename, settings) {
  var token = settings.dropboxToken;
  var path = settings.dropboxPath || "/Markdown";

  if (!token) {
    return Promise.resolve({ success: false, error: "Dropbox not configured. Check settings." });
  }

  // Ensure leading slash on path
  if (!path.startsWith("/")) path = "/" + path;
  var fullPath = path.replace(/\/+$/, "") + "/" + filename;

  return fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: fullPath,
        mode: "add",
        autorename: true
      })
    },
    body: content
  }).then(function (r) {
    if (r.ok) {
      return r.json().then(function (d) {
        return { success: true, service: "Dropbox", path: d.path_display || fullPath };
      });
    }
    return r.json().then(function (d) {
      return { success: false, error: "Dropbox error: " + (d.error_summary || r.status) };
    });
  }).catch(function (e) {
    return { success: false, error: "Dropbox network error: " + e.message };
  });
}

function saveToGoogleDrive(content, filename, settings) {
  var token = settings.gdriveToken;
  var folderId = settings.gdriveFolderId || "";

  if (!token) {
    return Promise.resolve({ success: false, error: "Google Drive not configured. Check settings." });
  }

  // Determine MIME type from filename extension
  var mime = "text/markdown";
  if (filename.endsWith(".html")) mime = "text/html";
  else if (filename.endsWith(".txt")) mime = "text/plain";
  else if (filename.endsWith(".rst")) mime = "text/x-rst";

  var metadata = {
    name: filename,
    mimeType: mime
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  var boundary = "pagetomd_boundary_" + Date.now();
  var body = "--" + boundary + "\r\n" +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Type: " + mime + "\r\n\r\n" +
    content + "\r\n" +
    "--" + boundary + "--";

  return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "multipart/related; boundary=" + boundary
    },
    body: body
  }).then(function (r) {
    if (r.ok) {
      return r.json().then(function (d) {
        return { success: true, service: "Google Drive", fileId: d.id, name: d.name };
      });
    }
    return r.json().then(function (d) {
      return { success: false, error: "Google Drive error: " + (d.error ? d.error.message : r.status) };
    });
  }).catch(function (e) {
    return { success: false, error: "Google Drive network error: " + e.message };
  });
}
