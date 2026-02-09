from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.encoding import force_str, force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.conf import settings
from decouple import config
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from invoices.models import SystemUser, Role

User = get_user_model()


def _serialize_roles_for_user(system_user: SystemUser):
    roles_qs = system_user.roles.filter(is_active=True)
    roles_data = [
        {
            'id': str(r.id),
            'name': r.name,
            'description': r.description,
            'menu_permissions': r.menu_permissions or [],
        }
        for r in roles_qs
    ]
    allowed_menus = []
    for r in roles_qs:
        allowed_menus.extend(r.menu_permissions or [])
    # deduplicate while preserving order
    seen = set()
    deduped = []
    for key in allowed_menus:
        if key in seen:
            continue
        seen.add(key)
        deduped.append(key)
    return roles_data, deduped


@api_view(['POST'])
@permission_classes([AllowAny])
def sso_login_view(request):
    """SSO login from ERP using JWT token"""
    sso_token = request.data.get('sso_token')
    
    if not sso_token:
        return Response(
            {'error': 'SSO token is required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Get ERP secret key for SSO validation
        erp_secret_key = config('ERP_SECRET_KEY', default=None)
        if not erp_secret_key:
            return Response(
                {'error': 'SSO not configured'}, 
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        # Decode the SSO token using ERP's SECRET_KEY
        decoded = jwt.decode(
            sso_token, 
            erp_secret_key, 
            algorithms=['HS256']
        )
        
        # Verify it's an SSO token
        if not decoded.get('sso'):
            return Response(
                {'error': 'Invalid SSO token'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Extract user data
        email = decoded.get('email')
        username = decoded.get('username')
        first_name = decoded.get('first_name', '')
        last_name = decoded.get('last_name', '')
        
        if not email or not username:
            return Response(
                {'error': 'Invalid token payload'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Get or create user in PixInvoice
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': username,
                'first_name': first_name,
                'last_name': last_name,
                'is_active': True,
            }
        )
        
        # Update user info if it exists
        if not created:
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=['first_name', 'last_name'])
        
        # Generate PixInvoice tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'roles': [],
                'allowed_menus': [],
            },
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            }
        })
        
    except ExpiredSignatureError:
        return Response(
            {'error': 'SSO token has expired'}, 
            status=status.HTTP_401_UNAUTHORIZED
        )
    except InvalidTokenError as e:
        return Response(
            {'error': f'Invalid SSO token: {str(e)}'}, 
            status=status.HTTP_401_UNAUTHORIZED
        )
    except Exception as e:
        return Response(
            {'error': f'SSO authentication failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """User login endpoint - accepts email or username, supports both Django User and SystemUser"""
    email = request.data.get('email')
    if email and isinstance(email, str):
        email = email.strip()
    password = request.data.get('password')
    
    if not email or not password:
        return Response(
            {'error': 'Email and password are required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Try SystemUser first
    try:
        system_user = SystemUser.objects.get(email=email, is_active=True)
        if system_user.check_password(password):
            # Update last login time
            from django.utils import timezone
            system_user.last_login = timezone.now()
            system_user.save(update_fields=['last_login'])
            
            # Get or create corresponding Django user for JWT
            django_user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': email,
                    'first_name': system_user.first_name,
                    'last_name': system_user.last_name,
                    'is_active': True,
                }
            )
            if created:
                # Set unusable password for Django user (only SystemUser password is used)
                django_user.set_unusable_password()
                django_user.save()
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(django_user)
            roles_data, allowed_menus = _serialize_roles_for_user(system_user)
            
            return Response({
                'user': {
                    'id': str(system_user.id),
                    'email': system_user.email,
                    'first_name': system_user.first_name,
                    'last_name': system_user.last_name,
                    'full_name': system_user.full_name,
                    'roles': roles_data,
                    'allowed_menus': allowed_menus,
                },
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh)
                },
                'user_type': 'system'
            })
    except SystemUser.DoesNotExist:
        pass
    
    # Fallback to Django User authentication
    user = None
    try:
        user_obj = User.objects.get(email=email)
        user = authenticate(username=user_obj.username, password=password)
    except User.DoesNotExist:
        # Fallback: try as username for backward compatibility
        user = authenticate(username=email, password=password)
    
    if user:
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'roles': [],
                'allowed_menus': [],
            },
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            },
            'user_type': 'django'
        })
    else:
        return Response(
            {'error': 'Invalid credentials'}, 
            status=status.HTTP_401_UNAUTHORIZED
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request_view(request):
    """Request password reset via email"""
    email = request.data.get('email')
    
    if not email:
        return Response(
            {'error': 'Email is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = User.objects.get(email=email)
        
        # Generate reset token
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Build reset URL
        reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password/{uid}/{token}"
        
        # Render email templates
        subject = render_to_string('emails/password_reset_subject.txt', {'user': user}).strip()
        text_body = render_to_string('emails/password_reset_body.txt', {
            'user': user,
            'reset_url': reset_url,
            'frontend_url': settings.FRONTEND_BASE_URL,
        })
        
        # Send email
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email]
        )
        email_message.send()
        
    except User.DoesNotExist:
        pass  # Don't reveal if email exists
    
    return Response({
        'message': 'Ha a megadott e-mail cím szerepel a rendszerünkben, küldtünk egy jelszó-visszaállító linket.'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm_view(request):
    """Confirm password reset with token"""
    uid = request.data.get('uid')
    token = request.data.get('token')
    new_password1 = request.data.get('new_password1')
    new_password2 = request.data.get('new_password2')
    
    if not all([uid, token, new_password1, new_password2]):
        return Response(
            {'error': 'Minden mező kitöltése kötelező'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if new_password1 != new_password2:
        return Response(
            {'error': 'A két jelszó nem egyezik'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id)
        
        if not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'Érvénytelen vagy lejárt token'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.set_password(new_password1)
        user.save(update_fields=['password'])
        
        return Response({
            'message': 'A jelszó sikeresen megváltozott'
        }, status=status.HTTP_200_OK)
        
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response(
            {'error': 'Érvénytelen link'},
            status=status.HTTP_400_BAD_REQUEST
        )
