import logging

logger = logging.getLogger(__name__)

doc_embeddings = None  # populated by warm_up_embeddings()
_docs = []             # source documents parallel to doc_embeddings


def retrieve_top_k(query, k=3):
    return ""


def warm_up_embeddings():
    global doc_embeddings, _docs
    if doc_embeddings is not None:
        return
    print(f"[retrieval_service] Warming up embeddings for {len(_docs)} doc(s)")
    from app.services.embedding_service import generate_embedding
    doc_embeddings = [generate_embedding(d) for d in _docs]
    print(f"[retrieval_service] Embedding warm-up complete ({len(doc_embeddings)} vectors)")


def retrieve_top_k_with_embedding(query_embedding, k=3):
    global doc_embeddings
    if doc_embeddings is None:
        warm_up_embeddings()
    return ""
