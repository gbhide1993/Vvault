import logging
from app.services.embedding_service import generate_embedding
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------
# Load documents from text file
# ----------------------------------
def load_documents():
    try:
        with open("app/data/knowledge_base.txt", "r", encoding="utf-8") as f:
            text = f.read()
        # simple chunking by paragraph
        return [doc.strip() for doc in text.split("\n\n") if doc.strip()]
    except Exception as e:
        logger.error("Failed to load knowledge base: %s", e)
        return []


documents = load_documents()

# ----------------------------------
# Global cache (lazy loaded)
# ----------------------------------
doc_embeddings = None


# ----------------------------------
# Cosine similarity
# ----------------------------------
def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


# ----------------------------------
# Main retrieval function
# ----------------------------------
def retrieve_top_k(query, k=3):
    global doc_embeddings

    # ----------------------------------
    # 1. Lazy embedding generation
    # ----------------------------------
    if doc_embeddings is None:
        logger.debug("Generating document embeddings (one-time)...")

        doc_embeddings = []
        for doc in documents:
            try:
                emb = generate_embedding(doc)
                doc_embeddings.append(emb)
            except Exception as e:
                logger.error("Embedding failed for doc: %s", e)
                doc_embeddings.append(None)

    # ----------------------------------
    # 2. Query embedding
    # ----------------------------------
    try:
        query_embedding = generate_embedding(query)
    except Exception as e:
        logger.error("Query embedding failed: %s", e)
        return ""

    # ----------------------------------
    # 3. Similarity scoring
    # ----------------------------------
    scores = []

    for i, emb in enumerate(doc_embeddings):
        if emb is None:
            continue

        try:
            score = cosine_similarity(query_embedding, emb)
            scores.append((score, documents[i]))
        except Exception:
            continue

    # ----------------------------------
    # 4. Top-K selection
    # ----------------------------------
    top_k = sorted(scores, key=lambda x: x[0], reverse=True)[:k]

    # ----------------------------------
    # 5. Return combined context
    # ----------------------------------
    context = "\n".join([doc for _, doc in top_k])

    return context