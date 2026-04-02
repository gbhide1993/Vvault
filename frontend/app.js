const BASE_URL = "/api";

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


// ✅ NEW (Audit user)
function getCurrentUser() {
  return (localStorage.getItem("user") || "").trim().toLowerCase();
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
function login() {
  let user = document.getElementById("username").value;

  user = user.trim().toLowerCase();

  if (user) {
    localStorage.setItem("user", user);

    document.getElementById("login-container").style.display = "none";
    document.getElementById("app-container").style.display = "block";

    loadKnowledgeFiles();
    loadUsers();
    loadAuditLogs();   // ✅ MOVE HERE

    const section = document.querySelector("#userTable")?.closest(".section");

    if (user === "admin") {
      if (section) section.style.display = "block";
    } else {
      if (section) section.style.display = "none";
    }
  }
}

function logout() {
  localStorage.removeItem("user");
  location.reload();
}

async function loadUsers() {
  try {
    const res = await fetch(`${BASE_URL}/cache/users`);
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
  const role = document.getElementById("newUserRole").value;

  if (!username) {
    alert("Enter username");
    return;
  }

  const res = await fetch(`${BASE_URL}/cache/users/create?username=${username}&role=${role}&user=${getCurrentUser()}`, {
    method: "POST"
  });

  const data = await res.json();
  console.log(data); // ✅ DEBUG

  loadUsers();
}

async function deleteUser(username) {
  if (!confirm(`Delete user ${username}?`)) return;

  await fetch(`${BASE_URL}/cache/users/delete?username=${username}&user=${getCurrentUser()}`, {
    method: "POST"
  });

  loadUsers();
}

async function loadAuditLogs() {
  try {
    const res = await fetch(`${BASE_URL}/cache/audit`);
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
    const res = await fetch(`${BASE_URL}/knowledge/sources`);

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

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${BASE_URL}/knowledge/upload`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("Upload failed");

    document.getElementById("progressText").innerText =
      "Knowledge uploaded successfully";

    document.getElementById("knowledgeStatus").innerText = "Uploaded";

    setStep("step-knowledge", "done");

    await loadKnowledgeFiles();

  } catch (err) {
    document.getElementById("progressText").innerText =
      "Error uploading knowledge";
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
    document.getElementById("progressText").innerText =
      "Processing started...";

    setStep("step-processing", "active");

    const res = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      body: formData
    });

    currentRunId = res.headers.get("X-Run-Id");
    console.log("Run ID:", currentRunId);

    if (!res.ok) throw new Error("Processing failed");

    finalFileBlob = await res.blob();

    document.getElementById("progressText").innerText = "Completed";

    setStep("step-processing", "done");
    setStep("step-complete", "done");

    await loadPreview();

  } catch (err) {
    console.error(err);
    document.getElementById("progressText").innerText =
      "Error: " + err.message;
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

    const res = await fetch(`${BASE_URL}/cache/all?run_id=${currentRunId}`);
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
  await Promise.all([...selectedIds].map(id =>
    fetch(`${BASE_URL}/cache/approve/${id}?user=${getCurrentUser()}`, {
      method: "POST"
    })
  ));
  if (getCurrentUser() !== "admin") {
  alert("Only admin can approve");
  return;
}
  selectedIds.clear();
  loadPreview();
  loadAuditLogs();
}

async function bulkReject() {
  await Promise.all([...selectedIds].map(id =>
    fetch(`${BASE_URL}/cache/reject/${id}?user=${getCurrentUser()}`, {
      method: "POST"
    })
  ));
  if (getCurrentUser() !== "admin") {
  alert("Only admin can approve");
  return;
}
  selectedIds.clear();
  loadPreview();
  loadAuditLogs();
}


// ---------- DOWNLOAD ----------
function downloadFinal() {
  if (!finalFileBlob) return alert("No file available");

  const url = window.URL.createObjectURL(finalFileBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vvault_output.xlsx";
  a.click();

  loadAuditLogs();
}


// ---------- AUTO APPROVE ----------
async function autoApprove() {
  const res = await fetch(`${BASE_URL}/cache/all?run_id=${currentRunId}`);
  const data = await res.json();

  if (!Array.isArray(data)) return;

  const highConfidence = data.filter(d => d.confidence >= 80);

  await Promise.all(highConfidence.map(item =>
    fetch(`${BASE_URL}/cache/approve/${item.id}?user=${getCurrentUser}`, {
      method: "POST"
    })
  ));

  loadPreview();
  loadAuditLogs();
}


// ---------- DOWNLOAD APPROVED ----------
async function downloadApproved() {
  const res = await fetch(`${BASE_URL}/cache/all?run_id=${currentRunId}`);
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