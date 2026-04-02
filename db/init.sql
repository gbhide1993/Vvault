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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Q&A Cache (FIXED)
-- =========================
CREATE TABLE IF NOT EXISTS qa_cache (
    id SERIAL PRIMARY KEY,
    question TEXT,
    question_hash TEXT,   -- ❌ removed UNIQUE
    answer TEXT,
    embedding VECTOR(768),
    confidence INT,
    source VARCHAR(50),
    justification TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    source_text TEXT,
    run_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🔥 SAFETY: remove old unique constraint if exists
ALTER TABLE qa_cache DROP CONSTRAINT IF EXISTS qa_cache_question_hash_key;

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
    role TEXT DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default admin user
INSERT INTO users (username, role)
VALUES ('admin', 'admin')
ON CONFLICT (username) DO NOTHING;

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