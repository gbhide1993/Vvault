import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://ollama:11434/api/generate"
MODEL = "phi3:mini"


def generate_answer(prompt: str, context: str = "") -> str:
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": 120,
                    "temperature": 0.1,
                    "num_ctx": 2048,
                    "stop": ["\n\n", "Question:", "Context:"]
                }
            },
            timeout=180
        )

        if response.status_code != 200:
            logger.warning("Ollama returned status %s", response.status_code)
            return ""

        data = response.json()
        answer = data.get("response", "").strip()
        logger.debug("phi3:mini answered: %s", answer[:80])
        return answer

    except requests.exceptions.Timeout:
        logger.warning("phi3:mini timed out after 180s")
        return ""

    except Exception as e:
        logger.error("Ollama error: %s", e)
        return ""