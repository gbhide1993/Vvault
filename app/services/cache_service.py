from app.services.cache_db import fetch_similar, insert_cache
from app.services.embedding_service import generate_embedding
import os
import hashlib

THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", 0.85))

CACHE = {}  # in-memory cache


def get_hash(text):
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()


def get_cached_answer(question: str, org_id=None):
    q = (org_id, question.lower())

    # ⚡ 1. In-memory cache
    if q in CACHE:
        print("⚡ In-memory cache hit")
        return CACHE[q]

    # 🧠 2. DB semantic cache
    embedding = generate_embedding(question)
    result = fetch_similar(embedding, threshold=THRESHOLD, org_id=org_id)

    if result:
        print("⚡ DB cache hit")

        # 🔥 ONLY APPROVED
        if result.get("status") != "approved":
            print("⛔ Skipping non-approved cache")
            return None

        cache_obj = {
            "answer": result["answer"],
            "matched_question": result.get("question"),
            "source": result.get("source", "cache"),
        }

        CACHE[q] = cache_obj
        return cache_obj

    return None


def set_cached_answer(question: str, data, org_id=None):
    q = (org_id, question.lower())

    answer = None
    source = "llm"
    confidence = 50
    run_id = None
    source_text = None

    if isinstance(data, dict):
        answer = data.get("answer")
        source = data.get("source", "llm")
        confidence = data.get("confidence", 50)
        run_id = data.get("run_id")
        source_text = data.get("source_text")
    else:
        answer = data

    CACHE[q] = {
        "answer": answer,
        "source": source,
    }

    embedding = generate_embedding(question)
    q_hash = get_hash(question)

    insert_cache(
        question=question,
        question_hash=q_hash,
        embedding=embedding,
        answer=answer,
        confidence=confidence,
        status="pending",
        source=source,
        justification=data.get("justification", ""),
        raw_context=data.get("raw_context", ""),
        matched_question=data.get("matched_question"),
        source_text=data.get("source_text"),
        run_id=data.get("run_id"),
        org_id=data.get("org_id", "default"),
    )


