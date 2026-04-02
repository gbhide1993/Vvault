from fastapi import APIRouter, Query
import psycopg2
import os

from app.services.cache_db import (
    get_pending_answers,
    update_status,
    approve_all_pending,
    get_approved_answers,
)

from app.services.confidence_service import build_confidence

router = APIRouter(prefix="/cache", tags=["Cache Management"])


# ----------------------------------
# 1. GET PENDING (ENRICHED)
# ----------------------------------
@router.get("/pending")
def get_pending(limit: int = 50):
    results = get_pending_answers(limit)

    enriched = []

    for row in results:
        source = row.get("source", "llm")

        confidence, justification = build_confidence(source)

        enriched.append({
            "id": row["id"],
            "question": row["question"],
            "answer": row["answer"],
            "source": source,
            "confidence": confidence,
            "justification": justification,
            "created_at": row["created_at"]
        })

    return {
        "count": len(enriched),
        "items": enriched
    }


# ----------------------------------
# 2. APPROVE SINGLE
# ----------------------------------
@router.post("/approve/{cache_id}")
def approve(cache_id: int, user: str):
    from app.services.user_service import get_user

    user_obj = get_user(user)

    if not user_obj or user_obj["role"] != "admin":
        return {"error": "Not authorized"}
    
    from app.services.cache_db import get_record_by_id
    from app.services.audit_service import log_action

    record = get_record_by_id(cache_id)

    update_status(cache_id, "approved")

    if record:
        log_action(
            user_name=user,
            action="approved",
            question=record["question"],
            answer=record["answer"],
            run_id=record.get("run_id")
        )

    return {
        "message": f"Cache ID {cache_id} approved"
    }


# ----------------------------------
# 3. REJECT SINGLE
# ----------------------------------
@router.post("/reject/{cache_id}")
def reject(cache_id: int, user: str):
    from app.services.user_service import get_user

    user_obj = get_user(user)

    if not user_obj or user_obj["role"] != "admin":
        return {"error": "Not authorized"}
    
    from app.services.cache_db import get_record_by_id
    from app.services.audit_service import log_action

    record = get_record_by_id(cache_id)

    update_status(cache_id, "rejected")

    if record:
        log_action(
            user_name=user,
            action="rejected",
            question=record["question"],
            answer=record["answer"],
            run_id=record.get("run_id")
        )

    return {
        "message": f"Cache ID {cache_id} rejected"
    }

# ----------------------------------
# 4. BULK APPROVE
# ----------------------------------
@router.post("/approve-all")
def approve_all():
    count = approve_all_pending()

    return {
        "message": f"{count} records approved"
    }


# ----------------------------------
# 5. GET APPROVED (ENRICHED)
# ----------------------------------
@router.get("/approved")
def get_approved(limit: int = 50):
    results = get_approved_answers(limit)

    enriched = []

    for row in results:
        source = row.get("source", "cache")

        confidence, justification = build_confidence(source)

        enriched.append({
            "id": row["id"],
            "question": row["question"],
            "answer": row["answer"],
            "source": source,
            "confidence": confidence,
            "justification": justification,
            "updated_at": row["updated_at"]
        })

    return {
        "count": len(enriched),
        "items": enriched
    }

# ----------------------------------
# 5. GET ALL (ENRICHED)
# ----------------------------------


@router.get("/all")
def get_all_cache(run_id: str = None):
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT")
    )

    cur = conn.cursor()

    if not run_id:
        return {"error": "run_id is required"}
    
    cur.execute("""
        SELECT id, question, answer, confidence, source, source_text, status, justification, matched_question, created_at, updated_at
        FROM qa_cache
        WHERE (%s IS NULL OR run_id = %s)        
        ORDER BY id DESC
    """,
        (run_id, run_id)
    )

    rows = cur.fetchall()

    columns = [desc[0] for desc in cur.description]
    result = []

    for row in rows:
        item = dict(zip(columns, row))

        # 🔥 ensure defaults
        if not item.get("status"):
            item["status"] = "pending"

        if not item.get("confidence"):
            item["confidence"] = 0

        result.append(item)

    cur.close()
    conn.close()

    return result

# ----------------------------------
# USER MANAGEMENT 
# ----------------------------------


# CREATE USER

@router.post("/users/create")
def create_user_api(
    username: str = Query(...),
    role: str = Query(...),
    user: str = Query(...)
):
    from app.services.user_service import get_user, create_user

    admin = get_user(user.strip().lower())

    if not admin or admin["role"] != "admin":
        return {"error": "Not authorized"}

    create_user(username.strip().lower(), role)

    return {"message": f"user {username} created"}

# DELETE USER

@router.post("/users/delete")
def delete_user_api(
    username: str = Query(...),
    user: str = Query(...)
):
    from app.services.user_service import get_user, delete_user

    admin = get_user(user.strip().lower())

    if not admin or admin["role"] != "admin":
        return {"error": "Not authorized"}

    delete_user(username.strip().lower())

    return {"message": f"user {username} deleted"}

# LIST USERS

@router.get("/users")
def list_users_api():
    from app.services.user_service import list_users

    return list_users()


@router.get("/audit")
def get_audit_logs(limit: int = 50):
    from app.services.cache_db import get_conn
    from psycopg2.extras import RealDictCursor

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT user_name, action, question, run_id, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT %s
    """, (limit,))

    results = cur.fetchall()

    cur.close()
    conn.close()

    return results