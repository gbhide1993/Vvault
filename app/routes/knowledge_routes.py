import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Request

from app.services.knowledge_service import (
    chunk_text,
    store_chunks,
    extract_text_from_pdf,
    get_uploaded_sources,
    delete_source,
)

logger = logging.getLogger(__name__)

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


@router.get("/sources")
def get_sources(request: Request):
    try:
        return get_uploaded_sources(org_id=request.state.username)
    except Exception as e:
        logger.error("/sources error: %s", e)
        return {"error": str(e)}


@router.delete("/sources/{source_name}")
def delete_knowledge_source(source_name: str, request: Request):
    org_id = request.state.username
    count = delete_source(source=source_name, org_id=org_id)
    if count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"message": f"Deleted {count} chunks for '{source_name}'", "deleted_chunks": count}


# -----------------------------
# HEALTH CHECK
# -----------------------------
@router.get("/health")
def health():
    return {"status": "knowledge service running"}
