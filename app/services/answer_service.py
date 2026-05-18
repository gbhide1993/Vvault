import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://ollama:11434/api/generate"
MODEL = "qwen2:1.5b"


def generate_answer(prompt: str, context: str = "") -> str:
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": 40,
                    "temperature": 0.1,
                    "num_ctx": 1024,
                    "num_threads": 4,
                    "stop": ["\n\n", "Question:", "Context:"]
                }
            },
            timeout=300
        )

        if response.status_code != 200:
            logger.warning("Ollama returned status %s", response.status_code)
            return ""

        data = response.json()
        answer = data.get("response", "").strip()
        logger.debug("qwen2:1.5b answered: %s", answer[:80])
        return answer

    except requests.exceptions.Timeout:
        logger.warning("qwen2:1.5b timed out after 300s")
        return ""

    except Exception as e:
        logger.error("Ollama error: %s", e)
        return ""