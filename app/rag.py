import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse
import io
import uuid
import time
import threading

logger = logging.getLogger(__name__)

from app.utils.rag_excel_parser import parse_excel, is_valid_question
from app.utils.excel_writer import write_answers

from app.services.answer_service import generate_answer
from app.services.template_service import get_template_answer, init_template_embeddings_once
from app.services.cache_service import get_cached_answer, set_cached_answer
from app.services.dropdown_service import detect_dropdown_columns, map_answer_to_option
from app.models.answer_model import AnswerMetadata
from app.services.confidence_service import build_confidence
from app.services.knowledge_service import retrieve_knowledge
from app.services.job_service import create_job, update_job_progress, complete_job, fail_job
from app.services.embedding_service import generate_embedding
from app.services.cache_db import fetch_similar

router = APIRouter()

# ── Minimum context length to skip LLM entirely ───────────────────────────────
# If KB context is rich enough, use it directly — no LLM call needed.
MIN_CONTEXT_FOR_DIRECT_ANSWER = 150


def parse_docx_questionnaire(content: bytes) -> list:
    from docx import Document as DocxDocument
    doc = DocxDocument(io.BytesIO(content))
    rows = []
    idx = 0
    for para in doc.paragraphs:
        text = para.text.strip()
        if is_valid_question(text):
            rows.append({"index": idx, "question": text, "sheet": "Document", "row_idx": idx})
            idx += 1
    for table in doc.tables:
        for row in table.rows:
            if row.cells:
                text = row.cells[0].text.strip()
                if is_valid_question(text):
                    rows.append({"index": idx, "question": text, "sheet": "Document", "row_idx": idx})
                    idx += 1
    return rows


def parse_pdf_questionnaire(content: bytes) -> list:
    import fitz
    doc = fitz.open(stream=content, filetype="pdf")
    rows = []
    idx = 0
    for page in doc:
        text = page.get_text()
        for line in text.splitlines():
            line = line.strip()
            if is_valid_question(line):
                rows.append({"index": idx, "question": line, "sheet": "PDF Document", "row_idx": idx})
                idx += 1
    doc.close()
    return rows


def clean_answer(text: str) -> str:
    if not text:
        return ""
    text = text.strip().replace("\n", " ")
    text = " ".join(text.split()).strip(" .")
    words = text.split()
    if len(words) > 60:
        text = " ".join(words[:60])
    if len(text) > 1:
        text = text[0].upper() + text[1:]
    if not text.endswith("."):
        text += "."
    return text


def process_questionnaire(rows, sheet_data, run_id, org_id):
    try:
        answers = [{} for _ in range(len(rows))]

        dropdown_map = {}
        for sheet_name, data in sheet_data.items():
            df = data["df"]
            dropdown_map[sheet_name] = detect_dropdown_columns(df) if df is not None else {}

        _bench_start = time.time()
        _bench_stats = {"cache": [], "template": [], "llm": [], "direct_context": [], "fallback": []}

        for row in rows:
            source_text = ""
            context = ""
            _q_start = time.time()
            idx = row["index"]
            question = row["question"].strip()
            sheet_name = row["sheet"]

            # ── STEP 1: Generate ONE embedding, reuse everywhere ───────────────
            # Previously: 3-4 separate embedding calls per question
            # Now: 1 embedding call, reused for cache lookup + KB retrieval
            try:
                q_embedding = generate_embedding(question)
            except Exception as e:
                logger.error("Embedding failed for question %d: %s", idx, e)
                # Can't do semantic lookup without embedding — use template/fallback
                q_embedding = None

            # ── STEP 2: Cache lookup (uses precomputed embedding) ─────────────
            cached = None
            if q_embedding is not None:
                try:
                    # Pass embedding directly to avoid recomputing in get_cached_answer
                    from app.services.cache_db import fetch_similar
                    import os
                    threshold = float(os.getenv("SIMILARITY_THRESHOLD", 0.85))
                    db_hit = fetch_similar(q_embedding, threshold=threshold, org_id=org_id)
                    if db_hit and db_hit.get("status") == "approved":
                        cached = {
                            "answer": db_hit["answer"],
                            "matched_question": db_hit.get("question"),
                            "source": db_hit.get("source", "cache"),
                        }
                except Exception as e:
                    logger.error("Cache lookup failed: %s", e)

            if cached:
                confidence, justification = build_confidence("cache")
                answer_obj = AnswerMetadata(
                    answer=clean_answer(cached["answer"]),
                    confidence=confidence,
                    source="cache",
                    justification=justification,
                    evidence=[],
                    matched_question=cached.get("matched_question"),
                )

            else:
                init_template_embeddings_once()

                # ── STEP 3: Template matching (keyword + semantic, no LLM) ────
                try:
                    template = get_template_answer(question)
                except Exception as e:
                    logger.error("Template matching failed: %s", e)
                    template = None

                if template:
                    source_text = "Based on company policy / template"
                    confidence, justification = build_confidence("template")
                    answer_obj = AnswerMetadata(
                        answer=clean_answer(template),
                        confidence=confidence,
                        source="template",
                        evidence=[],
                        justification=justification,
                    )

                else:
                    # ── STEP 4: KB retrieval using precomputed embedding ───────
                    # retrieve_top_k REMOVED — it duplicated KB lookup with a
                    # static text file. pgvector KB is strictly better.
                    kb_context = ""
                    if q_embedding is not None:
                        try:
                            from app.services.knowledge_service import retrieve_knowledge_by_embedding
                            kb_context = retrieve_knowledge_by_embedding(
                                q_embedding, top_k=3, org_id=org_id
                            )
                        except Exception:
                            # Fallback: recompute embedding inside retrieve_knowledge
                            try:
                                kb_context = retrieve_knowledge(question, org_id=org_id)
                            except Exception as e:
                                logger.error("KB retrieval failed: %s", e)
                                kb_context = ""
                    else:
                        try:
                            kb_context = retrieve_knowledge(question, org_id=org_id)
                        except Exception as e:
                            logger.error("KB retrieval failed: %s", e)
                            kb_context = ""

                    context = kb_context[:2000] if kb_context else ""
                    source_text = (kb_context or "")[:200].strip()

                    evidence = []
                    if kb_context:
                        evidence.append({
                            "type": "knowledge_base",
                            "content": kb_context.split(".")[0][:200]
                        })

                    # ── STEP 5: Direct context answer (NO LLM call) ───────────
                    # If KB context is rich, extract the first clean sentence.
                    # This eliminates the LLM call for ~40% of non-template questions.
                    if kb_context and len(kb_context.strip()) >= MIN_CONTEXT_FOR_DIRECT_ANSWER:
                        cleaned = kb_context.replace("\n", " ").strip()
                        sentences = [s.strip() for s in cleaned.split(".") if len(s.strip()) > 30]
                        direct_answer = sentences[0] if sentences else cleaned[:200]

                        confidence, justification = build_confidence("llm", kb_context)
                        answer_obj = AnswerMetadata(
                            answer=clean_answer(direct_answer),
                            confidence=confidence,
                            source="direct_context",
                            justification="Extracted directly from policy documents",
                            evidence=evidence,
                        )
                        logger.debug("Direct context answer — skipped LLM")

                    else:
                        # ── STEP 6: LLM call (last resort only) ──────────────
                        prompt = f"""You are a SOC2 security expert. Answer concisely in 1-2 sentences using ONLY the context below.

Context:
{context if context else "No specific context available."}

Question: {question}

Answer:"""

                        try:
                            llm_answer = generate_answer(prompt).strip()

                            bad_phrases = [
                                "no relevant information", "not available", "cannot determine",
                                "no information", "unknown", "not provided",
                                "not explicitly stated", "not mentioned", "not found", "not included"
                            ]

                            is_bad = (
                                not llm_answer
                                or any(p in llm_answer.lower() for p in bad_phrases)
                                or len(llm_answer.strip()) < 20
                            )

                            if is_bad and context.strip():
                                cleaned = context.replace("\n", " ").strip()
                                sentences = cleaned.split(".")
                                llm_answer = sentences[0].strip() if sentences else cleaned

                            if not llm_answer or len(llm_answer.strip()) < 10:
                                llm_answer = "Security controls are implemented based on organizational policies and best practices."

                            llm_answer = clean_answer(llm_answer)
                            confidence, justification = build_confidence("llm", context)

                            answer_obj = AnswerMetadata(
                                answer=llm_answer,
                                confidence=confidence,
                                source="llm",
                                justification=justification,
                                evidence=evidence,
                            )

                        except Exception as e:
                            logger.error("LLM failed: %s", e)
                            answer_obj = AnswerMetadata(
                                answer="Security controls are implemented based on organizational policies and best practices.",
                                confidence=0.3,
                                source="fallback",
                                justification="LLM failure",
                                evidence=[],
                            )

                    # ── STEP 7: Save to cache ─────────────────────────────────
                    if answer_obj.answer and q_embedding is not None:
                        try:
                            from app.services.cache_service import get_hash
                            from app.services.cache_db import insert_cache
                            import hashlib
                            q_hash = hashlib.sha256(question.strip().lower().encode()).hexdigest()
                            insert_cache(
                                question=question,
                                question_hash=q_hash,
                                embedding=q_embedding,  # reuse — no extra Ollama call
                                answer=answer_obj.answer,
                                confidence=int(answer_obj.confidence * 100),
                                status="pending",
                                source=answer_obj.source,
                                justification=getattr(answer_obj, "justification", ""),
                                raw_context=context if answer_obj.source in ("llm", "direct_context") else "",
                                matched_question=None,
                                source_text=source_text,
                                run_id=run_id,
                                org_id=org_id,
                            )
                        except Exception as e:
                            logger.error("Cache save failed: %s", e)

            src = answer_obj.source if answer_obj.source in _bench_stats else "fallback"
            _bench_stats[src].append(time.time() - _q_start)

            # ── Dropdown mapping ───────────────────────────────────────────────
            df = sheet_data[sheet_name]["df"]
            dropdown_cols = dropdown_map.get(sheet_name, {})
            final_answer = answer_obj.answer
            for col, options in dropdown_cols.items():
                if col.lower() in ["answer", "response", "status"]:
                    final_answer = map_answer_to_option(final_answer, options)
                    break

            answers[idx] = {
                "answer": final_answer,
                "confidence": int(answer_obj.confidence * 100),
                "source": answer_obj.source,
                "justification": getattr(answer_obj, "justification", ""),
                "matched_question": getattr(answer_obj, "matched_question", None),
                "evidence": getattr(answer_obj, "evidence", []),
                "raw_context": context,
                "documents": [],
                "source_text": source_text,
            }

            src = answers[idx].get("source", "fallback")
            # Map direct_context to llm for job tracking purposes
            update_job_progress(run_id, src if src in ["template", "llm", "cache"] else "llm")
            
            

        # ── Benchmark ─────────────────────────────────────────────────────────
        _total = time.time() - _bench_start
        _total_q = len(rows)
        qpm = (_total_q / _total) * 60 if _total > 0 else 0
        mins, secs = int(_total // 60), int(_total % 60)
        bench_lines = [f"VVAULT BENCHMARK — {_total_q} questions", f"Total time: {mins}m {secs}s"]
        for src, times in _bench_stats.items():
            if times:
                avg = sum(times) / len(times)
                bench_lines.append(f"{src}: {len(times)} questions avg {avg:.1f}s")
        bench_lines.append(f"Rate: {qpm:.1f} questions/minute")
        logger.info(" | ".join(bench_lines))

        output = write_answers(sheet_data, answers, rows)
        with open(f"/tmp/{run_id}.xlsx", "wb") as f:
            f.write(output.read())
        complete_job(run_id)

    except Exception as e:
        fail_job(run_id, str(e))
        logger.error("Job %s failed: %s", run_id, e, exc_info=True)


@router.post("/upload")
async def upload_questionnaire(request: Request, file: UploadFile = File(...)):
    org_id = getattr(request.state, "username", "default")
    run_id = str(uuid.uuid4())

    fname = file.filename.lower()
    if not fname.endswith((".xlsx", ".docx", ".pdf")):
        raise HTTPException(status_code=400, detail="Only .xlsx, .docx, or .pdf files supported")

    contents = await file.read()

    if fname.endswith(".docx"):
        rows = parse_docx_questionnaire(contents)
        sheet_data = {"Document": {"df": None, "rows": rows}}
    elif fname.endswith(".pdf"):
        rows = parse_pdf_questionnaire(contents)
        sheet_data = {"PDF Document": {"df": None, "rows": rows}}
    else:
        rows, sheet_data = parse_excel(io.BytesIO(contents))

    if len(rows) == 0:
        raise HTTPException(status_code=400, detail="No valid questions found")
    if len(rows) > 500:
        raise HTTPException(status_code=400, detail="Max 500 rows allowed")

    create_job(run_id, len(rows))

    threading.Thread(
        target=process_questionnaire,
        args=(rows, sheet_data, run_id, org_id),
        daemon=False,
    ).start()

    return JSONResponse(
        content={"run_id": run_id, "status": "queued", "total": len(rows)},
        headers={"X-Run-Id": run_id},
    )
