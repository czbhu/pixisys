from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils.encoding import force_str, force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.conf import settings
from decouple import config
import jwt
import json
import logging
from urllib.parse import urlparse
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from invoices.models import SystemUser, Role, CompanyEmailSettings

User = get_user_model()
logger = logging.getLogger(__name__)


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


def _get_password_reset_mail_config(email: str):
    system_user = SystemUser.objects.filter(email__iexact=email, is_active=True).first()
    if not system_user:
        return None, None

    settings_qs = CompanyEmailSettings.objects.filter(company__in=system_user.companies.all())
    preferred = settings_qs.filter(smtp_user__iexact=email).first()
    ces = preferred or settings_qs.first()
    if not ces or not ces.smtp_host or not ces.smtp_user or not ces.smtp_password:
        return None, None

    use_ssl = int(ces.smtp_port or 587) == 465
    use_tls = False if use_ssl else bool(ces.smtp_use_tls)
    connection = get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        host=ces.smtp_host,
        port=int(ces.smtp_port or 587),
        username=ces.smtp_user,
        password=ces.smtp_password,
        use_tls=use_tls,
        use_ssl=use_ssl,
        fail_silently=False,
    )
    from_email = ces.smtp_from or ces.smtp_user
    return connection, from_email


def _resolve_frontend_base_url(request):
    origin = (request.headers.get('Origin') or '').strip()
    if origin:
        return origin.rstrip('/')

    referer = (request.headers.get('Referer') or '').strip()
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}".rstrip('/')

    if getattr(settings, 'FRONTEND_BASE_URL', None):
        return str(settings.FRONTEND_BASE_URL).rstrip('/')

    scheme = 'https' if request.is_secure() else 'http'
    return f"{scheme}://{request.get_host()}".rstrip('/')


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


import logging
logger = logging.getLogger(__name__)


def _extract_login_credentials(request):
    data = request.data if isinstance(request.data, dict) else {}
    nested = data.get('credentials') if isinstance(data, dict) else None
    nested = nested if isinstance(nested, dict) else {}

    identifier = (
        data.get('email')
        or data.get('username')
        or data.get('identifier')
        or data.get('login')
        or nested.get('email')
        or nested.get('username')
        or nested.get('identifier')
        or nested.get('login')
    )
    password = data.get('password') or nested.get('password')

    if not identifier or not password:
        raw_body = request.body.decode('utf-8', errors='ignore').strip()
        if raw_body:
            try:
                body_data = json.loads(raw_body)
                if isinstance(body_data, dict):
                    body_nested = body_data.get('credentials') if isinstance(body_data.get('credentials'), dict) else {}
                    identifier = identifier or (
                        body_data.get('email')
                        or body_data.get('username')
                        or body_data.get('identifier')
                        or body_data.get('login')
                        or body_nested.get('email')
                        or body_nested.get('username')
                        or body_nested.get('identifier')
                        or body_nested.get('login')
                    )
                    password = password or body_data.get('password') or body_nested.get('password')
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

    if isinstance(identifier, str):
        identifier = identifier.strip()
    if isinstance(password, str):
        password = password.strip()

    return identifier, password

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """User login endpoint - accepts email or username, supports both Django User and SystemUser"""
    identifier, password = _extract_login_credentials(request)

    if not identifier or not password:
        request_keys = list(request.data.keys()) if isinstance(request.data, dict) else []
        logger.warning(
            "Login request missing credentials. content_type=%s keys=%s",
            request.content_type,
            request_keys,
        )
        return Response(
            {'error': 'Email/username and password are required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Try SystemUser first
    try:
        system_user = SystemUser.objects.filter(email__iexact=identifier, is_active=True).first()
        if system_user and system_user.check_password(password):
            # Update last login time
            from django.utils import timezone
            system_user.last_login = timezone.now()
            system_user.save(update_fields=['last_login'])
            
            # Get or create corresponding Django user for JWT
            django_user, created = User.objects.get_or_create(
                email=system_user.email,
                defaults={
                    'username': system_user.email,
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
            companies_data = [
                {
                    'id': str(c.id),
                    'name': c.name,
                    'short_name': c.short_name,
                }
                for c in system_user.companies.filter(is_active=True)
            ]
            
            return Response({
                'user': {
                    'id': str(system_user.id),
                    'email': system_user.email,
                    'first_name': system_user.first_name,
                    'last_name': system_user.last_name,
                    'full_name': system_user.full_name,
                    'companies': companies_data,
                    'roles': roles_data,
                    'allowed_menus': allowed_menus,
                    'is_superuser': django_user.is_superuser,
                },
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh)
                },
                'user_type': 'system'
            })
        if system_user and not system_user.check_password(password):
            logger.warning("Login rejected: invalid SystemUser password for %s", identifier)
    except Exception:
        logger.exception("Login SystemUser branch failed for identifier=%s", identifier)
        pass
    
    # Fallback to Django User authentication
    user = None
    try:
        user_obj = User.objects.filter(email__iexact=identifier).first()
        if user_obj:
            user = authenticate(username=user_obj.username, password=password)
    except Exception:
        # Fallback: try as username for backward compatibility
        user = authenticate(username=identifier, password=password)

    if not user:
        user = authenticate(username=identifier, password=password)
    
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
        logger.warning("Login rejected: invalid credentials for %s", identifier)
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
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            raise User.DoesNotExist
        
        # Generate reset token
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        
        # Build reset URL from current request origin (fallback to configured default)
        frontend_base_url = _resolve_frontend_base_url(request)
        reset_url = f"{frontend_base_url}/reset-password/{uid}/{token}"
        
        # Render email templates
        subject = render_to_string('emails/password_reset_subject.txt', {'user': user}).strip()
        text_body = render_to_string('emails/password_reset_body.txt', {
            'user': user,
            'reset_url': reset_url,
            'frontend_url': frontend_base_url,
        })
        
        # Send email
        mail_connection, from_email = _get_password_reset_mail_config(user.email)
        email_message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=from_email or settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
            connection=mail_connection,
        )
        email_message.send()

    except User.DoesNotExist:
        pass  # Don't reveal if email exists
    except Exception:
        logger.exception('Password reset email send failed for %s', email)
    
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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def switch_user_view(request):
    """Switch to another system user. Only available for Django superusers."""
    if not request.user.is_superuser:
        return Response(
            {'error': 'Csak szuperadmin jogosultsággal elérhető.'},
            status=status.HTTP_403_FORBIDDEN
        )

    target_user_id = request.data.get('user_id')
    if not target_user_id:
        return Response({'error': 'user_id szükséges.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        system_user = SystemUser.objects.get(id=target_user_id, is_active=True)
    except (SystemUser.DoesNotExist, Exception):
        return Response({'error': 'A felhasználó nem található.'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create linked Django user for token generation
    django_user, created = User.objects.get_or_create(
        email=system_user.email,
        defaults={
            'username': system_user.email,
            'first_name': system_user.first_name,
            'last_name': system_user.last_name,
            'is_active': True,
        }
    )
    if created:
        django_user.set_unusable_password()
        django_user.save()

    refresh = RefreshToken.for_user(django_user)
    roles_data, allowed_menus = _serialize_roles_for_user(system_user)
    companies_data = [
        {'id': str(c.id), 'name': c.name, 'short_name': c.short_name}
        for c in system_user.companies.filter(is_active=True)
    ]

    return Response({
        'user': {
            'id': str(system_user.id),
            'email': system_user.email,
            'first_name': system_user.first_name,
            'last_name': system_user.last_name,
            'full_name': system_user.full_name,
            'companies': companies_data,
            'roles': roles_data,
            'allowed_menus': allowed_menus,
            'is_superuser': django_user.is_superuser,
        },
        'tokens': {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        },
    })
