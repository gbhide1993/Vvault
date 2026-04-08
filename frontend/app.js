const BASE_URL = "/api";

// ---------- INIT ----------
async function initApp() {
  const token = localStorage.getItem("token");
  if (!token) {
    document.getElementById("login-container").style.display = "block";
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: authHeaders()
    });
    if (!res.ok) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      document.getElementById("login-container").style.display = "block";
      return;
    }
    document.getElementById("login-container")?.style.setProperty("display", "none");
    document.getElementById("setup-container")?.style.setProperty("display", "none");
    showApp();
  } catch (err) {
    console.error("initApp error:", err);
    document.getElementById("login-container").style.display = "block";
  }
}

document.addEventListener("DOMContentLoaded", initApp);

let selectedIds = new Set();
let finalFileBlob = null;
let isProcessing = false;
let currentRunId = null;
let showLowOnly = false;

let currentPage = 1;
const pageSize = 10;

function generateExplanation(item) {
  if (!item.source_text) return "No supporting context available.";

  let text = item.source_text.replace(/\s+/g, " ").trim();

  if (text.length > 150) {
    text = text.substring(0, 150) + "...";
  }

  return "This answer is based on the following context: " + text;
}

function toggleExplanation(id) {
  const el = document.getElementById(`exp-${id}`);

  if (!el) return;

  if (el.style.display === "none") {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

function toggleLowConfidence() {
  showLowOnly = !showLowOnly;
  currentPage = 1; // Reset to first page when toggling 

  const btn = document.getElementById("lowFilterBtn");
  btn.innerText = showLowOnly ? "Show All" : "Show Low Confidence";

  loadPreview();
}

function formatSource(text) {
  if (!text) return "";

  // clean whitespace
  text = text.replace(/\s+/g, " ").trim();

  // limit length (important)
  if (text.length > 120) {
    text = text.substring(0, 120) + "...";
  }

  return "Source: " + text;
}

function getConfidenceMeta(confidence) {
  if (confidence >= 80) {
    return {
      label: "High",
      class: "green",
      warning: ""
    };
  }

  if (confidence >= 60) {
    return {
      label: "Medium",
      class: "orange",
      warning: ""
    };
  }

  return {
    label: "Low",
    class: "red",
    warning: "Needs review"
  };
}


function getCurrentUser() {
  return localStorage.getItem("user") || localStorage.getItem("username") || "";
}

function getToken() {
  return localStorage.getItem("token") || "";
}

function authHeaders() {
  return { "Authorization": `Bearer ${getToken()}` };
}

// ---------- SUMMARY ----------
function updateSummary(data) {
  const total = data.length;
  const approved = data.filter(d => d.status === "approved").length;
  const pending = data.filter(d => d.status === "pending").length;
  const rejected = data.filter(d => d.status === "rejected").length;

  const el = document.getElementById("summaryBar");
  if (el) {
    el.innerText =
      `Total: ${total} | Approved: ${approved} | Pending: ${pending} | Rejected: ${rejected}`;
  }
}


// ---------- AUTH ----------
async function completeSetup() {
  const password = document.getElementById("setupPassword").value;
  const confirm = document.getElementById("setupConfirm").value;
  const errEl = document.getElementById("setup-error");

  errEl.innerText = "";

  if (password.length < 8) {
    errEl.innerText = "Password must be at least 8 characters.";
    return;
  }
  if (password !== confirm) {
    errEl.innerText = "Passwords do not match.";
    return;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/cache/users/set-password?username=admin&new_password=${encodeURIComponent(password)}`,
      { method: "POST", headers: authHeaders() }
    );

    if (!res.ok) {
      const err = await res.json();
      errEl.innerText = err.error || err.detail || "Failed to set password.";
      return;
    }

    document.getElementById("setup-container").style.display = "none";
    showApp();
  } catch (err) {
    errEl.innerText = "Error: " + err.message;
  }
}

function setLoginError(msg) {
  const el = document.getElementById("login-error");
  if (el) el.innerText = msg;
}

async function login() {
  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("login-error");

  if (errorEl) errorEl.innerText = "";

  if (!username || !password) {
    if (errorEl) errorEl.innerText = "Enter username and password";
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const err = await res.json();
      if (errorEl) errorEl.innerText = err.detail || "Login failed";
      return;
    }

    const data = await res.json();

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", data.username);
    localStorage.setItem("role", data.role);

    document.getElementById("login-container").style.display = "none";

    if (data.requires_setup) {
      document.getElementById("setup-container").style.display = "block";
      // STOP HERE — do not load any app data until setup is complete
    } else {
      showApp();
    }

  } catch (err) {
    if (errorEl) errorEl.innerText = "Login error: " + err.message;
  }
}

function updateUserProfile() {
  const username = localStorage.getItem("user") || "";
  const role = localStorage.getItem("role") || "";

  const avatar = document.getElementById("userAvatar");
  const name = document.getElementById("userDisplayName");
  const roleEl = document.getElementById("userDisplayRole");

  if (avatar) avatar.innerText = username.charAt(0).toUpperCase();
  if (name) name.innerText = username;
  if (roleEl) roleEl.innerText = role.charAt(0).toUpperCase() + role.slice(1);
}

function showApp() {
  document.getElementById("app-container").style.display = "block";

  const role = localStorage.getItem("role");
  const section = document.querySelector("#userTable")?.closest(".section");

  if (role === "admin") {
    if (section) section.style.display = "block";
  } else {
    if (section) section.style.display = "none";
  }

  updateUserProfile();

  loadKnowledgeFiles();
  loadUsers();
  loadAuditLogs();

  // Call these only if the functions exist (added in later sprints)
  if (typeof loadRuns === "function") loadRuns();
  if (typeof loadLibrary === "function") loadLibrary();
  if (typeof restoreLastSession === "function") restoreLastSession();
}

async function loadRuns() {
  try {
    const res = await fetch(`${BASE_URL}/cache/runs`, { headers: authHeaders() });
    const runs = await res.json();

    const dropdown = document.getElementById("runsDropdown");
    if (!dropdown) return;

    dropdown.innerHTML = runs.map(r => {
      const date = new Date(r.created_at).toLocaleString();
      return `<option value="${r.run_id}">${date} - ${r.question_count} questions</option>`;
    }).join("");
  } catch (err) {
    console.error("loadRuns error:", err);
  }
}

function loadSelectedRun() {
  const dropdown = document.getElementById("runsDropdown");
  if (!dropdown || !dropdown.value) return;

  currentRunId = dropdown.value;
  localStorage.setItem("lastRunId", currentRunId);

  loadPreview();
}

async function addManualEntry() {
  const question = document.getElementById("manualQuestion").value.trim();
  const answer = document.getElementById("manualAnswer").value.trim();
  const msgEl = document.getElementById("manualEntryMsg");

  msgEl.innerText = "";

  if (question.length < 10 || answer.length < 10) {
    msgEl.style.color = "red";
    msgEl.innerText = "Question and answer must each be at least 10 characters.";
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/cache/manual`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer }),
    });

    if (!res.ok) {
      const err = await res.json();
      msgEl.style.color = "red";
      msgEl.innerText = err.detail || "Failed to add entry.";
      return;
    }

    document.getElementById("manualQuestion").value = "";
    document.getElementById("manualAnswer").value = "";
    msgEl.style.color = "green";
    msgEl.innerText = "Added to library";
    setTimeout(() => { msgEl.innerText = ""; }, 2000);

    loadLibrary();
  } catch (err) {
    msgEl.style.color = "red";
    msgEl.innerText = "Error: " + err.message;
  }
}

async function loadLibrary() {
  try {
    const search = document.getElementById("librarySearch")?.value || "";
    const url = search
      ? `${BASE_URL}/cache/library?search=${encodeURIComponent(search)}`
      : `${BASE_URL}/cache/library`;

    const res = await fetch(url, { headers: authHeaders() });
    const items = await res.json();

    const tbody = document.querySelector("#libraryTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    items.forEach(item => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="question-cell">${item.question || "-"}</td>
        <td>${item.answer || "-"}</td>
        <td>${item.source || "-"}</td>
        <td><button onclick="deleteLibraryItem(${item.id})">Delete</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("loadLibrary error:", err);
  }
}

async function deleteLibraryItem(id) {
  if (!confirm("Remove this answer from the library?")) return;

  try {
    const res = await fetch(`${BASE_URL}/cache/library/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    if (res.ok) loadLibrary();
  } catch (err) {
    console.error("deleteLibraryItem error:", err);
  }
}

async function restoreLastSession() {
  const lastRunId = localStorage.getItem("lastRunId");
  if (!lastRunId) return;

  currentRunId = lastRunId;

  try {
    const res = await fetch(`${BASE_URL}/cache/upload/status/${lastRunId}`, {
      headers: authHeaders()
    });

    if (!res.ok) {
      document.getElementById("progressText").innerText = "Session restored";
      loadPreview();
      return;
    }

    const job = await res.json();

    if (["processing", "queued", "writing"].includes(job.status)) {

      const container = document.getElementById("autofillProgressContainer");
      if (container) container.style.display = "block";

      const pct = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

      const bar = document.getElementById("autofillProgressBar");
      if (bar) bar.style.width = pct + "%";

      const sb = document.getElementById("sourceBreakdown");
      if (sb) sb.innerText =
        "Template: " + (job.source_counts.template || 0) +
        " | LLM: " + (job.source_counts.llm || 0) +
        " | Cache: " + (job.source_counts.cache || 0);

      document.getElementById("progressText").innerText =
        "Resuming - " + job.progress + " of " + job.total +
        " questions processed (" + pct + "%)";

      setStep("step-processing", "active");
      isProcessing = true;
      toggleButtons(true);

     let pollInterval;
      pollInterval = setInterval(
        () => pollJobStatus(lastRunId, job.total, pollInterval),
        3000
      );

    } else if (job.status === "complete") {
      document.getElementById("progressText").innerText =
        "Session restored - processing complete";
      setStep("step-processing", "done");
      setStep("step-complete", "done");
      loadPreview();

    } else if (job.status === "error") {
      document.getElementById("progressText").innerText =
        "Previous job failed: " + (job.error || "unknown error");
      loadPreview();

    } else {
      document.getElementById("progressText").innerText =
        "Previous session data available - re-run autofill for fresh results";
      loadPreview();
    }

  } catch (err) {
    console.error("restoreLastSession error:", err);
    document.getElementById("progressText").innerText = "Session restored";
    loadPreview();
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
  localStorage.removeItem("lastRunId");
  location.reload();
}

async function loadUsers() {
  try {
    const res = await fetch(`${BASE_URL}/cache/users`, { headers: authHeaders() });
    const users = await res.json();

    const tbody = document.querySelector("#userTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    users.forEach(u => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>
          ${
            u.username !== "admin"
              ? `<button onclick="deleteUser('${u.username}')">Delete</button>`
              : ""
          }
        </td>
      `;

      tbody.appendChild(row);
    });

  } catch (err) {
    console.error("User load error:", err);
  }
}

async function createUser() {
  const username = document.getElementById("newUsername").value.trim().toLowerCase();
  const password = document.getElementById("newUserPassword").value;
  const role = document.getElementById("newUserRole").value;

  if (!username) {
    alert("Enter username");
    return;
  }

  if (!password || password.length < 8) {
    alert("Password must be at least 8 characters");
    return;
  }

  const res = await fetch(
    `${BASE_URL}/cache/users/create?username=${username}&role=${role}&password=${encodeURIComponent(password)}`,
    {
      method: "POST",
      headers: authHeaders()
    }
  );

  const data = await res.json();

  if (data.error) {
    alert(data.error);
    return;
  }

  document.getElementById("newUsername").value = "";
  document.getElementById("newUserPassword").value = "";

  loadUsers();
}

async function deleteUser(username) {
  if (!confirm(`Delete user ${username}?`)) return;

  await fetch(`${BASE_URL}/cache/users/delete?username=${username}`, {
    method: "POST",
    headers: authHeaders(),
  });

  loadUsers();
}

async function loadAuditLogs() {
  try {
    const res = await fetch(`${BASE_URL}/cache/audit`, { headers: authHeaders() });
    const data = await res.json();

    const tbody = document.querySelector("#auditTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    data.forEach(log => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${log.user_name}</td>
        <td>${log.action}</td>
        <td>${log.question}</td>
        <td>${new Date(log.created_at).toLocaleString()}</td>
      `;

      tbody.appendChild(row);
    });

  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// ---------- STEP CONTROL ----------
function setStep(stepId, status) {
  const el = document.getElementById(stepId);
  if (!el) return;

  el.classList.remove("active", "done");

  if (status === "active") el.classList.add("active");
  if (status === "done") el.classList.add("done");
}


// ---------- BUTTON LOCK ----------
function toggleButtons(disabled) {
  document.querySelectorAll("button").forEach(btn => {
    btn.disabled = disabled;
  });
}


// ---------- KNOWLEDGE FILE LIST ----------
async function loadKnowledgeFiles() {
  try {
    const res = await fetch(`${BASE_URL}/knowledge/sources`, { headers: authHeaders() });

    if (!res.ok) return;

    const files = await res.json();

    const container = document.getElementById("knowledgeList");

    if (!container) return;

    if (!files || files.length === 0) {
      container.innerHTML = "No files uploaded";
      return;
    }

    container.innerHTML = files.map(f => `- ${f}`).join("<br>");

  } catch (err) {
    console.error("Error loading knowledge files", err);
  }
}


// ---------- KNOWLEDGE UPLOAD ----------
async function uploadKnowledge() {
  const file = document.getElementById("knowledgeFile").files[0];
  if (!file) return alert("Please select a file");

  toggleButtons(true);
  document.getElementById("progressText").innerText = "Uploading knowledge...";
  document.getElementById("knowledgeStatus").innerText = "";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${BASE_URL}/knowledge/upload`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${getToken()}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      document.getElementById("knowledgeStatus").innerText = 
        err.detail || "Upload failed";
      document.getElementById("knowledgeStatus").style.color = "red";
      document.getElementById("progressText").innerText = "Upload failed";
      toggleButtons(false);
      return;
    }

    document.getElementById("progressText").innerText = "Knowledge uploaded successfully";
    document.getElementById("knowledgeStatus").innerText = "Uploaded";
    document.getElementById("knowledgeStatus").style.color = "green";

    setStep("step-knowledge", "done");
    await loadKnowledgeFiles();

  } catch (err) {
    document.getElementById("knowledgeStatus").innerText = "Error: " + err.message;
    document.getElementById("knowledgeStatus").style.color = "red";
    document.getElementById("progressText").innerText = "Upload failed";
  }

  toggleButtons(false);
}


// ---------- AUTOFILL ----------
async function runAutofill() {
  if (isProcessing) return;

  const file = document.getElementById("excelFile").files[0];
  if (!file) return alert("Upload questionnaire first");

  isProcessing = true;
  toggleButtons(true);

  const formData = new FormData();
  formData.append("file", file);

  try {
    document.getElementById("progressText").innerText = "Processing started...";
    setStep("step-processing", "active");

    const res = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });

    if (!res.ok) throw new Error("Processing failed");

    const data = await res.json();
    currentRunId = data.run_id;
    localStorage.setItem("lastRunId", data.run_id);
    console.log("Run ID:", currentRunId);

    document.getElementById("progressText").innerText =
      "Processing 0 of " + data.total + " questions...";

    let pollInterval;
    pollInterval = setInterval(() => pollJobStatus(data.run_id, data.total, pollInterval), 3000);

    const container = document.getElementById("autofillProgressContainer");
    if (container) container.style.display = "block";

  } catch (err) {
    console.error(err);
    document.getElementById("progressText").innerText = "Error: " + err.message;
    toggleButtons(false);
    isProcessing = false;
  }
}

async function pollJobStatus(run_id, total, interval) {
  if (!window._pollState) window._pollState = {};
  if (!window._pollState[run_id]) {
    window._pollState[run_id] = { lastProgress: -1, stuckCount: 0 };
  }

  try {
    const res = await fetch(`${BASE_URL}/cache/upload/status/${run_id}`, { headers: authHeaders() });

    if (!res.ok) {
      window._pollState[run_id].stuckCount++;
      if (window._pollState[run_id].stuckCount > 10) {
        clearInterval(interval);
        document.getElementById("progressText").innerText =
          "Connection lost - refresh to check status";
        toggleButtons(false);
        isProcessing = false;
      }
      return;
    }

    const job = await res.json();

    if (job.progress === window._pollState[run_id].lastProgress) {
      window._pollState[run_id].stuckCount++;
    } else {
      window._pollState[run_id].stuckCount = 0;
      window._pollState[run_id].lastProgress = job.progress;
    }

    if (window._pollState[run_id].stuckCount > 60) {
      clearInterval(interval);
      document.getElementById("progressText").innerText =
        "Processing appears stuck - please re-run autofill";
      const progressContainer = document.getElementById("autofillProgressContainer");
      if (progressContainer) progressContainer.style.display = "none";
      toggleButtons(false);
      isProcessing = false;
      fetch(`${BASE_URL}/cache/upload/cancel/${run_id}`, {
        method: "POST", headers: authHeaders()
      });
      return;
    }

    const pct = total > 0 ? Math.round((job.progress / total) * 100) : 0;
    document.getElementById("progressText").innerText =
      "Processing " + job.progress + " of " + job.total + " questions (" + pct + "%)";

    const sb = document.getElementById("sourceBreakdown");
    if (sb) sb.innerText =
      "Template: " + (job.source_counts.template || 0) +
      " | LLM: " + (job.source_counts.llm || 0) +
      " | Cache: " + (job.source_counts.cache || 0);

    const bar = document.getElementById("autofillProgressBar");
    if (bar) bar.style.width = pct + "%";

    const progressContainer = document.getElementById("autofillProgressContainer");

    if (job.status === "complete") {
      clearInterval(interval);
      const dlRes = await fetch(`${BASE_URL}/cache/upload/download/${run_id}`, { headers: authHeaders() });
      finalFileBlob = await dlRes.blob();
      document.getElementById("progressText").innerText = "Completed";
      setStep("step-processing", "done");
      setStep("step-complete", "done");
      if (progressContainer) progressContainer.style.display = "none";
      toggleButtons(false);
      isProcessing = false;
      await loadPreview();
      await loadRuns();

    } else if (job.status === "error") {
      clearInterval(interval);
      document.getElementById("progressText").innerText = "Error: " + (job.error || "Processing failed");
      if (progressContainer) progressContainer.style.display = "none";
      toggleButtons(false);
      isProcessing = false;

    } else if (job.status === "unknown") {
      clearInterval(interval);
      document.getElementById("progressText").innerText = "Session lost - please re-run autofill";
      if (progressContainer) progressContainer.style.display = "none";
      toggleButtons(false);
      isProcessing = false;
    }

  } catch (err) {
    console.error("pollJobStatus error:", err);
  }
}


// ---------- PREVIEW ----------
async function loadPreview() {
  try {
    if (!currentRunId) {
      document.getElementById("progressText").innerText =
        "Error: run_id missing. Run autofill again.";
      return;
    }

    const res = await fetch(`${BASE_URL}/cache/all?run_id=${currentRunId}`, { headers: authHeaders() });
    const data = await res.json();

    if (!Array.isArray(data)) return;

    const tbody = document.querySelector("#previewTable tbody");
    tbody.innerHTML = "";

    const filteredData = showLowOnly 
    ? data.filter(d => d.confidence < 70)
    : data;

    // 🔥 Pagination logic
    const totalPages = Math.ceil(filteredData.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;

    const paginatedData = filteredData.slice(start, end);

    paginatedData.forEach(item => {
      const row = document.createElement("tr");

      const meta = getConfidenceMeta(item.confidence);

      row.innerHTML = `
        <td>
          <input type="checkbox" onchange="toggleSelect(${item.id})" />
        </td>
        <td class="question-cell">${item.question || "-"}</td>
        <td>
        ${(item.answer && !item.answer.toLowerCase().includes("error generating")) 
        ? item.answer 
        : "No relevant information available."
        }
        ${item.source === "llm" ? `
          <div style="margin-top:6px;">
              <span 
                  onclick="toggleExplanation(${item.id})" 
                  style="cursor:pointer; font-size:11px; font-weight:500;
                        background:#e8f4e8; color:#2d6a2d; padding:2px 8px;
                        border-radius:10px; display:inline-block;
                        border:1px solid #c3e0c3; margin-top:4px;"
                  title="Click to see source context"
              >
              + Why this answer?
              </span>
                <div id="exp-${item.id}" style="display:none; font-size:12px; color:#444; margin-top:4px;">
                ${generateExplanation(item)}
                </div>
            </div>
            ` : ""}
        <div style="font-size:12px; color:#666; margin-top:4px;">
            ${(item.source_text && item.confidence < 80) 
            ? formatSource(item.source_text) 
            : ""}
        </div>
        </td>
        <td>
            <div>
                <span class="badge ${meta.class}">
                ${item.confidence || 0} (${meta.label})
                </span>
                ${meta.warning ? `<div style="color:red; font-size:11px;">${meta.warning}</div>` : ""}
            </div>
            </td>
        <td>${item.source || "-"}</td>
        <td>
          <span class="status ${item.status || "pending"}">
            ${item.status || "pending"}
          </span>
        </td>
        <td>
          <button onclick="openEvidence(${item.id})"
            style="font-size:11px; padding:4px 8px;">
            Evidence ${item.evidence_count > 0 ? '(' + item.evidence_count + ')' : '+'}
          </button>
        </td>
      `;

      tbody.appendChild(row);
    });

    updateSummary(data);
    loadAuditLogs();
    renderPaginationControls(totalPages);

  } catch (err) {
    console.error("Preview error:", err);
  }
}


// ---------- EVIDENCE ----------
async function openEvidence(cacheId) {
  const existingPanel = document.getElementById(`evidence-panel-${cacheId}`);

  if (existingPanel) {
    existingPanel.remove();
    return;
  }

  const row = document.querySelector(`input[onchange="toggleSelect(${cacheId})"]`)
    ?.closest("tr");

  if (!row) return;

  const colSpan = row.cells.length;
  const panelRow = document.createElement("tr");
  panelRow.id = `evidence-panel-row-${cacheId}`;

  panelRow.innerHTML = `
    <td colspan="${colSpan}" style="padding:0; background:#f8fbff;">
      <div id="evidence-panel-${cacheId}" class="evidence-panel">

        <div id="evidence-list-${cacheId}" style="margin-bottom:12px;">
          <div style="color:#999; font-size:12px;">Loading evidence...</div>
        </div>

        <div style="border-top:1px solid #e0e0e0; padding-top:12px;">
          <div style="font-size:12px; font-weight:600; margin-bottom:8px; color:#333;">
            Add evidence
          </div>
          <textarea
            id="evidenceContent_${cacheId}"
            placeholder="Paste relevant policy text, quote, or note..."
            style="width:100%; height:80px; font-size:13px; padding:8px;
                   border:1px solid #ddd; border-radius:6px; resize:vertical;
                   font-family:inherit; margin-bottom:8px;"
          ></textarea>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select id="evidenceType_${cacheId}"
              style="font-size:13px; padding:6px 10px; border:1px solid #ddd;
                     border-radius:6px; background:white;">
              <option value="note">Note</option>
              <option value="quote">Policy quote</option>
              <option value="filename">Document reference</option>
            </select>
            <input
              id="evidenceFile_${cacheId}"
              type="text"
              placeholder="Document name (optional)"
              style="font-size:13px; padding:6px 10px; border:1px solid #ddd;
                     border-radius:6px; flex:1; min-width:160px;"
            />
            <button onclick="addEvidence(${cacheId})"
              style="padding:6px 16px; font-size:13px; white-space:nowrap;">
              Add evidence
            </button>
            <span id="evidenceMsg_${cacheId}"
              style="font-size:12px; display:none;"></span>
          </div>
        </div>

      </div>
    </td>
  `;

  row.after(panelRow);
  loadEvidenceList(cacheId);
}

async function loadEvidenceList(cacheId) {
  const listEl = document.getElementById(`evidence-list-${cacheId}`);
  if (!listEl) return;

  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, {
      headers: authHeaders()
    });
    const items = await res.json();

    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = `<div style="color:#999; font-size:12px; 
        font-style:italic;">No evidence attached yet.</div>`;
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="evidence-item">
        <span class="evidence-type-badge">${item.evidence_type}</span>
        <div class="evidence-content">
          <div>${item.content || ""}</div>
          ${item.filename ? `<div style="font-size:11px; color:#888; 
            margin-top:2px;">Document: ${item.filename}</div>` : ""}
          <div class="evidence-meta">Added by ${item.created_by} 
            on ${new Date(item.created_at).toLocaleDateString()}</div>
        </div>
        <button onclick="deleteEvidence(${item.id}, ${cacheId})"
          style="font-size:11px; padding:2px 8px; color:#c00; 
                 background:white; border:1px solid #fcc; border-radius:4px;
                 cursor:pointer; white-space:nowrap;">
          Delete
        </button>
      </div>
    `).join("");

  } catch (err) {
    listEl.innerHTML = `<div style="color:red; font-size:12px;">
      Failed to load evidence.</div>`;
  }
}

async function addEvidence(cacheId) {
  const content = document.getElementById(`evidenceContent_${cacheId}`)?.value.trim();
  const type = document.getElementById(`evidenceType_${cacheId}`)?.value;
  const filename = document.getElementById(`evidenceFile_${cacheId}`)?.value.trim();
  const msgEl = document.getElementById(`evidenceMsg_${cacheId}`);

  if (!content) {
    if (msgEl) {
      msgEl.style.display = "inline";
      msgEl.style.color = "red";
      msgEl.innerText = "Please enter some content";
    }
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ content, evidence_type: type, filename })
    });

    if (!res.ok) {
      const err = await res.json();
      if (msgEl) {
        msgEl.style.display = "inline";
        msgEl.style.color = "red";
        msgEl.innerText = err.detail || "Failed to add evidence";
      }
      return;
    }

    document.getElementById(`evidenceContent_${cacheId}`).value = "";
    document.getElementById(`evidenceFile_${cacheId}`).value = "";

    if (msgEl) {
      msgEl.style.display = "inline";
      msgEl.style.color = "green";
      msgEl.innerText = "Evidence added";
      setTimeout(() => { msgEl.style.display = "none"; }, 2000);
    }

    loadEvidenceList(cacheId);
    loadPreview();

  } catch (err) {
    if (msgEl) {
      msgEl.style.display = "inline";
      msgEl.style.color = "red";
      msgEl.innerText = "Error: " + err.message;
    }
  }
}

async function deleteEvidence(evidenceId, cacheId) {
  if (!confirm("Remove this evidence?")) return;

  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${evidenceId}`, {
      method: "DELETE",
      headers: authHeaders()
    });

    if (res.ok) {
      loadEvidenceList(cacheId);
      loadPreview();
    }
  } catch (err) {
    console.error("deleteEvidence error:", err);
  }
}



async function refreshEvidenceList(cacheId) {
  const listEl = document.getElementById(`evidence-list-${cacheId}`);
  if (!listEl) return;

  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, { headers: authHeaders() });
    const items = await res.json();

    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = '<div style="color:#999; font-size:12px;">No evidence yet.</div>';
      return;
    }

    listEl.innerHTML = items.map(ev => `
      <div class="evidence-item">
        <span class="evidence-type-badge">${ev.evidence_type}</span>
        <div style="flex:1;">
          <div class="evidence-content">${ev.content || ""}${ev.filename ? ` <em style="color:#888">(${ev.filename})</em>` : ""}</div>
          <div class="evidence-meta">Added by ${ev.created_by} · ${new Date(ev.created_at).toLocaleString()}</div>
        </div>
        <button onclick="deleteEvidence(${ev.id}, ${cacheId})"
          style="font-size:11px; padding:2px 6px; background:#dc3545;">Delete</button>
      </div>
    `).join("");
  } catch (err) {
    listEl.innerHTML = '<div style="color:red; font-size:12px;">Failed to load evidence.</div>';
  }
}

async function addEvidence(cacheId) {
  const content = document.getElementById(`evidenceContent_${cacheId}`)?.value.trim();
  const evidence_type = document.getElementById(`evidenceType_${cacheId}`)?.value;
  const filename = document.getElementById(`evidenceFilename_${cacheId}`)?.value.trim();
  const msgEl = document.getElementById(`evidenceMsg_${cacheId}`);

  if (!content) {
    if (msgEl) { msgEl.style.color = "red"; msgEl.innerText = "Content is required."; }
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ content, evidence_type, filename }),
    });

    if (!res.ok) {
      const err = await res.json();
      if (msgEl) { msgEl.style.color = "red"; msgEl.innerText = err.detail || "Failed to add evidence."; }
      return;
    }

    document.getElementById(`evidenceContent_${cacheId}`).value = "";
    document.getElementById(`evidenceFilename_${cacheId}`).value = "";
    if (msgEl) {
      msgEl.style.color = "green";
      msgEl.innerText = "Evidence added";
      setTimeout(() => { msgEl.innerText = ""; }, 2000);
    }

    await refreshEvidenceList(cacheId);
  } catch (err) {
    if (msgEl) { msgEl.style.color = "red"; msgEl.innerText = "Error: " + err.message; }
  }
}

async function deleteEvidence(evidenceId, cacheId) {
  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${evidenceId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) await refreshEvidenceList(cacheId);
  } catch (err) {
    console.error("deleteEvidence error:", err);
  }
}

// ---------- SEARCH ----------
function filterTable() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const rows = document.querySelectorAll("#previewTable tbody tr");

  rows.forEach(row => {
    const question = row.cells[1].innerText.toLowerCase();
    row.style.display = question.includes(input) ? "" : "none";
  });
}


// ---------- SELECT ----------
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
}

function toggleAll(master) {
  const checkboxes = document.querySelectorAll("#previewTable tbody input[type='checkbox']");
  
  checkboxes.forEach(cb => {
    cb.checked = master.checked;

    const id = cb.getAttribute("onchange").match(/\d+/)[0];

    if (master.checked) selectedIds.add(Number(id));
    else selectedIds.delete(Number(id));
  });
}


// ---------- BULK ----------
async function bulkApprove() {
  if (localStorage.getItem("role") !== "admin") {
    alert("Only admin can approve");
    return;
  }
  await Promise.all([...selectedIds].map(id =>
    fetch(`${BASE_URL}/cache/approve/${id}`, {
      method: "POST",
      headers: authHeaders(),
    })
  ));
  selectedIds.clear();
  loadPreview();
  loadAuditLogs();
}

async function bulkReject() {
  if (localStorage.getItem("role") !== "admin") {
    alert("Only admin can reject");
    return;
  }
  await Promise.all([...selectedIds].map(id =>
    fetch(`${BASE_URL}/cache/reject/${id}`, {
      method: "POST",
      headers: authHeaders(),
    })
  ));
  selectedIds.clear();
  loadPreview();
  loadAuditLogs();
}


// ---------- DOWNLOAD ----------
function downloadFinal() {
  if (!finalFileBlob) {
    const msg = currentRunId
      ? "File not available after refresh - re-run autofill to download"
      : "No file available";

    const el = document.getElementById("progressText");
    if (el) {
      el.innerText = msg;
      el.style.color = "orange";
      // Scroll to status section so user sees it
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      alert(msg);
    }
    return;
  }

  const url = window.URL.createObjectURL(finalFileBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vvault_output.xlsx";
  a.click();

  loadAuditLogs();
}


// ---------- AUTO APPROVE ----------
async function autoApprove() {
  const res = await fetch(`${BASE_URL}/cache/all?run_id=${currentRunId}`, { headers: authHeaders() });
  const data = await res.json();

  if (!Array.isArray(data)) return;

  const highConfidence = data.filter(d => d.confidence >= 80);

  await Promise.all(highConfidence.map(item =>
    fetch(`${BASE_URL}/cache/approve/${item.id}`, {
      method: "POST",
      headers: authHeaders(),
    })
  ));

  loadPreview();
  loadAuditLogs();
}


// ---------- DOWNLOAD APPROVED ----------
async function downloadApproved() {
  const res = await fetch(`${BASE_URL}/cache/all?run_id=${currentRunId}`, { headers: authHeaders() });
  const data = await res.json();

  if (!Array.isArray(data)) return;

  const approved = data.filter(d => d.status === "approved");

  if (approved.length === 0) {
    alert("No approved answers");
    return;
  }

  let csv = "Question,Answer,Confidence,Source\n";

  approved.forEach(d => {
    csv += `"${d.question}","${d.answer}",${d.confidence},"${d.source}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "approved_answers.csv";
  a.click();

  loadAuditLogs();
}

function renderPaginationControls(totalPages) {
  const container = document.getElementById("paginationControls");
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; justify-content:center; gap:10px; margin-top:10px;">
      <button onclick="prevPage()" ${currentPage === 1 ? "disabled" : ""}>Prev</button>
      <span>Page ${currentPage} of ${totalPages || 1}</span>
      <button onclick="nextPage(${totalPages})" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    loadPreview();
  }
}

function nextPage(totalPages) {
  if (currentPage < totalPages) {
    currentPage++;
    loadPreview();
  }
}


// ---------- EXPOSE ----------
window.filterTable = filterTable;
window.toggleAll = toggleAll;
window.toggleSelect = toggleSelect;
window.bulkApprove = bulkApprove;
window.bulkReject = bulkReject;
window.autoApprove = autoApprove;
window.downloadApproved = downloadApproved;

initApp();