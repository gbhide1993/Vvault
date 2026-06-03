content = open('app/services/cache_service.py').read()
# Check if already fixed
if 'embedding=None' in content:
    print('Already fixed')
else:
    print('Needs fix')
print(content[:500])
