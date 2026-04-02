import requests

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

    print("Ollama response status:", response.status_code)


    try:
        data = response.json()
        print("Ollama parsed response:", data)

        return data.get("response", "").strip()
    except Exception as e:
        print("❌ JSON parse error:", str(e))
        return "Error generating answer"