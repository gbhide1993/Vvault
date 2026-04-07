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
    warning: "⚠️ Needs review"
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

function showApp() {
  document.getElementById("app-container").style.display = "block";

  const role = localStorage.getItem("role");
  const username = localStorage.getItem("user") || "";
  const section = document.querySelector("#userTable")?.closest(".section");

  if (role === "admin") {
    if (section) section.style.display = "block";
  } else {
    if (section) section.style.display = "none";
  }

  const initials = username.substring(0, 2).toUpperCase();
  const avatarCircle = document.getElementById("avatarCircle");
  const avatarName = document.getElementById("avatarName");
  const avatarRole = document.getElementById("avatarRole");
  if (avatarCircle) avatarCircle.innerText = initials;
  if (avatarName) avatarName.innerText = username;
  if (avatarRole) avatarRole.innerText = role;

  loadKnowledgeFiles();
  loadUsers();
  loadAuditLogs();

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

function restoreLastSession() {
  const lastRunId = localStorage.getItem("lastRunId");
  if (!lastRunId) return;

  currentRunId = lastRunId;
  document.getElementById("progressText").innerText = "Session restored";
  loadPreview();
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
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
function showProgressBar(pct, label) {
  const el = document.getElementById("progressText");
  if (!el) return;
  el.innerHTML = `
    <div style="margin-bottom:6px;">${label}</div>
    <div style="background:#eee;border-radius:4px;height:10px;width:100%;max-width:400px;">
      <div style="background:#1a73e8;height:10px;border-radius:4px;width:${pct}%;transition:width 0.5s;"></div>
    </div>
    <div style="font-size:12px;color:#888;margin-top:4px;">${pct}% complete</div>
  `;
}

async function runAutofill() {
  if (isProcessing) return;

  const file = document.getElementById("excelFile").files[0];
  if (!file) return alert("Upload questionnaire first");

  isProcessing = true;
  toggleButtons(true);

  const formData = new FormData();
  formData.append("file", file);

  let fakePct = 0;
  showProgressBar(0, "Submitting questionnaire...");
  setStep("step-processing", "active");

  const fakeTimer = setInterval(() => {
    if (fakePct < 85) {
      fakePct += Math.random() * 6;
      fakePct = Math.min(fakePct, 85);
      showProgressBar(Math.round(fakePct), "Processing questions with AI...");
    }
  }, 1500);

  try {
    const res = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });

    clearInterval(fakeTimer);
    currentRunId = res.headers.get("X-Run-Id");
    localStorage.setItem("lastRunId", currentRunId);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Processing failed");
    }

    finalFileBlob = await res.blob();
    showProgressBar(100, "Processing complete!");
    setStep("step-processing", "done");
    setStep("step-complete", "done");
    await loadPreview();

  } catch (err) {
    clearInterval(fakeTimer);
    console.error(err);
    document.getElementById("progressText").innerHTML =
      "<span style='color:red;'>Error: " + err.message + "</span>";
  }

  toggleButtons(false);
  isProcessing = false;
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
                    style="cursor:pointer; font-size:14px; margin-left:6px;" 
                    title="Why this answer?"
                >
                Note
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
        <td style="white-space:nowrap;">
          <button id="evBtn-${item.id}" onclick="openEvidenceModal(${item.id})"
            style="font-size:11px;padding:3px 8px;">+ Evidence</button>
        </td>
      `;
      loadEvidenceCount(item.id);

      tbody.appendChild(row);
    });

    updateSummary(data);
    loadAuditLogs();
    renderPaginationControls(totalPages);

  } catch (err) {
    console.error("Preview error:", err);
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



// ---------- EVIDENCE MODAL ----------

function createEvidenceModal() {
  if (document.getElementById("evidenceModal")) return;
  const modal = document.createElement("div");
  modal.id = "evidenceModal";
  modal.style.cssText = "display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;";
  modal.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;width:480px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:16px;">Evidence</h3>
        <span onclick="closeEvidenceModal()" style="cursor:pointer;font-size:22px;color:#888;line-height:1;">&times;</span>
      </div>
      <div id="modalEvList" style="margin-bottom:16px;max-height:200px;overflow-y:auto;"></div>
      <hr style="margin-bottom:16px;">
      <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Add evidence</div>
      <select id="modalEvType" style="width:100%;margin-bottom:8px;padding:6px;">
        <option value="note">Note</option>
        <option value="policy_quote">Policy quote</option>
        <option value="document">Document</option>
      </select>
      <textarea id="modalEvContent" placeholder="Evidence content..." rows="3"
        style="width:100%;margin-bottom:8px;padding:6px;box-sizing:border-box;"></textarea>
      <input id="modalEvFile" placeholder="Filename (optional)"
        style="width:100%;margin-bottom:12px;padding:6px;box-sizing:border-box;">
      <button onclick="submitEvidenceModal()" style="width:100%;padding:8px;">Save evidence</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) closeEvidenceModal(); });
}

let _currentEvCacheId = null;

async function openEvidenceModal(cacheId) {
  createEvidenceModal();
  _currentEvCacheId = cacheId;
  const modal = document.getElementById("evidenceModal");
  modal.style.display = "flex";
  document.getElementById("modalEvContent").value = "";
  document.getElementById("modalEvFile").value = "";
  await loadEvidenceModalList(cacheId);
}

function closeEvidenceModal() {
  const modal = document.getElementById("evidenceModal");
  if (modal) modal.style.display = "none";
  _currentEvCacheId = null;
}

async function loadEvidenceModalList(cacheId) {
  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, { headers: authHeaders() });
    const items = await res.json();
    const el = document.getElementById("modalEvList");
    if (!el) return;
    if (!items.length) {
      el.innerHTML = "<p style='color:#888;font-size:13px;'>No evidence yet.</p>";
      return;
    }
    el.innerHTML = items.map(e => `
      <div style="background:#f5f5f5;padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;">
            <span style="font-weight:500;color:#555;">${e.evidence_type}:</span> ${e.content}
            ${e.filename ? `<div style="font-size:11px;color:#888;margin-top:2px;">${e.filename}</div>` : ""}
          </div>
          <span onclick="deleteEvidenceModal(${e.id},${cacheId})"
                style="cursor:pointer;color:red;font-size:18px;flex-shrink:0;">&times;</span>
        </div>
      </div>
    `).join("");
  } catch (err) { console.error("loadEvidenceModalList:", err); }
}

async function loadEvidenceCount(cacheId) {
  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${cacheId}`, { headers: authHeaders() });
    const items = await res.json();
    const btn = document.getElementById("evBtn-" + cacheId);
    if (btn) btn.innerText = items.length > 0 ? "Evidence (" + items.length + ")" : "+ Evidence";
  } catch (err) {}
}

async function submitEvidenceModal() {
  const content = document.getElementById("modalEvContent")?.value.trim();
  const evType = document.getElementById("modalEvType")?.value;
  const filename = document.getElementById("modalEvFile")?.value.trim();
  if (!content) { alert("Enter evidence content"); return; }
  try {
    const res = await fetch(`${BASE_URL}/cache/evidence/${_currentEvCacheId}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: evType, content, filename })
    });
    if (res.ok) {
      document.getElementById("modalEvContent").value = "";
      document.getElementById("modalEvFile").value = "";
      await loadEvidenceModalList(_currentEvCacheId);
      await loadEvidenceCount(_currentEvCacheId);
    }
  } catch (err) { console.error("submitEvidenceModal:", err); }
}

async function deleteEvidenceModal(evidenceId, cacheId) {
  if (!confirm("Delete this evidence?")) return;
  try {
    await fetch(`${BASE_URL}/cache/evidence/${evidenceId}`, {
      method: "DELETE", headers: authHeaders()
    });
    await loadEvidenceModalList(cacheId);
    await loadEvidenceCount(cacheId);
  } catch (err) { console.error("deleteEvidenceModal:", err); }
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