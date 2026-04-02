import os
import psycopg2
from psycopg2.extras import RealDictCursor


def get_conn():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME", "vvault"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
    )


def fetch_similar(embedding, threshold=0.85):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    embedding_str = "[" + ",".join(map(str, embedding)) + "]"

    query = """
    SELECT 
        id,
        question,
        answer,
        status,
        source,
        1 - (embedding <=> %s::vector) AS similarity
    FROM qa_cache
    WHERE 1 - (embedding <=> %s::vector) > %s
    ORDER BY similarity DESC
    LIMIT 1;
    """

    cur.execute(query, (embedding_str, embedding_str, threshold))
    result = cur.fetchone()

    cur.close()
    conn.close()

    return result


def insert_cache(question, question_hash, embedding, answer, confidence, status, source, justification="", raw_context="", matched_question=None, source_text=None, run_id=None):
    conn = get_conn()
    cur = conn.cursor()

    embedding_str = "[" + ",".join(map(str, embedding)) + "]"

    query = """
INSERT INTO qa_cache (
    question,
    question_hash,
    embedding,
    answer,
    confidence,
    status,
    source,
    justification,
    raw_context,
    matched_question,
    source_text,
    run_id
)
VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (question_hash)
DO UPDATE SET
    answer = EXCLUDED.answer,
    embedding = EXCLUDED.embedding,
    source = EXCLUDED.source,
    confidence = EXCLUDED.confidence,
    justification = EXCLUDED.justification,
    raw_context = EXCLUDED.raw_context,
    matched_question = EXCLUDED.matched_question,
    source_text = EXCLUDED.source_text,
    run_id = EXCLUDED.run_id,
    status = 'pending',
    updated_at = CURRENT_TIMESTAMP;
"""

    cur.execute(
        query,
        (question, question_hash, embedding_str, answer, confidence, status, source, justification, raw_context, matched_question, source_text, run_id),
    )

    conn.commit()
    cur.close()
    conn.close()


# -----------------------------
# NEW FUNCTIONS
# -----------------------------

def get_pending_answers(limit=50):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    query = """
    SELECT id, question, answer, source, created_at
    FROM qa_cache
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT %s;
    """

    cur.execute(query, (limit,))
    results = cur.fetchall()

    cur.close()
    conn.close()

    return results


def get_approved_answers(limit=50):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    query = """
    SELECT id, question, answer, source, updated_at
    FROM qa_cache
    WHERE status = 'approved'
    ORDER BY updated_at DESC
    LIMIT %s;
    """

    cur.execute(query, (limit,))
    results = cur.fetchall()

    cur.close()
    conn.close()

    return results


def update_status(cache_id, status):
    conn = get_conn()
    cur = conn.cursor()

    query = """
    UPDATE qa_cache
    SET status = %s,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = %s;
    """

    cur.execute(query, (status, cache_id))
    conn.commit()

    cur.close()
    conn.close()


def approve_all_pending():
    conn = get_conn()
    cur = conn.cursor()

    query = """
    UPDATE qa_cache
    SET status = 'approved',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending';
    """

    cur.execute(query)
    count = cur.rowcount

    conn.commit()

    cur.close()
    conn.close()

    return count

def get_record_by_id(cache_id):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT * FROM qa_cache WHERE id = %s
    """, (cache_id,))

    result = cur.fetchone()

    cur.close()
    conn.close()

    return result