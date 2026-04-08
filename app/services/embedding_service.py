import logging
import requests
import json
import time

logger = logging.getLogger(__name__)

def generate_embedding(text):
    url = "http://ollama:11434/api/embeddings"

    payload = {
        "model": "nomic-embed-text",
        "prompt": text
    }

    for attempt in range(5):
        try:
            response = requests.post(url, json=payload, timeout=10)

            logger.debug("Ollama response status: %s", response.status_code)
            logger.debug("Ollama raw response: %s", response.text[:200])

            if response.status_code != 200:
                raise Exception("Bad response")

            # Try direct JSON first
            try:
                data = response.json()
                if "embedding" in data:
                    return data["embedding"]
            except:
                pass

            # Fallback: handle multi-line JSON
            lines = response.text.strip().split("\n")

            for line in reversed(lines):
                try:
                    data = json.loads(line)
                    if "embedding" in data:
                        return data["embedding"]
                except:
                    continue

        except Exception as e:
            logger.debug("Ollama not ready or bad response (attempt %d): %s", attempt + 1, e)
            time.sleep(2)

    raise ValueError("Failed to parse embedding response")
