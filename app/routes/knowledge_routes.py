from fastapi import APIRouter, UploadFile, File, HTTPException, Request

from app.services.knowledge_service import (
    chunk_text,
    store_chunks,
    extract_text_from_pdf
)

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


# -----------------------------
# UPLOAD KNOWLEDGE FILE (PDF + TXT)
# -----------------------------
@router.post("/upload")
async def upload_knowledge(request: Request, file: UploadFile = File(...)):
    org_id = request.state.username

    if not file.filename:
        raise HTTPException(status_code=400, detail="Invalid file")

    content = await file.read()

    if file.filename.lower().endswith(".pdf"):
        text = extract_text_from_pdf(content)
    elif file.filename.lower().endswith(".txt"):
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            raise HTTPException(status_code=400, detail="Text decoding failed")
    elif file.filename.lower().endswith(".docx"):
        try:
            from docx import Document as DocxDocument
            import io as _io
            doc = DocxDocument(_io.BytesIO(content))
            text = "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        except Exception:
            raise HTTPException(status_code=400, detail="Word document parsing failed")
    else:
        raise HTTPException(status_code=400, detail="Only .pdf, .txt, or .docx files supported")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable content found")

    chunks = chunk_text(text)

    if len(chunks) == 0:
        raise HTTPException(status_code=400, detail="No valid chunks")

    store_chunks(chunks, source=file.filename, org_id=org_id)

    return {
        "message": f"{len(chunks)} chunks stored",
        "filename": file.filename
    }

def get_uploaded_sources():
    from app.services.cache_db import get_conn  # reuse existing connection

    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT DISTINCT source
            FROM knowledge_base
            ORDER BY source;
        """)

        rows = cur.fetchall()

        cur.close()
        conn.close()

        return [r[0] for r in rows]

    except Exception as e:
        print("❌ get_uploaded_sources error:", str(e))
        return []


@router.get("/sources")
def get_sources(request: Request):
    try:
        from app.services.knowledge_service import get_uploaded_sources
        return get_uploaded_sources(org_id=request.state.username)
    except Exception as e:
        print("❌ /sources error:", str(e))
        return {"error": str(e)}
# -----------------------------
# HEALTH CHECK
# -----------------------------
@router.get("/health")
def health():
    return {"status": "knowledge service running"}


