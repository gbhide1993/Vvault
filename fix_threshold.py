content = open('app/services/cache_service.py').read()
content = content.replace('THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", 0.85))', 'THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", 0.75))')
open('app/services/cache_service.py', 'w').write(content)
print('Done')
