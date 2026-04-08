import logging
from app.services.cache_db import get_conn

logger = logging.getLogger(__name__)

# Run migrations/001_audit_logs.sql to create this table.
def log_action(user_name, action, question, answer, run_id):
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO audit_logs (user_name, action, question, answer, run_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_name, action, question, answer, run_id))

        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(
            "Failed to write audit log (run migrations/001_audit_logs.sql if table missing): %s",
            e
        )
