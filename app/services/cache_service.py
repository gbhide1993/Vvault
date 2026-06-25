from app.services.cache_db import fetch_similar, insert_cache
from app.services.embedding_service import generate_embedding
import os
import hashlib
import threading
import logging

logger = logging.getLogger(__name__)

THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", 0.75))

CACHE = {}  # in-memory cache
_cache_lock = threading.Lock()


def get_hash(text):
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()


def get_cached_answer(question: str, org_id=None, embedding=None):
    q = (org_id, question.lower())

    # ⚡ 1. In-memory cache
    with _cache_lock:
        if q in CACHE:
            logger.debug("⚡ In-memory cache hit")
            return CACHE[q]

    # 🧠 2. DB semantic cache
    if embedding is None:
        embedding = generate_embedding(question)
    result = fetch_similar(embedding, threshold=THRESHOLD, org_id=org_id)

    if result:
        logger.debug("⚡ DB cache hit")

        # 🔥 ONLY APPROVED
        if result.get("status") != "approved":
            logger.debug("⛔ Skipping non-approved cache")
            return None

        cache_obj = {
            "answer": result["answer"],
            "matched_question": result.get("question"),
            "source": result.get("source", "cache"),
        }

        with _cache_lock:
            CACHE[q] = cache_obj
        return cache_obj

    return None


def set_cached_answer(question: str, data, org_id=None, embedding=None):
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

    with _cache_lock:
        CACHE[q] = {
            "answer": answer,
            "source": source,
        }

    if embedding is None:
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
        has_stale_sources=data.get("has_stale_sources", False),
        stale_sources=data.get("stale_sources", []),
        conflict_detected=data.get("conflict_detected", False),
        conflicting_pairs=data.get("conflicting_pairs", []),
        kb_sources=data.get("kb_sources", []),
    )


def get_cached_answer_with_embedding(question_embedding, org_id=None, question=""):
    if question:
        q = (org_id, question.lower())
        with _cache_lock:
            if q in CACHE:
                logger.debug("⚡ In-memory cache hit (embedding path)")
                return CACHE[q]

    result = fetch_similar(question_embedding, threshold=THRESHOLD, org_id=org_id)

    if result:
        if result.get("status") != "approved":
            logger.debug("⛔ Skipping non-approved cache")
            return None

        cache_obj = {
            "answer": result["answer"],
            "matched_question": result.get("question"),
            "source": result.get("source", "cache"),
        }

        if question:
            q = (org_id, question.lower())
            with _cache_lock:
                CACHE[q] = cache_obj
        return cache_obj

    return None


def set_cached_answer_with_embedding(question, question_embedding, data):
    org_id = data.get("org_id", "default") if isinstance(data, dict) else "default"
    q = (org_id, question.lower())

    answer = data.get("answer") if isinstance(data, dict) else data
    source = data.get("source", "llm") if isinstance(data, dict) else "llm"
    confidence = data.get("confidence", 50) if isinstance(data, dict) else 50

    with _cache_lock:
        CACHE[q] = {"answer": answer, "source": source}

    q_hash = get_hash(question)
    insert_cache(
        question=question,
        question_hash=q_hash,
        embedding=question_embedding,
        answer=answer,
        confidence=confidence,
        status="pending",
        source=source,
        justification=data.get("justification", "") if isinstance(data, dict) else "",
        raw_context=data.get("raw_context", "") if isinstance(data, dict) else "",
        matched_question=None,
        source_text=data.get("source_text") if isinstance(data, dict) else None,
        run_id=data.get("run_id") if isinstance(data, dict) else None,
        org_id=org_id,
        has_stale_sources=data.get("has_stale_sources", False) if isinstance(data, dict) else False,
        stale_sources=data.get("stale_sources", []) if isinstance(data, dict) else [],
        conflict_detected=data.get("conflict_detected", False) if isinstance(data, dict) else False,
        conflicting_pairs=data.get("conflicting_pairs", []) if isinstance(data, dict) else [],
        kb_sources=data.get("kb_sources", []) if isinstance(data, dict) else [],
    )
