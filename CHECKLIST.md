# Vvault v1.0 Launch Checklist

## Security
- [ ] Copy `.env.example` to `.env` and replace all `CHANGE_ME_*` values before running
- [ ] Generate a strong JWT secret: `python -c "import secrets; print(secrets.token_hex(32))"`
- [ ] Set `DB_PASSWORD` to a strong, unique password (not `postgres`)
- [ ] Set `ALLOWED_ORIGINS` to your actual frontend origin(s)
- [ ] Confirm app refuses to start if `JWT_SECRET` is missing or insecure (Task 1/2)

## Infrastructure
- [ ] Docker Desktop is running
- [ ] Run `docker compose up --build` from the project root
- [ ] Confirm all containers start: `vvault_db`, `vvault_backend`, `vvault_ollama`, frontend
- [ ] Confirm `GET /health` returns `{"status": "ok", "version": "1.0.0"}`
- [ ] Confirm pgvector extension is installed (check DB health log line on startup)

## Database
- [ ] Run `migrations/001_audit_logs.sql` against the database if audit logs are needed:
      `docker exec -i vvault_db psql -U postgres -d vvault < migrations/001_audit_logs.sql`
- [ ] Confirm `qa_cache` table exists with `embedding` vector column
- [ ] Confirm `knowledge_base` table exists with `embedding` vector column

## License
- [ ] Place your `.vvault-license` file in the project root (same folder as `docker-compose.yml`)
- [ ] Confirm startup log shows `LICENSE OK — <company> — expires <date>`
- [ ] If license is invalid, contact support@getvvault.com

## Ollama / AI
- [ ] Confirm Ollama startup log shows `phi3:mini` and `nomic-embed-text` pulled
- [ ] Confirm startup log shows `Ollama warmup complete.`
- [ ] First upload should not stall (warmup pre-fires the embedding model)

## Functional Tests
- [ ] Login with default admin credentials, then change the password immediately
- [ ] Upload a sample `.xlsx` questionnaire and confirm answers are generated
- [ ] Upload a `.docx` questionnaire and confirm answers are generated
- [ ] Upload a `.pdf` questionnaire and confirm answers are generated
- [ ] Approve and reject answers via the review UI
- [ ] Confirm approve/reject returns 403 for non-admin users
- [ ] Approve-all returns 403 for non-admin users
- [ ] Download the filled Excel and verify color coding (green/yellow/red by confidence)
- [ ] Upload a knowledge document and re-run — confirm KB context is used

## CORS / Network
- [ ] Frontend loads at `https://localhost:3443` without CORS errors
- [ ] Backend API accessible at `http://localhost:8000`
- [ ] `ALLOWED_ORIGINS` in `.env` matches your frontend URL

## Logging
- [ ] No raw `print()` statements fire in production — all output via Python `logging`
- [ ] Benchmark summary appears in container logs after each questionnaire run

## Known Limitations (v1.0)
- Max 500 rows per questionnaire upload
- Ollama models run on CPU by default — GPU passthrough requires Docker Desktop WSL2 GPU config
- License file must be present at startup; hot-reload is not supported
