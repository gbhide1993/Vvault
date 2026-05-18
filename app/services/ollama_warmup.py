import time
import requests
import logging

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://ollama:11434"
EMBED_MODEL = "nomic-embed-text"
LLM_MODEL = "qwen2:1.5b"


def _wait_for_ollama(timeout=120):
    start = time.time()
    attempt = 0
    while time.time() - start < timeout:
        attempt += 1
        try:
            r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
            if r.status_code == 200:
                print(f"[ollama_warmup] Ollama ready after {attempt} attempt(s)")
                return True
        except Exception:
            pass
        time.sleep(5)
    print(f"[ollama_warmup] Ollama not ready after {attempt} attempt(s) ({timeout}s timeout)")
    return False


def _load_model_into_ram(model, timeout=300):
    start = time.time()
    attempt = 0
    while time.time() - start < timeout:
        attempt += 1
        print(f"[ollama_warmup] Loading {model} — attempt {attempt} ({int(time.time() - start)}s elapsed)")
        try:
            if model == EMBED_MODEL:
                r = requests.post(
                    f"{OLLAMA_BASE_URL}/api/embeddings",
                    json={"model": model, "prompt": "warmup"},
                    timeout=120,
                )
            else:
                r = requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={"model": model, "prompt": "warmup", "stream": False, "options": {"num_predict": 1}},
                    timeout=120,
                )
            if r.status_code == 200:
                print(f"[ollama_warmup] {model} loaded into RAM after {attempt} attempt(s)")
                return True
        except Exception as e:
            logger.debug("Model load attempt %d for %s failed: %s", attempt, model, e)
        time.sleep(5)
    print(f"[ollama_warmup] Failed to load {model} into RAM after {attempt} attempt(s)")
    return False


def warm_up_ollama():
    t0 = time.time()
    print("[ollama_warmup] Starting Ollama warm-up...")

    if not _wait_for_ollama(timeout=120):
        print("[ollama_warmup] WARNING: Ollama did not become ready")
        return False

    embed_ok = _load_model_into_ram(EMBED_MODEL, timeout=300)
    llm_ok = _load_model_into_ram(LLM_MODEL, timeout=300)

    elapsed = time.time() - t0
    print(f"[ollama_warmup] Warm-up complete in {elapsed:.1f}s — embed={embed_ok} llm={llm_ok}")
    return embed_ok and llm_ok


def ensure_ollama_ready(timeout=30):
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=timeout)
        return r.status_code == 200
    except Exception:
        return False
