import time, requests
start = time.time()
r = requests.post('http://ollama:11434/api/generate', json={
    'model': 'qwen2:1.5b',
    'prompt': 'Answer in one sentence: Do you use encryption?',
    'stream': False,
    'options': {'num_predict': 50, 'temperature': 0.1, 'num_ctx': 512}
}, timeout=60)
elapsed = time.time() - start
data = r.json()
print('LLM time:', round(elapsed, 2))
print('Response:', data.get('response', '')[:100])
