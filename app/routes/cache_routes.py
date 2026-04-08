from fastapi import APIRouter, Query, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import io

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
def get_pending(request: Request, limit: int = 50):
    org_id = request.state.username
    results = get_pending_answers(limit, org_id=org_id)

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
def approve(cache_id: int, request: Request):
    if request.state.role != "admin":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"error": "Not authorized"})

    from app.services.cache_db import get_record_by_id
    from app.services.audit_service import log_action

    record = get_record_by_id(cache_id)

    update_status(cache_id, "approved")

    if record:
        log_action(
            user_name=request.state.username,
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
def reject(cache_id: int, request: Request):
    if request.state.role != "admin":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"error": "Not authorized"})

    from app.services.cache_db import get_record_by_id
    from app.services.audit_service import log_action

    record = get_record_by_id(cache_id)

    update_status(cache_id, "rejected")

    if record:
        log_action(
            user_name=request.state.username,
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
def approve_all(request: Request):
    org_id = request.state.username
    count = approve_all_pending(org_id=org_id)

    return {
        "message": f"{count} records approved"
    }


# ----------------------------------
# 5. GET APPROVED (ENRICHED)
# ----------------------------------
@router.get("/approved")
def get_approved(request: Request, limit: int = 50):
    org_id = request.state.username
    results = get_approved_answers(limit, org_id=org_id)

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
def get_all_cache(request: Request, run_id: str = None):
    from app.services.cache_db import get_conn
    org_id = request.state.username

    conn = get_conn()
    cur = conn.cursor()

    if not run_id:
        return {"error": "run_id is required"}

    cur.execute("""
            SELECT q.id, q.question, q.answer, q.confidence, q.source, q.source_text,
                   q.status, q.justification, q.raw_context, q.matched_question,
                   q.created_at, q.updated_at,
                   COUNT(e.id) AS evidence_count
            FROM qa_cache q
            LEFT JOIN evidence e ON e.cache_id = q.id AND e.org_id = %s
            WHERE (q.run_id = %s)
            AND (q.org_id = %s OR q.org_id IS NULL OR q.org_id = '')
            GROUP BY q.id
            ORDER BY q.id DESC
    """,
        (org_id, run_id, org_id)
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


# SET PASSWORD

@router.post("/users/set-password")
def set_password_api(
    request: Request,
    username: str = Query(...),
    new_password: str = Query(...),
):
    if request.state.role != "admin" and request.state.username != username:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"error": "Not authorized"})

    from app.services.user_service import update_password

    updated = update_password(username, new_password)
    if not updated:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "User not found"})

    return {"message": f"Password updated for {username}"}


# CREATE USER

@router.post("/users/create")
def create_user_api(
    request: Request,
    username: str = Query(...),
    role: str = Query(...),
    password: str = Query(...),
):
    if request.state.role != "admin":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"error": "Not authorized"})

    if len(password) < 8:
        return {"error": "Password must be at least 8 characters"}

    from app.services.user_service import create_user

    create_user(username.strip().lower(), role, password=password)

    return {"message": f"User {username} created"}

# DELETE USER

@router.post("/users/delete")
def delete_user_api(
    request: Request,
    username: str = Query(...),
):
    if request.state.role != "admin":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"error": "Not authorized"})

    from app.services.user_service import delete_user

    delete_user(username.strip().lower())

    return {"message": f"user {username} deleted"}

# LIST USERS

@router.get("/users")
def list_users_api():
    from app.services.user_service import list_users

    return list_users()


@router.get("/runs")
def get_runs(request: Request):
    from app.services.cache_db import get_conn
    from psycopg2.extras import RealDictCursor

    org_id = request.state.username
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("""
        SELECT run_id,
               MAX(created_at) AS created_at,
               COUNT(*) AS question_count
        FROM qa_cache
        WHERE org_id = %s
          AND run_id IS NOT NULL
        GROUP BY run_id
        ORDER BY MAX(created_at) DESC
        LIMIT 20
    """, (org_id,))

    results = cur.fetchall()
    cur.close()
    conn.close()
    return results


@router.post("/manual")
def add_manual_entry(request: Request, body: dict):
    from app.services.cache_db import insert_cache, get_conn
    from app.services.embedding_service import generate_embedding
    from app.services.cache_service import get_hash
    from psycopg2.extras import RealDictCursor

    question = (body.get("question") or "").strip()
    answer = (body.get("answer") or "").strip()

    if not question or not answer:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=422, content={"detail": "question and answer are required"})

    org_id = request.state.username
    embedding = generate_embedding(question)
    q_hash = get_hash(question)

    insert_cache(
        question=question,
        question_hash=q_hash,
        embedding=embedding,
        answer=answer,
        confidence=100,
        status="approved",
        source="manual",
        org_id=org_id,
    )

    # Fetch the inserted id
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id FROM qa_cache WHERE question_hash = %s AND org_id = %s ORDER BY id DESC LIMIT 1", (q_hash, org_id))
    row = cur.fetchone()
    cur.close()
    conn.close()

    return {"message": "Added to library", "id": row["id"] if row else None}


@router.get("/library")
def get_library(request: Request, search: str = None):
    from app.services.cache_db import get_conn
    from psycopg2.extras import RealDictCursor

    org_id = request.state.username
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if search:
        cur.execute("""
            SELECT id, question, answer, source, updated_at
            FROM qa_cache
            WHERE status = 'approved'
              AND org_id = %s
              AND question ILIKE %s
            ORDER BY updated_at DESC
        """, (org_id, f"%{search}%"))
    else:
        cur.execute("""
            SELECT id, question, answer, source, updated_at
            FROM qa_cache
            WHERE status = 'approved'
              AND org_id = %s
            ORDER BY updated_at DESC
        """, (org_id,))

    results = cur.fetchall()
    cur.close()
    conn.close()
    return results


@router.delete("/library/{item_id}")
def delete_library_item(item_id: int, request: Request):
    from app.services.cache_db import get_conn

    org_id = request.state.username
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE qa_cache
        SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id = %s AND org_id = %s AND status = 'approved'
    """, (item_id, org_id))

    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()

    if not updated:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Item not found or not authorized"})

    return {"message": f"Item {item_id} removed from library"}


@router.get("/upload/status/{run_id}")
def get_job_status(run_id: str, request: Request):
    from app.services.job_service import get_job

    job = get_job(run_id)

    if not job:
        return {
            "status": "unknown",
            "progress": 0,
            "total": 0,
            "source_counts": {"template": 0, "llm": 0, "cache": 0, "fallback": 0},
            "error": None
        }

    return job


@router.get("/upload/download/{run_id}")
def download_job_result(run_id: str):
    import os
    from fastapi.responses import FileResponse
    from app.services.job_service import get_job

    job = get_job(run_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "complete":
        raise HTTPException(status_code=400, detail="Job not complete yet")

    filepath = f"/tmp/{run_id}.xlsx"

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Result file not available — re-run autofill")

    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="vvault_output.xlsx"
    )


@router.post("/evidence/{cache_id}")
def add_evidence(cache_id: int, request: Request, body: dict):
    from app.services.cache_db import get_conn

    content = (body.get("content") or "").strip()
    evidence_type = body.get("evidence_type", "note")
    filename = (body.get("filename") or "").strip() or None

    if not content:
        return JSONResponse(status_code=422, content={"detail": "content is required"})

    if evidence_type not in ("note", "quote", "filename"):
        evidence_type = "note"

    org_id = request.state.username
    created_by = request.state.username

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO evidence (cache_id, org_id, evidence_type, content, filename, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (cache_id, org_id, evidence_type, content, filename, created_by))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    return {"id": row[0], "message": "Evidence added"}


@router.get("/evidence/{cache_id}")
def get_evidence(cache_id: int, request: Request):
    from app.services.cache_db import get_conn
    from psycopg2.extras import RealDictCursor

    org_id = request.state.username
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT id, evidence_type, content, filename, created_by, created_at
        FROM evidence
        WHERE cache_id = %s AND org_id = %s
        ORDER BY created_at ASC
    """, (cache_id, org_id))
    results = cur.fetchall()
    cur.close()
    conn.close()
    return results


@router.delete("/evidence/{evidence_id}")
def delete_evidence(evidence_id: int, request: Request):
    from app.services.cache_db import get_conn

    org_id = request.state.username
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        DELETE FROM evidence WHERE id = %s AND org_id = %s
    """, (evidence_id, org_id))
    deleted = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()

    if not deleted:
        return JSONResponse(status_code=404, content={"error": "Evidence not found or not authorized"})

    return {"message": "Evidence deleted"}


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

# ----------------------------------
# EVIDENCE ROUTES
# ----------------------------------

@router.post("/evidence/{cache_id}")
def add_evidence(cache_id: int, body: dict, request: Request):
    from app.services.cache_db import get_conn
    conn = get_conn()
    cur = conn.cursor()
    org_id = request.state.username
    cur.execute("""
        INSERT INTO evidence (cache_id, org_id, evidence_type, content, filename, created_by)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
    """, (
        cache_id, org_id,
        body.get("evidence_type", "note"),
        body.get("content", ""),
        body.get("filename", ""),
        request.state.username
    ))
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return {"id": new_id, "message": "Evidence added"}


@router.get("/evidence/{cache_id}")
def get_evidence(cache_id: int, request: Request):
    from app.services.cache_db import get_conn
    from psycopg2.extras import RealDictCursor
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    org_id = request.state.username
    cur.execute("""
        SELECT id, cache_id, evidence_type, content, filename, created_by, created_at
        FROM evidence
        WHERE cache_id = %s AND org_id = %s
        ORDER BY created_at DESC
    """, (cache_id, org_id))
    results = cur.fetchall()
    cur.close()
    conn.close()
    return results


@router.delete("/evidence/{evidence_id}")
def delete_evidence(evidence_id: int, request: Request):
    from app.services.cache_db import get_conn
    conn = get_conn()
    cur = conn.cursor()
    org_id = request.state.username
    cur.execute("""
        DELETE FROM evidence WHERE id = %s AND org_id = %s
    """, (evidence_id, org_id))
    deleted = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": "Not found"})
    return {"message": f"Evidence {evidence_id} deleted"}