import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

email = 'laura.palczert@magyarmedia.com'
password = 'F(BVG6k#o|(7G{9)'

try:
    user = User.objects.get(email__iexact=email)
    print(f"Found user: {user.username}")
    user.set_password(password)
    user.save()
    print(f"Successfully updated password for {user.username} to '{password}'")
    
    # Verify immediately
    if user.check_password(password):
        print("Verification: check_password returns True")
    else:
        print("Verification: check_password returns False (Something is wrong)")
        
except User.DoesNotExist:
    print(f"User with {email} not found")
except Exception as e:
    print(f"Error: {e}")
