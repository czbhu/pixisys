import os
import django
import sys
from django.contrib.auth import get_user_model

# Add the project root to sys.path
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

User = get_user_model()

def find_user():
    try:
        u = User.objects.get(username__icontains='Balazs')
        print(f"Found User: {u.username} ID={u.id}")
    except Exception:
        # try filtering
        users = User.objects.filter(last_name__icontains='Czentye')
        for u in users:
            print(f"Found User: {u.username} ID={u.id}")

if __name__ == '__main__':
    find_user()
