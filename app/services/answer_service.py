import logging
import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://ollama:11434/api/generate"
MODEL = "phi3:mini"

def generate_answer(prompt: str, context: str = "") -> str:

    response = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": 200,
                "temperature": 0.2
            }
        },
        timeout=120
    )

    logger.debug("Ollama response status: %s", response.status_code)

    try:
        data = response.json()
        logger.debug("Ollama parsed response: %s", data)
        return data.get("response", "").strip()
    except Exception as e:
        logger.error("JSON parse error: %s", str(e))
        return "Error generating answer"
