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
from app.services.cache_service import (
    get_cached_answer, set_cached_answer,
)
from app.services.dropdown_service import detect_dropdown_columns, map_answer_to_option
from app.models.answer_model import AnswerMetadata
from app.services.confidence_service import build_confidence
from app.services.knowledge_service import retrieve_knowledge, retrieve_knowledge_with_embedding, retrieve_knowledge_with_sources, detect_conflicts
from app.services.retrieval_service import retrieve_top_k_with_embedding
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

        init_template_embeddings_once()

        for row in rows:
            source_text = ""
            context = ""
            kb_results = []
            conflict_result = {"conflict": False, "conflicting_pairs": []}
            _q_start = time.time()
            idx = row["index"]
            question = row["question"].strip()
            sheet_name = row["sheet"]

            # PATH A — Template (0 Ollama calls)
            try:
                template = get_template_answer(question)
            except Exception as e:
                logger.error("Template matching failed for question %d: %s", idx, e)
                template = None

            if template:
                confidence, justification = build_confidence("template")
                answer_obj = AnswerMetadata(
                    answer=clean_answer(template),
                    confidence=confidence,
                    source="template",
                    evidence=[],
                    justification=justification,
                )
                print(f"[{idx}] TEMPLATE hit")

            else:
                # PATH B — Cache (1 Ollama call total, already paid)
                try:
                    question_embedding = generate_embedding(question)
                except Exception as e:
                    logger.error("Embedding failed for question %d: %s", idx, e)
                    question_embedding = None

                cached = None
                if question_embedding is not None:
                    try:
                        cached = get_cached_answer(
                            question, org_id=org_id, embedding=question_embedding
                        )
                    except Exception as e:
                        logger.error("Cache lookup failed for question %d: %s", idx, e)

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
                    print(f"[{idx}] CACHE hit")

                else:
                    # PATH C — LLM (1 Ollama call, reuses question_embedding)
                    kb_results = []
                    kb_context = ""
                    if question_embedding is not None:
                        try:
                            kb_results = retrieve_knowledge_with_sources(
                                question, top_k=3, org_id=org_id
                            )
                            kb_context = "\n\n".join(r["content"] for r in kb_results)
                        except Exception as e:
                            logger.error("KB retrieval failed for question %d: %s", idx, e)
                    else:
                        try:
                            kb_context = retrieve_knowledge(question, org_id=org_id)
                        except Exception as e:
                            logger.error("KB retrieval failed for question %d: %s", idx, e)

                    retrieve_top_k_with_embedding(question_embedding) if question_embedding is not None else ""

                    context = kb_context[:2000] if kb_context else ""
                    source_text = (kb_context or "")[:200].strip()

                    evidence = [
                        {"source": r["source"], "chunk": r["content"][:200]}
                        for r in kb_results
                    ]

                    # Conflict detection
                    conflict_result = {"conflict": False, "conflicting_pairs": []}
                    if len(kb_results) >= 2:
                        try:
                            conflict_result = detect_conflicts(kb_results)
                        except Exception as e:
                            logger.warning("Conflict detection failed (non-fatal): %s", e)

                    conflict_note = ""
                    if conflict_result["conflict"]:
                        conflict_note = "NOTE: Conflicting information found in source documents. Surface the conflict in your answer rather than picking one side.\n\n"

                    prompt = f"""You are the Information Security Officer at a technology company responding to a SOC2 vendor questionnaire.

STRICT RULES:
- Always answer in first person as the company ("We use...", "Our organization...")
- Never say "As an AI" or "I don't have access" — you ARE the security officer
- Answer in 2 sentences maximum
- Be direct and affirmative — assume controls exist unless context says otherwise
- Use the provided context to give specific answers

{conflict_note}Context:
{context}

Question:
{question}

Answer:"""

                    try:
                        llm_answer = generate_answer(prompt).strip()

                        bad_phrases = [
                            "no relevant information", "not available", "cannot determine",
                            "no information", "unknown", "not provided",
                            "not explicitly stated", "not mentioned", "not found", "not included",
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

                        # Evidence Gap Detection
                        try:
                            kb_context_len = len(kb_context.strip()) if kb_context else 0
                            if answer_obj.confidence < 0.60 and kb_context_len < 50:
                                print(f"[evidence_gap] Flagged [{idx}]: "
                                      f"confidence={answer_obj.confidence:.2f}, "
                                      f"kb_context_len={kb_context_len}")
                                answer_obj.answer = (
                                    "[EVIDENCE GAP] No relevant policy document found "
                                    "in knowledge base. Upload the relevant policy "
                                    "document and re-run to generate this answer."
                                )
                                answer_obj.confidence = 0.0
                                answer_obj.source = "evidence_gap"
                                answer_obj.justification = (
                                    "No supporting document found in knowledge base. "
                                    "Upload relevant policy or evidence document and re-run."
                                )
                        except Exception as e:
                            print(f"[evidence_gap] Check failed (non-fatal): {e}")

                    except Exception as e:
                        logger.error("LLM failed for question %d: %s", idx, e)
                        answer_obj = AnswerMetadata(
                            answer="Security controls are implemented based on organizational policies and best practices.",
                            confidence=0.3,
                            source="fallback",
                            justification="LLM failure",
                            evidence=[],
                        )

                    if answer_obj.answer and question_embedding is not None:
                        try:
                            set_cached_answer(
                                question,
                                {
                                    "answer": answer_obj.answer,
                                    "source": answer_obj.source,
                                    "confidence": int(answer_obj.confidence * 100),
                                    "justification": getattr(answer_obj, "justification", ""),
                                    "raw_context": context,
                                    "source_text": source_text,
                                    "run_id": run_id,
                                    "org_id": org_id,
                                    "documents": [r["source"] for r in kb_results],
                                    "conflict_detected": conflict_result["conflict"],
                                    "conflicting_pairs": conflict_result["conflicting_pairs"],
                                },
                                org_id=org_id,
                                embedding=question_embedding,
                            )
                        except Exception as e:
                            logger.error("Cache save failed for question %d: %s", idx, e)

                    print(f"[{idx}] LLM answer generated")

            src = answer_obj.source if answer_obj.source in _bench_stats else "fallback"
            _bench_stats[src].append(time.time() - _q_start)

            # Dropdown mapping — runs for every path
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
                "documents": [r["source"] for r in kb_results] if kb_results else [],
                "source_text": source_text,
                "conflict_detected": conflict_result["conflict"],
                "conflicting_pairs": conflict_result["conflicting_pairs"],
            }

            src = answers[idx].get("source", "fallback")
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
