from app.services.cache_db import get_conn

def log_action(user_name, action, question, answer, run_id):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO audit_logs (user_name, action, question, answer, run_id)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_name, action, question, answer, run_id))

    conn.commit()
    cur.close()
    conn.close()