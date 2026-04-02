from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
import io
import pandas as pd
import uuid

from app.utils.rag_excel_parser import parse_excel
from app.utils.excel_writer import write_answers

from app.services.retrieval_service import retrieve_top_k
from app.services.answer_service import generate_answer

from app.services.template_service import get_template_answer
from app.services.cache_service import get_cached_answer, set_cached_answer

from app.services.dropdown_service import detect_dropdown_columns, map_answer_to_option
from app.services.template_service import init_template_embeddings_once

from app.models.answer_model import AnswerMetadata
from app.services.confidence_service import build_confidence
from app.services.knowledge_service import retrieve_knowledge

router = APIRouter()


def clean_answer(text: str) -> str:
    if not text:
        return ""

    text = text.strip()
    text = text.replace("\n", " ")
    text = " ".join(text.split())
    text = text.strip(" .")

    words = text.split()
    if len(words) > 25:
        text = " ".join(words[:25])

    if len(text) > 1:
        text = text[0].upper() + text[1:]

    if not text.endswith("."):
        text += "."

    return text


@router.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    run_id = str(uuid.uuid4())

    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")

    contents = await file.read()
    excel_file = io.BytesIO(contents)

    rows, sheet_data = parse_excel(excel_file)

    if len(rows) == 0:
        raise HTTPException(status_code=400, detail="No valid questions found")

    if len(rows) > 500:
        raise HTTPException(status_code=400, detail="Max 500 rows allowed")

    answers = [{} for _ in range(len(rows))]

    dropdown_map = {}
    for sheet_name, data in sheet_data.items():
        df = data["df"]
        dropdown_map[sheet_name] = detect_dropdown_columns(df)

    print("Dropdown map:", dropdown_map)

    for row in rows:
        source_text = ""
        idx = row["index"]
        question = row["question"]
        sheet_name = row["sheet"]

        question = question.strip()

        # ---------------- CACHE ----------------
        cached = get_cached_answer(question)

        if cached:
            (cached.get("answer") if isinstance(cached, dict) else str(cached))[:200]

            confidence, justification = build_confidence("cache")

            answer_obj = AnswerMetadata(
                answer=clean_answer(cached["answer"] if isinstance(cached, dict) else cached),
                confidence=confidence,
                source="cache",
                justification=justification,
                evidence=[],   # Cache doesn't have evidence
                matched_question=cached.get("matched_question") if isinstance(cached, dict) else None,
            )

            set_cached_answer(
                question,
                {
                    "answer": answer_obj.answer,
                    "source": cached.get("source", "cache") if isinstance(cached, dict) else "cache",
                    "confidence": int(answer_obj.confidence * 100),
                    "source_text": source_text,
                    "run_id": run_id,
                    
                },
            )

        else:
            init_template_embeddings_once()

            # ---------------- TEMPLATE ----------------
            template = get_template_answer(question)

            if template:
                source_text = "Based on company policy / template"

                confidence, justification = build_confidence("template")

                answer_obj = AnswerMetadata(
                    answer=clean_answer(template),
                    confidence=confidence,
                    source="template",
                    evidence=[],   # Template doesn't have evidence
                    justification=justification,
                )

            else:
                # ---------------- LLM ----------------
                kb_context = retrieve_knowledge(question)
                rag_context = retrieve_top_k(question)

                # 👇 NEW: Evidence collection
                evidence = []

                if kb_context:
                    evidence.append({
                        "type": "knowledge_base",
                        "content": kb_context.split(".")[0][:200]
                    })

                if rag_context:
                    evidence.append({
                        "type": "rag",
                        "content": rag_context.split(".")[0][:200]
                    })

                context = f"{kb_context}\n\n{rag_context}"

                context = context[:2000]

                source_text = (kb_context or "")[:100] + " " + (rag_context or "")[:100]
                source_text = source_text.strip()[:200]

                prompt = f"""
You are a SOC2 security expert.

STRICT INSTRUCTIONS:
- You MUST answer using the provided context
- If ANY relevant information exists → DO NOT say "No relevant information"
- Extract and rephrase the closest answer from context
- Even partial info → convert into a confident answer
- NEVER return "No relevant information" unless context is completely empty

Context:
{context}

Question:
{question}

Answer:
"""

                try:
                    llm_answer = generate_answer(prompt).strip()

                    bad_phrases = [
                        "no relevant information",
                        "not available",
                        "cannot determine",
                        "no information",
                        "unknown",
                        "not provided",
                        "not explicitly stated",
                        "not mentioned",
                        "not found",
                        "not included"
                    ]

                    is_bad = (
                        not llm_answer
                        or any(p in llm_answer.lower() for p in bad_phrases)
                        or len(llm_answer.strip()) < 20
                    )
                    
                    # 🔥 CORE FIX: ALWAYS USE CONTEXT IF AVAILABLE
                    if context.strip():
                        if is_bad:
                            print("⚠️ Using context instead of weak LLM output")

                            cleaned = context.replace("\n", " ").strip()
                            sentences = cleaned.split(".")
                            base = sentences[0] if sentences else cleaned

                            llm_answer = base.strip()

                        else:
                            print("✅ Good LLM answer")

                    else:
                        # No context at all → fallback
                        llm_answer = "Security controls are implemented based on organizational policies and best practices."

                    llm_answer = clean_answer(llm_answer)
                    print("LLM Answer Debug:", llm_answer)
                    confidence, justification = build_confidence("llm", context)

                    answer_obj = AnswerMetadata(
                        answer=llm_answer,
                        confidence=confidence,
                        source="llm",
                        justification=justification,
                        evidence=evidence  
                    )

                except Exception:
                    answer_obj = AnswerMetadata(
                        answer="Security controls are implemented based on organizational policies and best practices.",
                        confidence=0.3,
                        source="fallback",
                        justification="LLM failure",
                        evidence=[]
                    )

            # ---------------- SAVE ----------------
            if answer_obj.answer:
                set_cached_answer(
                    question,
                    {
                        "answer": answer_obj.answer,
                        "source": answer_obj.source,
                        "confidence": int(answer_obj.confidence * 100),
                        "source_text": source_text,
                        "run_id": run_id,
                        "justification": getattr(answer_obj, "justification", ""),
                        "raw_context": locals().get("context", ""),
                        "matched_question": getattr(answer_obj, "matched_question", None),
                    },
                )

        # ---------------- DROPDOWN ----------------
        df = sheet_data[sheet_name]["df"]
        dropdown_cols = dropdown_map.get(sheet_name, {})

        final_answer = answer_obj.answer

        for col, options in dropdown_cols.items():
            if col.lower() in ["answer", "response", "status"]:
                final_answer = map_answer_to_option(final_answer, options)
                break

                
        print("FINAL ANSWER DEBUG:", final_answer)
        answers[idx] = {
            "answer": final_answer,
            "confidence": int(answer_obj.confidence * 100),
            "source": answer_obj.source,

            # 🔥 CLEAN UX
            "justification": getattr(answer_obj, "justification", ""),
            "matched_question": getattr(answer_obj, "matched_question", None),

            # 🔥 EVIDENCE (SAFE FALLBACKS)
            "evidence": getattr(answer_obj, "evidence", ""),
            "raw_context": locals().get("context", ""),

            # 🔥 TRACEABILITY (for Phase 2 ready)
            "documents": locals().get("kb_sources", []),

            # 🔥 KEEP OLD (don’t break anything)
            "source_text": source_text,
        }

    output = write_answers(sheet_data, answers, rows)

    response = StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    response.headers["X-Run-Id"] = run_id

    return response