from app.services.cache_db import get_conn
from psycopg2.extras import RealDictCursor

def get_user(username):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT * FROM users WHERE username = %s
    """, (username,))

    user = cur.fetchone()

    cur.close()
    conn.close()

    return user


def create_user(username, role):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO users (username, role)
        VALUES (%s, %s)
        ON CONFLICT (username) DO NOTHING
    """, (username, role))

    conn.commit()
    cur.close()
    conn.close()


def delete_user(username):
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM users WHERE username = %s
    """, (username,))

    conn.commit()
    cur.close()
    conn.close()


def list_users():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT username, role FROM users ORDER BY username")

    users = cur.fetchall()

    cur.close()
    conn.close()

    return users