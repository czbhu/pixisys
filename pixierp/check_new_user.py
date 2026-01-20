
import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

print("Checking ALL users for whitespace issues...")
for u in User.objects.all():
    email = u.email
    username = u.username
    
    issues = []
    if email != email.strip():
        issues.append(f"EMAIL HAS WHITESPACE: '{email}'")
        # Fix it?
        # u.email = email.strip()
        # u.save()
        # print(f"FIXED email for {u.username}")
    
    if username != username.strip():
        issues.append(f"USERNAME HAS WHITESPACE: '{username}'")
        
    if issues:
        print(f"User {u.id} ({u.username}): {', '.join(issues)}")
    else:
        # print(f"User {u.id} ({u.username}): OK")
        pass

print("Done checking.")
