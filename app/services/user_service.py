from app.services.cache_db import get_conn
from psycopg2.extras import RealDictCursor
import bcrypt

_ADMIN_DEFAULT_PASSWORD = "changeme123"


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def authenticate_user(username: str, password: str):
    """Return user dict if credentials are valid, else None."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not user.get("password_hash"):
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


def update_password(username: str, new_password: str) -> bool:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET password_hash = %s WHERE username = %s",
        (hash_password(new_password), username),
    )
    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return updated


def is_default_password() -> bool:
    return authenticate_user("admin", "changeme123") is not None


def seed_admin_if_missing():
    """Ensure admin user exists and has a password hash."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE username = 'admin'")
    admin = cur.fetchone()

    if not admin:
        cur.execute(
            "INSERT INTO users (username, role, password_hash) VALUES (%s, %s, %s)",
            ("admin", "admin", hash_password(_ADMIN_DEFAULT_PASSWORD)),
        )
    elif not admin.get("password_hash"):
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE username = 'admin'",
            (hash_password(_ADMIN_DEFAULT_PASSWORD),),
        )

    conn.commit()
    cur.close()
    conn.close()


def get_user(username: str):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return user


def create_user(username: str, role: str, password: str = "changeme"):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO users (username, role, password_hash)
        VALUES (%s, %s, %s)
        ON CONFLICT (username) DO NOTHING
        """,
        (username, role, hash_password(password)),
    )
    conn.commit()
    cur.close()
    conn.close()


def delete_user(username: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE username = %s", (username,))
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
