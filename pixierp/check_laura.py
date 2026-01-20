import os
import django
import sys

sys.path.append('/home/ceze/pixisys/pixierp')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

email = 'laura.palczert@magyarmedia.com'

try:
    # Try case-insensitive lookup
    users = User.objects.filter(email__iexact=email)
    print(f"Found {users.count()} users with email (case-insensitive) '{email}':")
    for user in users:
        print(f"  - Username: '{user.username}'")
        print(f"  - Email: '{user.email}'")
        print(f"  - Is active: {user.is_active}")
        print(f"  - Last login: {user.last_login}")
        # Check password hash (not verifying the password itself, just if it has one)
        print(f"  - Password hash starts with: {user.password[:20] if user.password else 'None'}")

    if users.count() == 0:
        print(f"No user found with email '{email}'")

        # List all users to see if there is something similar
        print("\nListing all users:")
        for user in User.objects.all():
            print(f"  - {user.username} ({user.email})")

except Exception as e:
    print(f"Error: {e}")
