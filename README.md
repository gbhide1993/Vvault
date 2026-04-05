# Vvault — local SOC2 questionnaire autofill

## What it does

Vvault automatically answers security questionnaires (SOC2, vendor risk, etc.) by matching questions against your uploaded company policy documents. It uses local embeddings and an LLM via Ollama so no data leaves your machine. Reviewers can approve, reject, or manually add answers before downloading the completed Excel file.

## Requirements

- Docker Desktop
- 8GB RAM minimum for Ollama

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in `DB_PASSWORD` and `JWT_SECRET`
   ```
   cp .env.example .env
   ```
   Generate `JWT_SECRET` with:
   ```
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
3. Generate TLS certificates (required before first run):
   - **Windows:**
     ```
     .\scripts\generate_certs.ps1
     ```
   - **Mac/Linux:**
     ```
     bash scripts/generate_certs.sh
     ```
4. Run:
   ```
   docker-compose up --build
   ```
5. Open https://localhost:3443 (accept the self-signed certificate warning)
6. Login with `admin` / `changeme123` — you will be prompted to set a new password

## First use

1. Upload your company policy docs in Step 1 (PDF or TXT)
2. Upload your SOC2 questionnaire Excel file in Step 2
3. Click **Run Autofill** and wait for processing
4. Review answers, approve or reject, then download

## Changing the admin password after setup

```
POST http://localhost:8000/cache/users/set-password?username=admin&new_password=...
Authorization: Bearer <your token>
```

## Troubleshooting

**Ollama slow on first run**
The model is being pulled on first start — wait 2–3 minutes before running autofill.

**Port 3000 already in use**
Change the frontend port mapping in `docker-compose.yml`:
```yaml
ports:
  - "3001:80"   # change 3000 to any free port
```

**Forgot password**
Exec into the database container and clear the hash so `seed_admin_if_missing()` resets it on next restart:
```
docker exec -it vvault_db psql -U postgres -d vvault -c "UPDATE users SET password_hash = NULL WHERE username = 'admin';"
```
Then restart the backend — it will reseed with the default password `changeme123`.
