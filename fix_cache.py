content = open('app/services/cache_db.py').read()
old = "WHERE 1 - (embedding <=> %s::vector) > %s\n      AND org_id = %s"
new = "WHERE 1 - (embedding <=> %s::vector) > %s\n      AND org_id = %s\n      AND status = 'approved'"
content = content.replace(old, new)
open('app/services/cache_db.py', 'w').write(content)
print('Done')
