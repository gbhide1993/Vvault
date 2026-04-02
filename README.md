# 🚀 Vvault — AI-Powered SOC2 Questionnaire Autofill

Vvault is an AI-driven SaaS platform designed to **automatically complete SOC2 and security questionnaires** using your company’s knowledge base — with **traceable evidence, confidence scoring, and audit-ready outputs**.

---

## 🎯 Problem

Security questionnaires are:

* Time-consuming (hours to days)
* Repetitive across vendors
* Error-prone and inconsistent
* Difficult to justify during audits

---

## 💡 Solution

Vvault automates the entire workflow:

> Upload your documents → Upload questionnaire → Get **answers + justification + evidence**

---

## ✨ Key Features

### 🤖 AI Autofill (RAG + Templates)

* Uses Retrieval-Augmented Generation (RAG)
* SOC2-specific template engine
* Context-aware answer generation

---

### 📊 Confidence Scoring + Justification

Every answer includes:

* Confidence score (0–100)
* Source type (cache / template / LLM)
* Human-readable justification

---

### 📄 Evidence Layer (Audit-Ready)

Each answer is backed by:

* Extracted context from documents
* Supporting text used for generation

---

### 🔁 Smart Semantic Cache

* Avoids re-answering duplicate questions
* Learns from approved responses
* Uses pgvector similarity search

---

### 📑 Excel Processing (Multi-Sheet)

* Automatically detects question columns
* Handles multiple sheets
* Preserves original format

---

### ✅ Review Workflow

* Approve / Reject answers
* Bulk operations
* Auto-approve high confidence responses

---

### 🧠 Dropdown Handling

* Maps generated answers to dropdown options
* Works with Yes/No / multi-choice formats

---

### 🧾 Run-Based Tracking

* Each upload = unique run
* Track outputs per session
* Enables audit traceability

---

## 🏗️ Architecture

### Backend

* FastAPI (Dockerized)
* PostgreSQL + pgvector
* Ollama (LLM + embeddings)

### Frontend

* HTML + Vanilla JS
* Lightweight, fast UI
* No heavy frameworks

---

## ⚙️ How It Works

1. Upload knowledge base (PDF / TXT)
2. Upload SOC2 questionnaire (Excel)
3. System:

   * Parses questions
   * Retrieves relevant context
   * Generates answers
4. Outputs:

   * Answer
   * Confidence
   * Justification
   * Evidence (context)
5. Review → Approve → Download final Excel

---

## 📂 Project Structure

```
vvault/
│
├── app/
│   ├── routes/
│   ├── services/
│   ├── models/
│   ├── utils/
│
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│
├── docker-compose.yml
├── requirements.txt
└── README.md
```

---

## 🚀 Setup Instructions

### 1. Clone Repo

```bash
git clone https://github.com/your-username/vvault.git
cd vvault
```

---

### 2. Start Services

```bash
docker-compose up --build
```

---

### 3. Access App

Frontend:

```
http://localhost:3000
```

Backend API:

```
http://localhost:8000
```

---

## 📡 Key API Endpoints

### Upload Knowledge

```
POST /knowledge/upload
```

### Upload Questionnaire

```
POST /upload
```

### Get Results

```
GET /cache/all?run_id=<run_id>
```

---

## 🧪 Example Output

```json
{
  "question": "Are policies approved?",
  "answer": "All policies are documented and approved by leadership.",
  "confidence": 75,
  "source": "llm",
  "justification": "Generated using relevant company knowledge context",
  "raw_context": "All policies are documented and approved by leadership..."
}
```

---

## 🔒 Why Vvault is Different

Unlike generic AI tools:

* ❌ Not just answer generation
* ✅ **Evidence-backed answers**
* ✅ **Audit-friendly output**
* ✅ **Traceable reasoning**
* ✅ **Designed for compliance workflows**

---

## 💰 Target Users

* SaaS startups (SOC2 readiness)
* Security & compliance teams
* Vendor risk teams
* Consultants handling questionnaires

---

## 📈 Roadmap

### Phase 1 (Completed)

* Answer generation
* Confidence + justification
* Evidence (context)
* Review workflow

### Phase 2 (In Progress)

* Document traceability (file-level)
* Evidence highlighting
* UI improvements

### Phase 3

* Team collaboration
* Role-based access
* Audit logs & history

---

## ⚠️ Limitations

* Depends on quality of uploaded documents
* LLM fallback may generalize if context is weak
* UI currently minimal (functional-first)

---

## 🤝 Contributing

Currently private / internal project.
Future contributions may be opened.

---

## 📬 Contact

For demo / collaboration:

* Founder: Girish Bhide
* Email: (add your email)
* Location: Pune, India

---

## ⭐ Final Note

Vvault is built to move from:

> “AI-generated answers”
> ➡️ to
> “Audit-ready, evidence-backed responses”

That’s the difference between a **tool** and a **product people pay for**.
