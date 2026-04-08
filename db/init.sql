\c vvault
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================
-- Knowledge Base
-- =========================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding VECTOR(768),
    source TEXT,
    org_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Q&A Cache (FIXED)
-- =========================
CREATE TABLE IF NOT EXISTS qa_cache (
    id SERIAL PRIMARY KEY,
    question TEXT,
    question_hash TEXT,
    answer TEXT,
    embedding VECTOR(768),
    confidence INT,
    source VARCHAR(50),
    justification TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    source_text TEXT,
    raw_context TEXT,
    matched_question TEXT,
    run_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🔥 SAFETY: remove old unique constraint if exists
ALTER TABLE qa_cache DROP CONSTRAINT IF EXISTS qa_cache_question_hash_key;

-- Migrations for org_id (safe for existing deployments)
ALTER TABLE qa_cache ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS org_id TEXT;

CREATE INDEX IF NOT EXISTS idx_qa_cache_org_id ON qa_cache(org_id);

-- 🔥 Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kb_embedding
ON knowledge_base
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_cache_embedding
ON qa_cache
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_run_id
ON qa_cache(run_id);

-- =========================
-- Async Jobs
-- =========================
CREATE TABLE IF NOT EXISTS jobs (
    run_id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'queued',
    progress INT DEFAULT 0,
    total INT DEFAULT 0,
    source_template INT DEFAULT 0,
    source_llm INT DEFAULT 0,
    source_cache INT DEFAULT 0,
    source_fallback INT DEFAULT 0,
    error TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- System Logs
-- =========================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    event TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- User Management
-- =========================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration: add password_hash if upgrading from older schema
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Default admin user (no password — seeded at runtime with bcrypt hash)
INSERT INTO users (username, role)
VALUES ('admin', 'admin')
ON CONFLICT (username) DO NOTHING;

-- =========================
-- Evidence
-- =========================
CREATE TABLE IF NOT EXISTS evidence (
    id SERIAL PRIMARY KEY,
    cache_id INT REFERENCES qa_cache(id) ON DELETE CASCADE,
    org_id TEXT,
    evidence_type TEXT DEFAULT 'note',
    content TEXT,
    filename TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS org_id TEXT;

-- =========================
-- Audit Logs
-- =========================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_name TEXT,
    action TEXT,
    question TEXT,
    answer TEXT,
    run_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);




-- Jobs table for async processing
CREATE TABLE IF NOT EXISTS jobs (
    run_id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'pending',
    progress INT DEFAULT 0,
    total INT DEFAULT 0,
    source_template INT DEFAULT 0,
    source_llm INT DEFAULT 0,
    source_cache INT DEFAULT 0,
    source_fallback INT DEFAULT 0,
    error TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Evidence table for answer attachments
CREATE TABLE IF NOT EXISTS evidence (
    id SERIAL PRIMARY KEY,
    cache_id INT REFERENCES qa_cache(id) ON DELETE CASCADE,
    org_id TEXT DEFAULT 'default',
    evidence_type TEXT DEFAULT 'note',
    content TEXT,
    filename TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);