import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://ollama:11434/api/generate"

# llama3.2:1b — 5-8s per question on CPU vs 30-60s for phi3:mini
# phi3:mini kept as fallback if llama3.2:1b fails
PRIMARY_MODEL = "phi3:mini"
FALLBACK_MODEL = "qwen2.5:0.5b"


def generate_answer(prompt: str, context: str = "") -> str:

    for model in [PRIMARY_MODEL, FALLBACK_MODEL]:
        try:
            response = requests.post(
                OLLAMA_URL,
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "num_predict": 120,   # shorter = faster, still enough for SOC2 answers
                        "temperature": 0.1,   # lower = more deterministic, less wandering
                        "num_ctx": 2048,      # sufficient context window
                        "stop": ["\n\n", "Question:", "Context:"]  # stop early if model rambles
                    }
                },
                timeout=120  # phi3:mini ~18s normally, allow extra for warmup competition
            )

            logger.debug("Ollama [%s] status: %s", model, response.status_code)

            if response.status_code != 200:
                logger.warning("Ollama [%s] bad status %s — trying fallback", model, response.status_code)
                continue

            data = response.json()
            answer = data.get("response", "").strip()

            if answer:
                logger.debug("Ollama [%s] answered: %s", model, answer[:80])
                return answer

            logger.warning("Ollama [%s] returned empty response", model)

        except requests.exceptions.Timeout:
            logger.warning("Ollama [%s] timed out after 45s — trying fallback", model)
            continue

        except requests.exceptions.ConnectionError as e:
            logger.error("Ollama connection error: %s", e)
            continue

        except Exception as e:
            logger.error("Ollama [%s] unexpected error: %s", model, e)
            continue

    # Both models failed — return empty so rag.py uses context fallback
    logger.error("All models failed — returning empty for context fallback")
    return ""