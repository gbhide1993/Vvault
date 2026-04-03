from app.services.cache_db import get_conn
from app.services.embedding_service import generate_embedding
from psycopg2.extras import RealDictCursor
import fitz  # PyMuPDF
import re

import re

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
            SELECT DISTINCT source
            FROM knowledge_base
            WHERE org_id = %s
            ORDER BY source;
        """, (org_id,))

        rows = cur.fetchall()

        cur.close()
        conn.close()

        return [r[0] for r in rows]

    except Exception as e:
        print("❌ get_uploaded_sources error:", str(e))
        return []