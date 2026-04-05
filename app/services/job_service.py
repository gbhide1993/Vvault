from app.services.cache_db import get_conn


def create_job(run_id: str, total: int):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO jobs (run_id, status, progress, total)
        VALUES (%s, 'queued', 0, %s)
        ON CONFLICT (run_id) DO UPDATE SET
            status = 'queued', progress = 0, total = %s,
            updated_at = CURRENT_TIMESTAMP
    """, (run_id, total, total))
    conn.commit()
    cur.close()
    conn.close()


def update_job_progress(run_id: str, source: str):
    conn = get_conn()
    cur = conn.cursor()
    source_col = f"source_{source}" if source in ["template", "llm", "cache", "fallback"] else "source_fallback"
    cur.execute(f"""
        UPDATE jobs SET
            progress = progress + 1,
            status = 'processing',
            {source_col} = {source_col} + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE run_id = %s
    """, (run_id,))
    conn.commit()
    cur.close()
    conn.close()


def complete_job(run_id: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE jobs SET status = 'complete',
            updated_at = CURRENT_TIMESTAMP
        WHERE run_id = %s
    """, (run_id,))
    conn.commit()
    cur.close()
    conn.close()


def fail_job(run_id: str, error: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE jobs SET status = 'error', error = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE run_id = %s
    """, (error, run_id))
    conn.commit()
    cur.close()
    conn.close()


def get_job(run_id: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT run_id, status, progress, total,
            source_template, source_llm, source_cache, source_fallback,
            error, started_at
        FROM jobs WHERE run_id = %s
    """, (run_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return {
        "run_id": row[0],
        "status": row[1],
        "progress": row[2],
        "total": row[3],
        "source_counts": {
            "template": row[4],
            "llm": row[5],
            "cache": row[6],
            "fallback": row[7],
        },
        "error": row[8],
        "started_at": row[9].isoformat() if row[9] else None,
    }
