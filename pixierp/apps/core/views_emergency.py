"""Emergency login view for token-based passwordless authentication"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from apps.core.models_emergency import EmergencyAccessToken


User = get_user_model()


def get_client_ip(request):
    """Get client IP address from request"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


@api_view(['POST'])
@permission_classes([AllowAny])
def emergency_login_view(request):
    """
    Emergency login endpoint - jelszó nélküli bejelentkezés időkorlátozott tokennel
    
    POST /api/v1/auth/emergency-login/
    Body: {"token": "emergency_token_string"}
    """
    token_string = request.data.get('token')
    
    if not token_string:
        return Response(
            {'error': 'Token szükséges'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Token keresése
        token = EmergencyAccessToken.objects.get(token=token_string)
        
        # Token érvényességének ellenőrzése
        if not token.is_valid():
            return Response(
                {'error': 'Token lejárt vagy már felhasználták'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Admin user keresése
        user = None
        # 1. Próbáljuk a "szabványos" admin@pixisys.eu címet
        user = User.objects.filter(email='admin@pixisys.eu', is_active=True).first()
        if not user:
            user = User.objects.filter(username='admin@pixisys.eu', is_active=True).first()
        
        # 2. Ha nincs ilyen, keressünk bármilyen superusert
        if not user:
            user = User.objects.filter(is_superuser=True, is_active=True).first()
            
        if not user:
             return Response(
                {'error': 'Admin felhasználó nem található a rendszerben'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Token megjelölése használtként
        client_ip = get_client_ip(request)
        token.mark_as_used(ip_address=client_ip)
        
        # JWT token generálása
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'success': True,
            'message': 'Emergency login sikeres',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_active': user.is_active,
                'date_joined': user.date_joined
            },
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            }
        })
        
    except EmergencyAccessToken.DoesNotExist:
        return Response(
            {'error': 'Érvénytelen token'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    except Exception as e:
        return Response(
            {'error': f'Bejelentkezési hiba: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
