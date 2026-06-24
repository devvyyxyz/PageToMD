/**
 * Options page script for PageToMD (v1.3).
 * Manages settings persistence, cloud sync configuration, and custom rules.
 */

document.addEventListener("DOMContentLoaded", function () {
  // DOM references
  var cloudService = document.getElementById("cloudService");
  var cloudConfig = document.getElementById("cloudConfig");
  var githubFields = document.getElementById("githubFields");
  var dropboxFields = document.getElementById("dropboxFields");
  var gdriveFields = document.getElementById("gdriveFields");
  var testCloudBtn = document.getElementById("testCloudBtn");
  var cloudTestResult = document.getElementById("cloudTestResult");
  var rulesList = document.getElementById("rulesList");
  var rulesEmpty = document.getElementById("rulesEmpty");
  var addRuleBtn = document.getElementById("addRuleBtn");
  var saveBtn = document.getElementById("saveBtn");
  var saveStatus = document.getElementById("saveStatus");

  var currentRules = [];

  // Show/hide cloud fields based on selected service
  cloudService.addEventListener("change", updateCloudVisibility);

  function updateCloudVisibility() {
    var service = cloudService.value;
    cloudConfig.classList.toggle("hidden", !service);
    testCloudBtn.classList.toggle("hidden", !service);
    githubFields.classList.toggle("hidden", service !== "github");
    dropboxFields.classList.toggle("hidden", service !== "dropbox");
    gdriveFields.classList.toggle("hidden", service !== "gdrive");
    cloudTestResult.classList.add("hidden");
  }

  // Test cloud connection
  testCloudBtn.addEventListener("click", function () {
    var service = cloudService.value;
    cloudTestResult.classList.remove("hidden", "success", "error");
    cloudTestResult.textContent = "Testing connection...";
    cloudTestResult.classList.add("success");

    if (service === "github") {
      var token = document.getElementById("githubToken").value.trim();
      var owner = document.getElementById("githubOwner").value.trim();
      var repo = document.getElementById("githubRepo").value.trim();
      if (!token || !owner || !repo) {
        showTestResult(false, "Please fill in token, owner, and repo.");
        return;
      }
      fetch("https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo), {
        headers: { "Authorization": "token " + token, "Accept": "application/vnd.github.v3+json" }
      }).then(function (r) {
        if (r.ok) { showTestResult(true, "Connected! Repository found."); }
        else { return r.json().then(function (d) { showTestResult(false, "Error: " + (d.message || r.status)); }); }
      }).catch(function (e) { showTestResult(false, "Network error: " + e.message); });

    } else if (service === "dropbox") {
      var token = document.getElementById("dropboxToken").value.trim();
      if (!token) { showTestResult(false, "Please fill in the access token."); return; }
      fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({})
      }).then(function (r) {
        if (r.ok) { return r.json().then(function (d) { showTestResult(true, "Connected! Logged in as " + (d.name.display_name || "unknown")); }); }
        else { return r.json().then(function (d) { showTestResult(false, "Error: " + (d.error_summary || r.status)); }); }
      }).catch(function (e) { showTestResult(false, "Network error: " + e.message); });

    } else if (service === "gdrive") {
      var token = document.getElementById("gdriveToken").value.trim();
      if (!token) { showTestResult(false, "Please fill in the access token."); return; }
      fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { "Authorization": "Bearer " + token }
      }).then(function (r) {
        if (r.ok) { return r.json().then(function (d) { showTestResult(true, "Connected! Logged in as " + (d.user.emailAddress || "unknown")); }); }
        else { return r.json().then(function (d) { showTestResult(false, "Error: " + (d.error.message || r.status)); }); }
      }).catch(function (e) { showTestResult(false, "Network error: " + e.message); });
    }
  });

  function showTestResult(success, message) {
    cloudTestResult.classList.remove("hidden", "success", "error");
    cloudTestResult.textContent = message;
    cloudTestResult.classList.add(success ? "success" : "error");
  }

  // Custom rules management
  function renderRules() {
    rulesList.innerHTML = "";
    rulesEmpty.classList.toggle("hidden", currentRules.length > 0);

    currentRules.forEach(function (rule, index) {
      var card = document.createElement("div");
      card.className = "rule-card";
      card.innerHTML =
        '<div class="rule-info">' +
          '<div class="rule-name">' + escapeHtml(rule.name) + '</div>' +
          '<div class="rule-detail">' +
            '<span class="rule-badge ' + rule.action + '">' + rule.action + '</span> ' +
            escapeHtml(rule.selector) +
          '</div>' +
        '</div>' +
        '<button class="rule-delete" data-index="' + index + '" title="Delete rule">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg>' +
        '</button>';
      rulesList.appendChild(card);
    });

    // Attach delete handlers
    var deleteBtns = rulesList.querySelectorAll(".rule-delete");
    for (var i = 0; i < deleteBtns.length; i++) {
      deleteBtns[i].addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-index"), 10);
        currentRules.splice(idx, 1);
        renderRules();
      });
    }
  }

  addRuleBtn.addEventListener("click", function () {
    var name = document.getElementById("ruleName").value.trim();
    var action = document.getElementById("ruleAction").value;
    var selector = document.getElementById("ruleSelector").value.trim();

    if (!name || !selector) {
      saveStatus.textContent = "Please fill in rule name and selector.";
      saveStatus.className = "save-status";
      return;
    }

    // Validate selector
    try {
      document.querySelectorAll(selector);
    } catch (e) {
      saveStatus.textContent = "Invalid CSS selector: " + e.message;
      saveStatus.className = "save-status";
      return;
    }

    currentRules.push({ name: name, action: action, selector: selector });
    document.getElementById("ruleName").value = "";
    document.getElementById("ruleSelector").value = "";
    renderRules();
  });

  // Save settings
  saveBtn.addEventListener("click", function () {
    var settings = {};

    // Collect checkbox and select defaults
    var checkboxes = document.querySelectorAll('[data-key]');
    for (var i = 0; i < checkboxes.length; i++) {
      var el = checkboxes[i];
      if (el.type === "checkbox") {
        settings[el.getAttribute("data-key")] = el.checked;
      } else {
        settings[el.getAttribute("data-key")] = el.value;
      }
    }

    // Cloud config
    settings.cloudService = cloudService.value;
    if (cloudService.value === "github") {
      settings.githubToken = document.getElementById("githubToken").value.trim();
      settings.githubOwner = document.getElementById("githubOwner").value.trim();
      settings.githubRepo = document.getElementById("githubRepo").value.trim();
      settings.githubPath = document.getElementById("githubPath").value.trim();
    }
    if (cloudService.value === "dropbox") {
      settings.dropboxToken = document.getElementById("dropboxToken").value.trim();
      settings.dropboxPath = document.getElementById("dropboxPath").value.trim();
    }
    if (cloudService.value === "gdrive") {
      settings.gdriveToken = document.getElementById("gdriveToken").value.trim();
      settings.gdriveFolderId = document.getElementById("gdriveFolderId").value.trim();
    }

    // Custom rules
    settings.customRules = currentRules;

    browser.storage.local.set({ pagetomd_settings: settings }).then(function () {
      saveStatus.textContent = "Settings saved!";
      saveStatus.className = "save-status saved";
      setTimeout(function () { saveStatus.textContent = ""; }, 3000);
    }).catch(function (err) {
      saveStatus.textContent = "Error saving: " + err.message;
      saveStatus.className = "save-status";
    });
  });

  // Load settings on init
  browser.storage.local.get("pagetomd_settings").then(function (result) {
    var settings = result.pagetomd_settings || {};

    // Populate checkboxes and selects
    var checkboxes = document.querySelectorAll('[data-key]');
    for (var i = 0; i < checkboxes.length; i++) {
      var el = checkboxes[i];
      var key = el.getAttribute("data-key");
      if (settings[key] !== undefined) {
        if (el.type === "checkbox") {
          el.checked = settings[key];
        } else {
          el.value = settings[key];
        }
      }
    }

    // Cloud config
    if (settings.cloudService) {
      cloudService.value = settings.cloudService;
    }
    if (settings.githubToken) document.getElementById("githubToken").value = settings.githubToken;
    if (settings.githubOwner) document.getElementById("githubOwner").value = settings.githubOwner;
    if (settings.githubRepo) document.getElementById("githubRepo").value = settings.githubRepo;
    if (settings.githubPath) document.getElementById("githubPath").value = settings.githubPath;
    if (settings.dropboxToken) document.getElementById("dropboxToken").value = settings.dropboxToken;
    if (settings.dropboxPath) document.getElementById("dropboxPath").value = settings.dropboxPath;
    if (settings.gdriveToken) document.getElementById("gdriveToken").value = settings.gdriveToken;
    if (settings.gdriveFolderId) document.getElementById("gdriveFolderId").value = settings.gdriveFolderId;

    updateCloudVisibility();

    // Custom rules
    if (settings.customRules && Array.isArray(settings.customRules)) {
      currentRules = settings.customRules;
    }
    renderRules();
  });

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});
