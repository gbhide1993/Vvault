import logging
from app.services.cache_db import get_conn
from app.services.embedding_service import generate_embedding
from psycopg2.extras import RealDictCursor
import fitz  # PyMuPDF
import re

logger = logging.getLogger(__name__)

def chunk_text(text: str):
    """
    Smart chunking:
    - Splits by headings
    - Converts bullet points into sentences
    - Keeps chunks small and meaningful
    """

    chunks = []

    # Normalize text
    text = text.replace("\r", "")

    # Split by sections (double newline or headings)
    sections = re.split(r"\n\s*\n", text)

    for sec in sections:
        sec = sec.strip()
        if not sec:
            continue

        lines = sec.split("\n")

        # Detect heading + bullets
        if any(line.strip().startswith("-") for line in lines):
            heading = lines[0].strip()

            bullets = [
                line.replace("-", "").strip()
                for line in lines[1:]
                if line.strip().startswith("-")
            ]

            if bullets:
                combined = f"{heading}: " + ", ".join(bullets)
                chunks.append(combined)

        else:
            # Normal paragraph → split into sentences
            sentences = re.split(r"\. ", sec)

            for sent in sentences:
                sent = sent.strip()
                if len(sent) > 30:
                    chunks.append(sent)

    return chunks

# -----------------------------
# TEXT EXTRACTION FROM PDF
# -----------------------------
def extract_text_from_pdf(file_bytes):
    text = ""

    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        for page in doc:
            text += page.get_text()

    return text


# -----------------------------
# TEXT SPLITTING (simple + effective)
# -----------------------------
def split_text(text, chunk_size=500):
    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)

    return chunks


# -----------------------------
# STORE CHUNKS IN DB
# -----------------------------
def store_chunks(chunks, source, org_id=None):
    conn = get_conn()
    cur = conn.cursor()

    for chunk in chunks:
        embedding = generate_embedding(chunk)
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"

        cur.execute(
            """
            INSERT INTO knowledge_base (content, embedding, source, org_id)
            VALUES (%s, %s::vector, %s, %s)
            """,
            (chunk, embedding_str, source, org_id),
        )

    conn.commit()
    cur.close()
    conn.close()


# -----------------------------
# RETRIEVE CONTEXT
# -----------------------------
def retrieve_knowledge(question, top_k=3, org_id=None):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    embedding = generate_embedding(question)
    embedding_str = "[" + ",".join(map(str, embedding)) + "]"

    query = """
    SELECT content,
           1 - (embedding <=> %s::vector) AS similarity
    FROM knowledge_base
    WHERE org_id = %s
    ORDER BY similarity DESC
    LIMIT %s;
    """

    cur.execute(query, (embedding_str, org_id, top_k))
    results = cur.fetchall()

    cur.close()
    conn.close()

    if not results:
        return ""

    return "\n\n".join([r["content"] for r in results])


def get_uploaded_sources(org_id=None):
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT source, MIN(created_at) AS uploaded_at, COUNT(*) AS chunk_count
            FROM knowledge_base
            WHERE org_id = %s
            GROUP BY source
            ORDER BY source;
        """, (org_id,))

        rows = cur.fetchall()

        cur.close()
        conn.close()

        return [
            {
                "source": r[0],
                "uploaded_at": r[1].isoformat() if r[1] else None,
                "chunk_count": r[2],
            }
            for r in rows
        ]

    except Exception as e:
        logger.error("get_uploaded_sources error: %s", str(e))
        return []

def detect_conflicts(chunks):
    HARD_CONTRADICTIONS = [
        ("white", "black"), ("white", "dark"), ("black", "white"),
        ("never", "always"), ("never", "immediately"), ("never", "automatically"),
        ("prohibited", "permitted"), ("not permitted", "permitted"),
        ("not allowed", "allowed"), ("mandatory", "optional"),
        ("required", "optional"), ("no exceptions", "optional"),
        ("must not", "must"), ("before", "after"), ("prior to", "upon"),
        ("immediately", "never"), ("first", "last"),
        ("human review required", "automatically"), ("sign-off required", "no sign-off"),
        ("approved", "not approved"), ("true", "false"), ("yes", "no"),
        ("enabled", "disabled"), ("active", "inactive"),
    ]

    if len(chunks) < 2:
        return {"conflict": False, "conflicting_pairs": []}

    conflicting_pairs = []
    conflict_detected = False

    for i in range(len(chunks)):
        for j in range(i + 1, len(chunks)):
            chunk_a = chunks[i]
            chunk_b = chunks[j]
            a = chunk_a.get("content", "").lower()
            b = chunk_b.get("content", "").lower()

            words_a = set(w for w in re.findall(r"[a-z]+", a) if len(w) > 4)
            words_b = set(w for w in re.findall(r"[a-z]+", b) if len(w) > 4)
            shared = words_a & words_b

            if len(shared) < 2:
                continue

            for word_a, word_b in HARD_CONTRADICTIONS:
                if (word_a in a and word_b in b) or (word_b in a and word_a in b):
                    conflicting_pairs.append({
                        "source_a": chunk_a.get("source", ""),
                        "excerpt_a": chunk_a.get("content", "")[:200],
                        "source_b": chunk_b.get("source", ""),
                        "excerpt_b": chunk_b.get("content", "")[:200],
                    })
                    conflict_detected = True
                    break

    return {"conflict": conflict_detected, "conflicting_pairs": conflicting_pairs}


def check_source_freshness(kb_results, org_id):
    from datetime import datetime, timezone, timedelta
    stale_sources = []
    seen = set()

    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        for item in kb_results:
            source = item.get("source")
            if not source or source in seen:
                continue
            seen.add(source)

            try:
                cur.execute("""
                    SELECT source, MIN(created_at) as first_uploaded
                    FROM knowledge_base WHERE source = %s AND org_id = %s
                    GROUP BY source;
                """, (source, org_id))
                row = cur.fetchone()
                if row and row["first_uploaded"]:
                    first_uploaded = row["first_uploaded"]
                    if first_uploaded.tzinfo is None:
                        first_uploaded = first_uploaded.replace(tzinfo=timezone.utc)
                    age_days = (datetime.now(timezone.utc) - first_uploaded).days
                    if age_days > 90:
                        stale_sources.append({
                            "source": source,
                            "uploaded_at": first_uploaded.isoformat(),
                            "age_days": age_days,
                        })
            except Exception as e:
                logger.error("Freshness check failed for source %s: %s", source, e)

        cur.close()
        conn.close()

    except Exception as e:
        logger.error("check_source_freshness DB error: %s", e)

    return {"has_stale": len(stale_sources) > 0, "stale_sources": stale_sources}


def delete_source(source: str, org_id: str) -> int:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM knowledge_base WHERE source = %s AND org_id = %s",
        (source, org_id),
    )
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return deleted


def retrieve_knowledge_with_embedding(question_embedding, top_k=3, org_id=None):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    embedding_str = "[" + ",".join(map(str, question_embedding)) + "]"
    query = """
    SELECT content,
           1 - (embedding <=> %s::vector) AS similarity
    FROM knowledge_base
    WHERE org_id = %s
    ORDER BY similarity DESC
    LIMIT %s;
    """
    cur.execute(query, (embedding_str, org_id, top_k))
    results = cur.fetchall()
    cur.close()
    conn.close()
    if not results:
        return ""
    return "\n\n".join([r["content"] for r in results])


def retrieve_knowledge_rows_with_embedding(question_embedding, top_k=3, org_id=None):
    """Return full rows (content + source) for the top-k KB matches."""
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    embedding_str = "[" + ",".join(map(str, question_embedding)) + "]"
    cur.execute("""
    SELECT content, source, created_at,
           1 - (embedding <=> %s::vector) AS similarity
    FROM knowledge_base
    WHERE org_id = %s
    ORDER BY similarity DESC
    LIMIT %s;
    """, (embedding_str, org_id, top_k))
    results = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in results]


def retrieve_knowledge_by_embedding(embedding: list, top_k: int = 3, org_id: str = None) -> str:
    from app.services.cache_db import get_conn
    from psycopg2.extras import RealDictCursor
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"
        cur.execute("""
        SELECT content, 1 - (embedding <=> %s::vector) AS similarity
        FROM knowledge_base WHERE org_id = %s
        ORDER BY similarity DESC LIMIT %s;
        """, (embedding_str, org_id, top_k))
        results = cur.fetchall()
        cur.close()
        conn.close()
        if not results:
            return ""
        return "\n\n".join([r["content"] for r in results])
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("retrieve_knowledge_by_embedding failed: %s", e)
        return ""