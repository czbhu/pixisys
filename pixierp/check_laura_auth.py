import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import authenticate, get_user_model
User = get_user_model()

email = 'laura.palczert@magyarmedia.com'
password = 'F(BVG6k#o|(7G{9)'

try:
    print(f"Attempting to authenticate user {email} with password '{password}'")
    user_obj = User.objects.filter(email__iexact=email).first()
    if user_obj:
        print(f"Found user object: {user_obj.username}")
        user = authenticate(username=user_obj.username, password=password)
        if user:
            print("Authentication SUCCESSFUL!")
        else:
            print("Authentication FAILED.")
            # Check if stripped password works
            password_stripped = password.strip()
            print(f"Attempting with stripped password: '{password_stripped}'")
            user_stripped = authenticate(username=user_obj.username, password=password_stripped)
            if user_stripped:
                print("Authentication SUCCESSFUL with stripped password!")
            else:
                print("Authentication FAILED with stripped password.")
                
                # Check directly with check_password just to be sure
                print(f"Direct check_password result: {user_obj.check_password(password)}")
    else:
        print("User object not found by email.")

except Exception as e:
    print(f"Error: {e}")
