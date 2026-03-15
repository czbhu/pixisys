from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, action, authentication_classes
import logging

logger = logging.getLogger(__name__)

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from django.contrib.auth import authenticate, get_user_model, login as django_login
from datetime import timedelta
from django.contrib.auth.hashers import make_password
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils import timezone
from django.utils.translation import gettext as _
from django.utils.encoding import force_bytes
from django.core.management import call_command
from django.db import transaction
from django.db.models import Q
from django.db.models import Avg, Count, F
from django.http import HttpResponse
from .serializers import (
    UserSerializer,
    CompanySerializer,
    BankAccountSerializer,
    EmailServerConfigSerializer,
    HestiaConfigSerializer,
    EmailTemplateSerializer,
    SignatureTemplateSerializer,
    PixinvoiceConfigSerializer,
    BackupConfigurationSerializer,
    BackupFileSerializer,
    UserPreferenceSerializer,
    RoleSerializer,
    PermissionSerializer,
    UserRoleSerializer,
    ActivityLogSerializer,
    TicketTopicSerializer,
    TicketTypeSerializer,
    TicketSerializer,
    TicketMessageSerializer,
    PublicSiteConfigSerializer,
    ClientPortalUserSerializer,
    SiteFeatureSerializer,
    SalesSiteSerializer,
)
from rest_framework import viewsets
from .models import (
    Company, BankAccount, EmailServerConfig, HestiaConfig, EmailTemplate, 
    SignatureTemplate, PixinvoiceConfig, BackupConfiguration, 
    BackupFile, UserPreference, Role, Permission, UserRole, ActivityLog,
    TicketTopic, TicketType, Ticket, TicketMessage, TicketAttachment, TicketStatusLog,
    PublicSiteConfig, ClientPortalUser, ClientPortalSession, SiteFeature, SalesSite
)
from apps.hr.models import Employee
import traceback
import requests
import json
import tempfile
from io import StringIO
import subprocess
import shlex
import os


User = get_user_model()


class CompanyViewSet(viewsets.ModelViewSet):
    """ViewSet for Company management"""
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Return only active companies by default; allow opt-in to all."""
        qs = super().get_queryset()
        include_inactive = self.request.query_params.get('include_inactive')
        if include_inactive in ('1', 'true', 'True'):
            return qs
        return qs.filter(is_active=True)
    
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Set this company as default"""
        company = self.get_object()
        company.is_default = True
        company.save()
        return Response({'status': 'Company set as default'})


class BankAccountViewSet(viewsets.ModelViewSet):
    """ViewSet for BankAccount management"""
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter by company if company_id is provided"""
        queryset = super().get_queryset()
        company_id = self.request.query_params.get('company_id')
        company_ext = self.request.query_params.get('company_external_id')
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        elif company_ext:
            queryset = queryset.filter(company_external_id=company_ext)
        return queryset
    
    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        """Set this bank account as primary for its currency"""
        account = self.get_object()
        account.is_primary = True
        account.save()
        return Response({'status': 'Bank account set as primary'})


class HealthCheckView(APIView):
    """Health check view"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        return Response({
            'status': 'healthy',
            'message': 'PixiERP is running',
            'version': '1.0.0'
        })

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint"""
    return Response({
        'status': 'healthy',
        'message': 'PixiERP is running',
        'version': '1.0.0'
    })

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_view(request):
    """User login endpoint - accepts email or username"""
    email = request.data.get('email')
    password = request.data.get('password')
    
    if email:
        email = email.strip()

    if not email or not password:
        return Response(
            {'error': 'Email and password are required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Try to find user by email first, then by username (for backward compatibility)
    user = None
    user_authenticated_with_current = False
    
    # 1. Lookup by Email (Case Insensitive)
    user_obj = User.objects.filter(email__iexact=email).first()
    
    if user_obj:
        # User found by email -> Authenticate using their real username
        user = authenticate(username=user_obj.username, password=password)
        if user:
            user_authenticated_with_current = True
        
        # Retry with stripped password if failed
        if not user and isinstance(password, str):
            password_stripped = password.strip()
            if password != password_stripped:
                user = authenticate(username=user_obj.username, password=password_stripped)
                if user:
                    user_authenticated_with_current = True
                    logger.info(f"User {email} logged in with stripped password")
    
    else:
        # 2. Fallback: try as username (Case Insensitive for lookup first)
        user_obj_by_name = User.objects.filter(username__iexact=email).first()
        if user_obj_by_name:
             user = authenticate(username=user_obj_by_name.username, password=password)
             if user:
                user_authenticated_with_current = True
             
             # Retry with stripped password
             if not user and isinstance(password, str):
                password_stripped = password.strip()
                if password != password_stripped:
                    user = authenticate(username=user_obj_by_name.username, password=password_stripped)
                    if user:
                        user_authenticated_with_current = True

    # 3. Check for Previous Password (if standard auth failed)
    if not user:
        # Check against previous password hash in UserPreference
        # We need to find the user object first (we might have it in user_obj or user_obj_by_name)
        target_user = user_obj or (User.objects.filter(username__iexact=email).first())
        
        if target_user and hasattr(target_user, 'preferences') and target_user.preferences.previous_password_hash:
            from django.contrib.auth.hashers import check_password
            if check_password(password, target_user.preferences.previous_password_hash):
                logger.info(f"User {target_user.username} logged in with PREVIOUS password")
                user = target_user
                # Note: We do NOT set user_authenticated_with_current = True here

    if user:
        # Handle password transition logic
        if user_authenticated_with_current:
            # If logged in with CURRENT password, clear the PREVIOUS password hash (transition complete)
            if hasattr(user, 'preferences') and user.preferences.previous_password_hash:
                user.preferences.previous_password_hash = None
                user.preferences.save()
                logger.info(f"User {user.username} logged in with new password. Cleared previous password hash.")
        # Frissítsük a last_login mezőt, mert JWT auth alapból nem teszi meg
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        # Django session létrehozása, hogy a böngészős kérések (pl. NFC trigger) is felismerje a bejelentkezést
        django_login(request, user, backend='django.contrib.auth.backends.ModelBackend')

        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            }
        })
    else:
        # Hibaüzenet pontosítása
        error_msg = 'Hibás felhasználónév vagy jelszó.'
        
        # Próbáljuk megkeresni a usert, hogy pontosabb hibát adhassunk (ha inaktív)
        target_obj = (
            User.objects.filter(email__iexact=email).first() or 
            User.objects.filter(username__iexact=email).first()
        )
        
        if target_obj:
            if not target_obj.is_active:
                error_msg = 'A felhasználói fiók inaktív. Kérjük, vegye fel a kapcsolatot az adminisztrátorral.'
            # Itt elvileg a jelszó volt rossz, de biztonsági okokból általában nem mondjuk meg.
            # Vállalati környezetben (ERP) viszont lehet, hogy megengedőbbek vagyunk.
            
        return Response(
            {'error': error_msg}, 
            status=status.HTTP_401_UNAUTHORIZED
        )

@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """User registration disabled"""
    return Response({'error': 'Registration is disabled'}, status=status.HTTP_403_FORBIDDEN)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """User logout endpoint"""
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                # Token érvénytelen vagy már feketelistán van - nem hiba kijelentkezésnél
                pass
        return Response({'message': 'Successfully logged out'})
    except Exception as e:
        # Minden egyéb hiba esetén is sikeresnek tekintjük a kijelentkezést a kliens felé
        return Response({'message': 'Successfully logged out'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """Get user profile"""
    return Response(UserSerializer(request.user).data)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile_view(request):
    """Update user profile"""
    user = request.user
    data = request.data
    
    user.first_name = data.get('first_name', user.first_name)
    user.last_name = data.get('last_name', user.last_name)
    user.email = data.get('email', user.email)
    user.save()
    
    return Response(UserSerializer(user).data)

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def refresh_token_view(request):
    """Refresh JWT token"""
    refresh_token = request.data.get('refresh')
    if refresh_token:
        try:
            token = RefreshToken(refresh_token)
            return Response({
                'access': str(token.access_token)
            })
        except Exception as e:
            return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'error': 'Refresh token required'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request_view(request):
    """Send a password reset email with a frontend link.

    Always returns 200 to avoid user enumeration.
    """
    from django.core.mail import get_connection
    from apps.core.models import EmailServerConfig
    import logging
    
    logger = logging.getLogger(__name__)
    email = (request.data.get('email') or '').strip()
    if not email:
        return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user:
        # EmailServerConfig használata, ha van, különben settings.py
        email_config = EmailServerConfig.objects.filter(is_active=True).first()
        
        try:
            # SMTP kapcsolat létrehozása
            if email_config:
                # Adatbázis konfiguráció használata
                connection = get_connection(
                    backend='django.core.mail.backends.smtp.EmailBackend',
                    host=email_config.smtp_host,
                    port=email_config.smtp_port,
                    username=email_config.smtp_username,
                    password=email_config.smtp_password,
                    use_tls=email_config.smtp_use_tls,
                    use_ssl=email_config.smtp_use_ssl,
                    fail_silently=False,
                    timeout=10,
                )
                from_email = f"{email_config.from_name} <{email_config.from_email}>" if email_config.from_name else email_config.from_email
            else:
                # Fallback settings.py EMAIL_* változókra
                logger.info(f"EmailServerConfig nincs, settings.py EMAIL_* változók használata")
                connection = get_connection(
                    backend=settings.EMAIL_BACKEND,
                    host=settings.EMAIL_HOST,
                    port=settings.EMAIL_PORT,
                    username=settings.EMAIL_HOST_USER,
                    password=settings.EMAIL_HOST_PASSWORD,
                    use_tls=settings.EMAIL_USE_TLS,
                    use_ssl=settings.EMAIL_USE_SSL,
                    fail_silently=False,
                    timeout=10,
                )
                from_email = settings.DEFAULT_FROM_EMAIL
            
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            
            # Frontend URL meghatározása - request alapján (Origin vagy Referer header)
            frontend_base = None
            origin = request.META.get('HTTP_ORIGIN', '').rstrip('/')
            referer = request.META.get('HTTP_REFERER', '').rstrip('/')
            
            if origin:
                # Ha van Origin header, azt használjuk (pl. CORS kérések)
                frontend_base = origin
            elif referer:
                # Ha van Referer header, abból vesszük a domain-t
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                frontend_base = f"{parsed.scheme}://{parsed.netloc}"
            
            # Ha nincs Origin/Referer, akkor a settings-ből vesszük, vagy a request alapján
            if not frontend_base:
                frontend_base = getattr(settings, 'FRONTEND_BASE_URL', '').rstrip('/')
            
            if not frontend_base:
                # Végső megoldás: a backend URL-jéből
                frontend_base = request.build_absolute_uri('/').rstrip('/')
            
            reset_link = f"{frontend_base}/reset-password/{uid}/{token}"
            
            logger.info(f"Jelszó visszaállító link generálva - Frontend: {frontend_base}, User: {email}")

            context = {
                'user': user,
                'reset_link': reset_link,
                'requested_at': timezone.now(),
            }
            subject = render_to_string('emails/password_reset_subject.txt', context).strip().replace('\n', '')
            body = render_to_string('emails/password_reset_body.txt', context)

            message = EmailMultiAlternatives(
                subject=subject or _('Password reset'),
                body=body,
                from_email=from_email,
                to=[email],
                connection=connection
            )
            
            message.send()
            logger.info(f"Jelszó visszaállító email elküldve: {email}")
        except Exception as e:
            # Log hiba de ne árulj el információt a felhasználóról
            logger.error(f"Jelszó visszaállító email hiba ({email}): {str(e)}", exc_info=True)
            # Továbbra is sikeres választ adunk biztonsági okokból

    return Response({'message': 'Ha létezik ilyen felhasználó, elküldtük a jelszó-visszaállító linket.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm_view(request):
    """Confirm password reset using uid/token and set a new password."""
    uidb64 = (request.data.get('uid') or '').strip()
    token = (request.data.get('token') or '').strip()
    new_password1 = request.data.get('new_password1') or ''
    new_password2 = request.data.get('new_password2') or ''

    if not uidb64 or not token:
        return Response({'error': 'uid and token are required'}, status=status.HTTP_400_BAD_REQUEST)
    if not new_password1 or not new_password2:
        return Response({'error': 'New password is required'}, status=status.HTTP_400_BAD_REQUEST)
    if new_password1 != new_password2:
        return Response({'error': 'A két jelszó nem egyezik'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid, is_active=True)
    except Exception:
        return Response({'error': 'Érvénytelen link'}, status=status.HTTP_400_BAD_REQUEST)

    if not default_token_generator.check_token(user, token):
        return Response({'error': 'Érvénytelen vagy lejárt token'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password1, user=user)
    except Exception as e:
        # e can be a ValidationError with messages
        msgs = getattr(e, 'messages', None) or [str(e)]
        return Response({'error': 'Érvénytelen jelszó', 'details': msgs}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password1)
    user.save(update_fields=['password'])

    return Response({'message': 'A jelszó sikeresen megváltozott. Most már be tudsz jelentkezni.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_sso_token_view(request):
    """Generate SSO token for PixInvoice authentication"""
    user = request.user
    
    # Create a short-lived JWT token (5 minutes) for SSO
    token = AccessToken.for_user(user)
    token.set_exp(lifetime=timedelta(minutes=5))
    
    # Include user data in token payload
    token['email'] = user.email
    token['username'] = user.username
    token['first_name'] = user.first_name or ''
    token['last_name'] = user.last_name or ''
    token['sso'] = True  # Mark as SSO token
    
    return Response({
        'token': str(token),
        'expires_in': 300  # 5 minutes
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_exchange_rates_view(request):
    """Update exchange rates from MNB API"""
    try:
        # Django management command futtatása
        call_command('update_exchange_rates')
        return Response({
            'message': 'Árfolyamok sikeresen frissítve az MNB API-ból'
        })
    except Exception as e:
        return Response({
            'error': f'Hiba az árfolyamok frissítése során: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EmailServerConfigViewSet(viewsets.ModelViewSet):
    queryset = EmailServerConfig.objects.all()
    serializer_class = EmailServerConfigSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'])
    def detect_imap_sent(self, request):
        """IMAP mappák listázása és Sent mappa detektálás"""
        try:
            import imaplib, ssl, re
            
            # Adatok a kérésből
            imap_host = request.data.get('imap_host')
            imap_port = int(request.data.get('imap_port') or 993)
            imap_user = request.data.get('imap_username')
            imap_password = request.data.get('imap_password')
            
            if not imap_host or not imap_user:
                return Response({'success': False, 'error': 'Hiányzó IMAP adatok'}, status=400)
            
            # Kapcsolódás
            try:
                M = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ssl.create_default_context())
            except Exception:
                # SSL 465 fallback, or plain/STARTTLS?
                try:
                    M = imaplib.IMAP4(imap_host, 143)
                    M.starttls(ssl_context=ssl.create_default_context())
                except Exception:
                    M = imaplib.IMAP4(imap_host)
            
            M.login(imap_user, imap_password)
            
            mailboxes = []
            seen = set()

            def add_box(name, flags):
                key = (name or '').strip()
                if not key or key in seen:
                    return
                # Skip placeholders and non-selectable
                if key in ('.', 'NIL'):
                    return
                if 'Noselect' in (flags or '') or '\\Noselect' in (flags or ''):
                    return
                seen.add(key)
                mailboxes.append({'name': name, 'flags': flags, 'label': name})

            typ, boxes = M.list()
            if typ == 'OK' and boxes:
                for raw in boxes:
                    s = raw.decode(errors='ignore') if isinstance(raw, (bytes, bytearray)) else str(raw)
                    
                    # Robust parsing of: (Flags) Delimiter Name
                    flags_txt = ''
                    delim = None
                    name = ''
                    
                    # 1. Flags
                    m_flags = re.search(r"^\(([^)]*)\)", s)
                    rest = s
                    if m_flags:
                        flags_txt = m_flags.group(1)
                        rest = s[m_flags.end():].strip()
                    
                    # 2. Delimiter (Quoted or NIL)
                    if rest.startswith('NIL'):
                        delim = None
                        rest = rest[3:].strip()
                    elif rest.startswith('"'):
                        m_q = re.match(r'^"([^"\\]*(?:\\.[^"\\]*)*)"', rest)
                        if m_q:
                            delim = m_q.group(1)
                            rest = rest[m_q.end():].strip()
                    
                    # 3. Name (Quoted or Literal or Plain)
                    if rest.startswith('"'):
                        m_n = re.match(r'^"([^"\\]*(?:\\.[^"\\]*)*)"', rest)
                        if m_n:
                            name = m_n.group(1)
                        else:
                            name = rest.strip('"')
                    else:
                        name = rest.strip()
                    
                    # Decode modified UTF-7
                    try:
                        from imaplib import IMAP4
                        name = IMAP4._decode_utf7(name)
                        # Fix double decoding if needed or leave as is
                        if isinstance(name, bytes):
                             name = name.decode('utf-8', errors='ignore')
                    except Exception:
                        pass
                    
                    add_box(name, flags_txt)

            M.logout()
            
            # Simple heuristic
            suggested = None
            for boxes in mailboxes:
                if '\\Sent' in boxes['flags']:
                    suggested = boxes['name']
                    break
            
            if not suggested:
                 # fallback to names
                 common_names = ['Sent', 'Sent Items', 'Elküldött', 'Elküldött elemek', 'Küldöttek']
                 lower_map = {m['name'].lower(): m['name'] for m in mailboxes}
                 for cn in common_names:
                     if cn.lower() in lower_map:
                         suggested = lower_map[cn.lower()]
                         break

            return Response({
                'success': True, 
                'mailboxes': mailboxes, 
                'suggested': suggested
            })

        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=500)

    @action(detail=True, methods=['post'])
    def send_test_email(self, request, pk=None):
        """Teszt email küldése a beállított szerverrel"""
        email_server = self.get_object()
        recipient = request.data.get('recipient')
        
        if not recipient:
            return Response({
                'success': False,
                'error': 'Nem adott meg címzettet'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        log_messages = []
        
        try:
            log_messages.append(f"Csatlakozás az email szerverhez: {email_server.smtp_host}:{email_server.smtp_port}")
            log_messages.append(f"Felhasználó: {email_server.smtp_username}")
            log_messages.append(f"SSL: {email_server.smtp_use_ssl}, TLS: {email_server.smtp_use_tls}")
            
            # SMTP kapcsolat létrehozása - FONTOS: backend='django.core.mail.backends.smtp.EmailBackend'
            # hogy mindig valódi SMTP-t használjon, még DEBUG módban is
            connection = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=email_server.smtp_host,
                port=email_server.smtp_port,
                username=email_server.smtp_username,
                password=email_server.smtp_password,
                use_tls=email_server.smtp_use_tls,
                use_ssl=email_server.smtp_use_ssl,
                fail_silently=False,
                timeout=10,  # 10 másodperc timeout
            )
            
            log_messages.append("Kapcsolat létrehozva")
            
            # Email összeállítása
            subject = 'Teszt email - PixiERP'
            from_email = f"{email_server.from_name} <{email_server.from_email}>" if email_server.from_name else email_server.from_email
            
            html_content = f"""
            <html>
                <body>
                    <h2>PixiERP - Teszt Email</h2>
                    <p>Ez egy teszt email a PixiERP rendszerből.</p>
                    <p><strong>Email szerver:</strong> {email_server.name}</p>
                    <p><strong>SMTP host:</strong> {email_server.smtp_host}:{email_server.smtp_port}</p>
                    <p><strong>Feladó:</strong> {email_server.from_email}</p>
                    <p><strong>Küldés időpontja:</strong> {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                    <hr>
                    <p><small>Ha ezt az emailt megkapta, az email szerver beállítások helyesek.</small></p>
                </body>
            </html>
            """
            
            text_content = f"""
            PixiERP - Teszt Email
            
            Ez egy teszt email a PixiERP rendszerből.
            
            Email szerver: {email_server.name}
            SMTP host: {email_server.smtp_host}:{email_server.smtp_port}
            Feladó: {email_server.from_email}
            Küldés időpontja: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}
            
            ---
            Ha ezt az emailt megkapta, az email szerver beállítások helyesek.
            """
            
            log_messages.append(f"Email összeállítva - címzett: {recipient}")
            
            # Email küldése
            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_content,
                from_email=from_email,
                to=[recipient],
                connection=connection
            )
            msg.attach_alternative(html_content, "text/html")
            
            log_messages.append("Email küldése...")
            
            # Kapcsolat megnyitása és tesztelése
            log_messages.append("SMTP kapcsolat megnyitása...")
            try:
                connection.open()
                log_messages.append(f"✓ SMTP kapcsolat sikeresen megnyitva")
            except Exception as conn_error:
                error_msg = str(conn_error)
                log_messages.append(f"✗ SMTP kapcsolat hiba: {error_msg}")
                
                # Részletesebb hibaüzenetek
                if "timed out" in error_msg.lower() or "timeout" in error_msg.lower():
                    log_messages.append("→ A szerver nem válaszol (timeout). Ellenőrizd a host címet és portot.")
                elif "refused" in error_msg.lower():
                    log_messages.append("→ A kapcsolat visszautasítva. Lehet, hogy rossz a port, vagy a szerver nem fut.")
                elif "name or service not known" in error_msg.lower() or "nodename nor servname" in error_msg.lower():
                    log_messages.append("→ A szerver címe nem létezik vagy nem érhető el.")
                elif "authentication failed" in error_msg.lower() or "535" in error_msg:
                    log_messages.append("→ Sikertelen bejelentkezés. Ellenőrizd a felhasználónevet és jelszót.")
                elif "ssl" in error_msg.lower() or "tls" in error_msg.lower():
                    log_messages.append("→ SSL/TLS hiba. Próbáld meg megfordítani az SSL és TLS beállításokat.")
                
                raise conn_error
            
            # Email küldése
            result = msg.send()
            log_messages.append(f"✓ Email sikeresen elküldve (eredmény: {result})")
            
            connection.close()
            log_messages.append("✓ SMTP kapcsolat lezárva")
            
            # IMAP Mentés (ha be van állítva)
            if email_server.imap_host and email_server.imap_username:
                try:
                    import imaplib, ssl
                    from django.utils import timezone
                    
                    log_messages.append(f"Mentés IMAP szerverre ({email_server.imap_host})...")
                    
                    # Csatlakozás
                    try:
                        M = imaplib.IMAP4_SSL(email_server.imap_host, email_server.imap_port, ssl_context=ssl.create_default_context())
                    except Exception:
                        try:
                            M = imaplib.IMAP4(email_server.imap_host, 143)
                            M.starttls(ssl_context=ssl.create_default_context())
                        except Exception:
                            M = imaplib.IMAP4(email_server.imap_host)
                            
                    M.login(email_server.imap_username, email_server.imap_password)
                    
                    # Sent mappa
                    sent_folder = email_server.imap_sent_folder or 'Sent'
                    
                    # Append
                    # msg.message() gives the underlying SafeMIMEText/Multipart, as_bytes() gets the raw content
                    raw_bytes = msg.message().as_bytes()
                    now = imaplib.Time2Internaldate(timezone.now().timestamp())
                    
                    # Try append
                    typ, _ = M.append(sent_folder, '\\Seen', now, raw_bytes)
                    if typ != 'OK':
                         log_messages.append(f"⚠ IMAP append nem OK: {typ}")
                    else:
                         log_messages.append(f"✓ Levél mentve a '{sent_folder}' mappába")

                    M.logout()
                    
                except Exception as ex:
                    log_messages.append(f"⚠ IMAP mentés sikertelen: {str(ex)}")

            return Response({
                'success': True,
                'message': f'Teszt email sikeresen elküldve a {recipient} címre',
                'log': log_messages,
                'smtp_result': result
            })
            
        except Exception as e:
            error_trace = traceback.format_exc()
            error_msg = str(e)
            
            log_messages.append(f"✗ HIBA: {error_msg}")
            
            # Kategorizált hibaüzenetek
            if "timed out" in error_msg.lower() or "timeout" in error_msg.lower():
                user_friendly_error = "Kapcsolat időtúllépés - a szerver nem válaszol."
            elif "refused" in error_msg.lower():
                user_friendly_error = "Kapcsolat visszautasítva - ellenőrizd a host címet és portot."
            elif "name or service not known" in error_msg.lower() or "nodename nor servname" in error_msg.lower():
                user_friendly_error = "A szerver címe nem létezik vagy nem érhető el (DNS hiba)."
            elif "authentication failed" in error_msg.lower() or "535" in error_msg:
                user_friendly_error = "Sikertelen bejelentkezés - rossz felhasználónév vagy jelszó."
            elif "ssl" in error_msg.lower() or "tls" in error_msg.lower() or "certificate" in error_msg.lower():
                user_friendly_error = "SSL/TLS titkosítási hiba - ellenőrizd az SSL/TLS beállításokat."
            elif "no such file" in error_msg.lower():
                user_friendly_error = "Fájl nem található - lehet, hogy hiányzik egy tanúsítvány."
            else:
                user_friendly_error = error_msg
            
            log_messages.append(f"→ {user_friendly_error}")
            
            return Response({
                'success': False,
                'error': user_friendly_error,
                'technical_error': error_msg,
                'log': log_messages,
                'traceback': error_trace
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EmailTemplateViewSet(viewsets.ModelViewSet):
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsAuthenticated]


class HestiaConfigViewSet(viewsets.ModelViewSet):
    queryset = HestiaConfig.objects.all()
    serializer_class = HestiaConfigSerializer
    permission_classes = [IsAuthenticated]

    def _resolve_private_key_path(self, cfg: HestiaConfig) -> str:
        raw_path = (cfg.ssh_private_key_path or '').strip()
        if raw_path:
            return os.path.abspath(os.path.expanduser(raw_path))
        return os.path.abspath(os.path.expanduser('~/.ssh/hestia_erp'))

    @action(detail=True, methods=['post'])
    def generate_ssh_key(self, request, pk=None):
        cfg = self.get_object()
        overwrite = bool(request.data.get('overwrite', False))
        request_ssh_key_id = request.data.get('ssh_key_id', request.data.get('sshKeyId', None))
        if request_ssh_key_id is not None:
            ssh_key_id = str(request_ssh_key_id).strip() or 'pixierp-hestia'
        else:
            ssh_key_id = (cfg.ssh_key_id or 'pixierp-hestia').strip() or 'pixierp-hestia'
        private_key_path = self._resolve_private_key_path(cfg)
        public_key_path = f"{private_key_path}.pub"

        if os.path.exists(private_key_path) and not overwrite:
            return Response(
                {
                    'success': False,
                    'message': 'A privát kulcs már létezik. Ha felül akarod írni, küldj overwrite=true értéket.',
                    'private_key_path': private_key_path,
                    'public_key_path': public_key_path,
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            os.makedirs(os.path.dirname(private_key_path), exist_ok=True)

            if overwrite:
                if os.path.exists(private_key_path):
                    os.remove(private_key_path)
                if os.path.exists(public_key_path):
                    os.remove(public_key_path)

            result = subprocess.run(
                [
                    'ssh-keygen',
                    '-q',
                    '-t', 'ed25519',
                    '-f', private_key_path,
                    '-N', '',
                    '-C', ssh_key_id,
                ],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )

            if result.returncode != 0:
                err = (result.stderr or result.stdout or '').strip()
                return Response(
                    {
                        'success': False,
                        'message': 'SSH kulcs generálás sikertelen.',
                        'details': err or f'Kilépési kód: {result.returncode}',
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            os.chmod(private_key_path, 0o600)
            if os.path.exists(public_key_path):
                os.chmod(public_key_path, 0o644)

            cfg.ssh_private_key_path = private_key_path
            cfg.ssh_key_id = ssh_key_id
            cfg.save(update_fields=['ssh_private_key_path', 'ssh_key_id', 'updated_at'])

            public_key = ''
            if os.path.exists(public_key_path):
                with open(public_key_path, 'r', encoding='utf-8') as fh:
                    public_key = fh.read().strip()

            return Response(
                {
                    'success': True,
                    'message': 'SSH kulcspár sikeresen legenerálva.',
                    'ssh_key_id': ssh_key_id,
                    'private_key_path': private_key_path,
                    'public_key_path': public_key_path,
                    'public_key': public_key,
                }
            )
        except FileNotFoundError:
            return Response(
                {
                    'success': False,
                    'message': 'ssh-keygen parancs nem található a szerveren.',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {
                    'success': False,
                    'message': 'SSH kulcsgenerálás timeout.',
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as exc:
            logger.exception('Hestia SSH key generation failed')
            return Response(
                {
                    'success': False,
                    'message': f'Váratlan hiba: {str(exc)}',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'])
    def trust_host_key(self, request, pk=None):
        cfg = self.get_object()

        if not cfg.ssh_host:
            return Response(
                {
                    'success': False,
                    'message': 'SSH host nincs beállítva.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ssh_dir = os.path.abspath(os.path.expanduser('~/.ssh'))
            known_hosts_path = os.path.join(ssh_dir, 'known_hosts')
            os.makedirs(ssh_dir, exist_ok=True)
            if not os.path.exists(known_hosts_path):
                open(known_hosts_path, 'a', encoding='utf-8').close()
                os.chmod(known_hosts_path, 0o644)

            remove_cmd = [
                'ssh-keygen',
                '-R',
                f'[{cfg.ssh_host}]:{cfg.ssh_port or 22}',
                '-f',
                known_hosts_path,
            ]
            subprocess.run(remove_cmd, capture_output=True, text=True, timeout=10, check=False)

            scan_cmd = [
                'ssh-keyscan',
                '-p',
                str(cfg.ssh_port or 22),
                '-t',
                'ed25519',
                cfg.ssh_host,
            ]
            scan_result = subprocess.run(
                scan_cmd,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )

            if scan_result.returncode != 0:
                err = (scan_result.stderr or scan_result.stdout or '').strip()
                return Response(
                    {
                        'success': False,
                        'message': 'SSH host kulcs lekérdezése sikertelen.',
                        'details': err or f'Kilépési kód: {scan_result.returncode}',
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            key_line = (scan_result.stdout or '').strip()
            if not key_line:
                return Response(
                    {
                        'success': False,
                        'message': 'Nem érkezett host kulcs az ssh-keyscan parancsból.',
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            with open(known_hosts_path, 'a', encoding='utf-8') as known_hosts:
                known_hosts.write(f"{key_line}\n")

            return Response(
                {
                    'success': True,
                    'message': 'SSH host kulcs sikeresen mentve a known_hosts fájlba.',
                    'known_hosts_path': known_hosts_path,
                }
            )
        except FileNotFoundError as exc:
            return Response(
                {
                    'success': False,
                    'message': 'ssh-keyscan vagy ssh-keygen parancs nem található a szerveren.',
                    'details': str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {
                    'success': False,
                    'message': 'SSH host kulcs mentés timeout.',
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as exc:
            logger.exception('Hestia SSH host key trust failed')
            return Response(
                {
                    'success': False,
                    'message': f'Váratlan hiba: {str(exc)}',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['get'])
    def public_key(self, request, pk=None):
        cfg = self.get_object()
        private_key_path = self._resolve_private_key_path(cfg)
        public_key_path = f"{private_key_path}.pub"

        if not os.path.exists(public_key_path):
            return Response(
                {
                    'success': False,
                    'message': 'Publikus kulcs nem található. Előbb generáld le a kulcspárt.',
                    'public_key_path': public_key_path,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        with open(public_key_path, 'r', encoding='utf-8') as fh:
            content = fh.read().strip()

        return Response(
            {
                'success': True,
                'public_key': content,
                'public_key_path': public_key_path,
                'private_key_path': private_key_path,
            }
        )

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        cfg = self.get_object()

        try:
            if cfg.mode == 'cli':
                bin_path = (cfg.cli_bin_path or '/usr/local/hestia/bin').rstrip('/')
                test_log = []

                if not cfg.hestia_user:
                    return Response(
                        {
                            'success': False,
                            'mode': 'cli',
                            'message': 'Hiányzó Hestia user.',
                            'details': 'A mailbox létrehozáshoz kötelező a Hestia user mező.',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if cfg.ssh_enabled and not cfg.ssh_host:
                    return Response(
                        {
                            'success': False,
                            'mode': 'cli',
                            'message': 'SSH módhoz kötelező a host mező.',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if cfg.ssh_enabled and not cfg.ssh_user:
                    return Response(
                        {
                            'success': False,
                            'mode': 'cli',
                            'message': 'SSH módhoz kötelező a user mező.',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if cfg.ssh_enabled and cfg.ssh_private_key_path:
                    key_path = os.path.abspath(os.path.expanduser(cfg.ssh_private_key_path))
                    if not os.path.exists(key_path):
                        return Response(
                            {
                                'success': False,
                                'mode': 'cli',
                                'message': 'A beállított SSH private key fájl nem található.',
                                'details': key_path,
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                def run_cli_command(parts, timeout=35):
                    cmd = list(parts)
                    if cfg.cli_use_sudo:
                        sudo_cmd = ['sudo', '-n']
                        sudo_runner = (cfg.cli_sudo_runner or '').strip()
                        if sudo_runner and sudo_runner != (cfg.ssh_user or '').strip():
                            sudo_cmd.extend(['-u', sudo_runner])
                        cmd = sudo_cmd + cmd

                    if cfg.ssh_enabled:
                        remote_cmd = ' '.join(shlex.quote(part) for part in cmd)
                        ssh_cmd = [
                            'ssh',
                            '-p', str(cfg.ssh_port or 22),
                            '-o', 'BatchMode=yes',
                            '-o', 'ConnectTimeout=10',
                            '-o', f"StrictHostKeyChecking={'yes' if cfg.ssh_strict_host_key else 'no'}",
                        ]
                        if not cfg.ssh_strict_host_key:
                            ssh_cmd.extend(['-o', 'UserKnownHostsFile=/dev/null'])
                        if cfg.ssh_private_key_path:
                            ssh_cmd.extend(['-i', cfg.ssh_private_key_path])
                        ssh_cmd.append(f"{cfg.ssh_user}@{cfg.ssh_host}")
                        ssh_cmd.append(remote_cmd)
                        cmd = ssh_cmd

                    return subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=timeout,
                        check=False,
                    )

                def handle_cli_failure(result, generic_message):
                    err = (result.stderr or result.stdout or '').strip()
                    err_lower = err.lower()
                    sudo_user = (cfg.ssh_user or 'ceze').strip() or 'ceze'
                    sudoers_file = f"/etc/sudoers.d/{sudo_user}-hestia"
                    sudoers_cmds = (
                        f"sudo visudo -f {sudoers_file}\n"
                        f"{sudo_user} ALL=(root) NOPASSWD: /usr/local/hestia/bin/v-list-sys-info, /usr/local/hestia/bin/v-list-mail-domain, /usr/local/hestia/bin/v-list-mail-accounts, /usr/local/hestia/bin/v-add-mail-account, /usr/local/hestia/bin/v-delete-mail-account\n"
                        f"sudo chmod 440 {sudoers_file}\n"
                        f"sudo -l -U {sudo_user}"
                    )

                    if cfg.ssh_enabled and (
                        'host key verification failed' in err_lower
                        or 'strict checking' in err_lower
                        or 'no ed25519 host key is known' in err_lower
                    ):
                        known_hosts_cmd = f"ssh-keyscan -p {cfg.ssh_port or 22} -t ed25519 {cfg.ssh_host} >> ~/.ssh/known_hosts"
                        return Response(
                            {
                                'success': False,
                                'mode': 'cli',
                                'message': 'SSH host kulcs nincs megbízhatónak jelölve. Add hozzá a known_hosts fájlhoz, vagy kapcsold ki a StrictHostKeyChecking-et.',
                                'details': err or f'Kilépési kód: {result.returncode}',
                                'hint': known_hosts_cmd,
                                'log': test_log,
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    if cfg.ssh_enabled and 'permission denied' in err_lower:
                        return Response(
                            {
                                'success': False,
                                'mode': 'cli',
                                'message': 'SSH hitelesítés sikertelen. A távoli szerver nem fogadta el a megadott felhasználóhoz tartozó kulcsot/jelszót.',
                                'details': err or f'Kilépési kód: {result.returncode}',
                                'hint': f'Add hozzá a publikus kulcsot a távoli "{cfg.ssh_user}" user ~/.ssh/authorized_keys fájljához (vagy Hestia GUI-ban ennek a usernek), majd teszteld újra.',
                                'log': test_log,
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    if ('hestia.conf' in err_lower and 'permission denied' in err_lower) or ('/usr/local/hestia/log/error.log' in err_lower and 'permission denied' in err_lower):
                        return Response(
                            {
                                'success': False,
                                'mode': 'cli',
                                'message': 'Hestia jogosultsági hiba. A CLI user nem fér hozzá a Hestia fájlokhoz.',
                                'details': err or f'Kilépési kód: {result.returncode}',
                                'hint': f'Kapcsold be a CLI futtatás sudo-val opciót, és adj jelszó nélküli sudo jogot a Hestia parancsokra.\n\n{sudoers_cmds}',
                                'log': test_log,
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    if 'sudo' in err_lower and (
                        'password is required' in err_lower
                        or 'jelszó szükséges' in err_lower
                        or 'not allowed to execute' in err_lower
                    ):
                        return Response(
                            {
                                'success': False,
                                'mode': 'cli',
                                'message': 'A sudo jogosultság hiányzik vagy jelszót kér.',
                                'details': err or f'Kilépési kód: {result.returncode}',
                                'hint': sudoers_cmds,
                                'log': test_log,
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    return Response(
                        {
                            'success': False,
                            'mode': 'cli',
                            'message': generic_message,
                            'details': err or f'Kilépési kód: {result.returncode}',
                            'log': test_log,
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                test_log.append('1) Hestia rendszerinformáció ellenőrzése (v-list-sys-info)')
                sys_info_result = run_cli_command([f"{bin_path}/v-list-sys-info"])
                if sys_info_result.returncode != 0:
                    return handle_cli_failure(sys_info_result, 'Hestia CLI teszt sikertelen a rendszerinformáció ellenőrzésnél.')
                test_log.append('✔ v-list-sys-info sikeres')

                if cfg.default_domain:
                    test_log.append(f'2) Domain ellenőrzés (v-list-mail-domain {cfg.hestia_user} {cfg.default_domain})')
                    domain_result = run_cli_command([
                        f"{bin_path}/v-list-mail-domain",
                        cfg.hestia_user,
                        cfg.default_domain,
                        'json',
                    ])
                    if domain_result.returncode != 0:
                        return handle_cli_failure(domain_result, 'Hestia domain ellenőrzés sikertelen.')
                    test_log.append('✔ v-list-mail-domain sikeres')

                    test_log.append(f'3) Mailbox lista ellenőrzés (v-list-mail-accounts {cfg.hestia_user} {cfg.default_domain})')
                    accounts_result = run_cli_command([
                        f"{bin_path}/v-list-mail-accounts",
                        cfg.hestia_user,
                        cfg.default_domain,
                        'json',
                    ])
                    if accounts_result.returncode != 0:
                        return handle_cli_failure(accounts_result, 'Hestia mailbox lista ellenőrzés sikertelen.')
                    test_log.append('✔ v-list-mail-accounts sikeres')
                else:
                    test_log.append('2) Domain ellenőrzés kihagyva: nincs beállított default_domain')

                return Response(
                    {
                        'success': True,
                        'mode': 'cli',
                        'message': 'Hestia CLI teljes előfeltétel teszt sikeres.',
                        'details': '\n'.join(test_log),
                        'log': test_log,
                    }
                )

            if cfg.mode == 'rest':
                if not cfg.rest_api_url or not cfg.rest_api_user or not cfg.rest_api_password:
                    return Response(
                        {
                            'success': False,
                            'mode': 'rest',
                            'message': 'Hiányzó REST API adatok.',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                test_log = []

                def run_rest_cmd(cmd_name, arg1='', arg2='', arg3=''):
                    resp = requests.post(
                        cfg.rest_api_url,
                        data={
                            'user': cfg.rest_api_user,
                            'password': cfg.rest_api_password,
                            'returncode': 'yes',
                            'cmd': cmd_name,
                            'arg1': arg1,
                            'arg2': arg2,
                            'arg3': arg3,
                        },
                        timeout=25,
                    )
                    payload = (resp.text or '').strip()
                    if resp.status_code >= 400 or payload not in ('0', 'OK', 'ok', ''):
                        return False, payload or f'HTTP {resp.status_code}'
                    return True, payload

                test_log.append('1) Hestia rendszerinformáció ellenőrzése (v-list-sys-info)')
                ok, payload = run_rest_cmd('v-list-sys-info')
                if not ok:
                    return Response(
                        {
                            'success': False,
                            'mode': 'rest',
                            'message': 'Hestia REST teszt sikertelen a rendszerinformáció ellenőrzésnél.',
                            'details': payload,
                            'log': test_log,
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                test_log.append('✔ v-list-sys-info sikeres')

                if cfg.hestia_user and cfg.default_domain:
                    test_log.append(f'2) Domain ellenőrzés (v-list-mail-domain {cfg.hestia_user} {cfg.default_domain})')
                    ok, payload = run_rest_cmd('v-list-mail-domain', cfg.hestia_user, cfg.default_domain, 'json')
                    if not ok:
                        return Response(
                            {
                                'success': False,
                                'mode': 'rest',
                                'message': 'Hestia REST domain ellenőrzés sikertelen.',
                                'details': payload,
                                'log': test_log,
                            },
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )
                    test_log.append('✔ v-list-mail-domain sikeres')
                else:
                    test_log.append('2) Domain ellenőrzés kihagyva: nincs beállított hestia_user vagy default_domain')

                return Response(
                    {
                        'success': True,
                        'mode': 'rest',
                        'message': 'Hestia REST teljes előfeltétel teszt sikeres.',
                        'details': '\n'.join(test_log),
                        'log': test_log,
                    }
                )

            return Response(
                {
                    'success': False,
                    'message': 'Ismeretlen Hestia mód.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        except FileNotFoundError:
            return Response(
                {
                    'success': False,
                    'message': f'Hestia CLI nem található: {(cfg.cli_bin_path or "/usr/local/hestia/bin").rstrip("/")}/v-list-sys-info',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except requests.RequestException as exc:
            return Response(
                {
                    'success': False,
                    'message': f'Hestia REST kapcsolat hiba: {str(exc)}',
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {
                    'success': False,
                    'message': 'Hestia CLI timeout.',
                    'details': 'SSH kapcsolat timeout. Ellenőrizd az SSH host/port elérhetőséget, a felhasználót és a kulcs jogosultságokat.',
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as exc:
            logger.exception('Hestia test connection failed')
            return Response(
                {
                    'success': False,
                    'message': f'Váratlan hiba: {str(exc)}',
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class SignatureTemplateViewSet(viewsets.ModelViewSet):
    queryset = SignatureTemplate.objects.all()
    serializer_class = SignatureTemplateSerializer
    permission_classes = [IsAuthenticated]


class UserPreferenceViewSet(viewsets.ModelViewSet):
    serializer_class = UserPreferenceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Only allow users to access their own preferences
        return UserPreference.objects.filter(user=self.request.user)
    
    def perform_create(self, serializer):
        # Ensure the preference is created for the current user
        serializer.save(user=self.request.user)
    
    @action(detail=False, methods=['get', 'put', 'patch'])
    def me(self, request):
        """Get or update current user's preferences"""
        preference, created = UserPreference.objects.get_or_create(user=request.user)
        
        if request.method == 'GET':
            serializer = self.get_serializer(preference)
            return Response(serializer.data)
        else:
            serializer = self.get_serializer(preference, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def ui_preferences_view(request):
    """Get or merge-update the ui_preferences JSON blob for the current user.
    
    GET  → returns the full ui_preferences dict
    PATCH { "key": value, ... } → deep-merges the provided keys into ui_preferences
    """
    preference, _ = UserPreference.objects.get_or_create(user=request.user)
    if request.method == 'GET':
        return Response(preference.ui_preferences or {})
    # PATCH: merge top-level keys
    updates = request.data
    if not isinstance(updates, dict):
        return Response({'error': 'Expected a JSON object'}, status=status.HTTP_400_BAD_REQUEST)
    current = preference.ui_preferences or {}
    current.update(updates)
    preference.ui_preferences = current
    preference.save(update_fields=['ui_preferences'])
    return Response(preference.ui_preferences)


class PixinvoiceConfigViewSet(viewsets.ModelViewSet):
    queryset = PixinvoiceConfig.objects.all()
    serializer_class = PixinvoiceConfigSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def test_connection(self, request, *args, **kwargs):
        cfg_id = request.data.get('id')
        try:
            cfg = PixinvoiceConfig.objects.get(id=cfg_id)
        except PixinvoiceConfig.DoesNotExist:
            return Response({'error': 'Beállítás nem található'}, status=status.HTTP_404_NOT_FOUND)

        try:
            headers = {'X-Api-Key': cfg.api_key, 'Accept': 'application/json'}
            base = cfg.base_url.rstrip('/')
            # 1) Egyszerű elérés teszt: cégek listája
            url = f"{base}/companies/"
            r = requests.get(url, headers=headers, timeout=15)
            if r.status_code in (401, 403):
                return Response({'ok': False, 'base': base, 'error': 'Érvénytelen API kulcs vagy jogosultság'}, status=status.HTTP_200_OK)
            r.raise_for_status()
            companies = r.json() if r.headers.get('content-type','').startswith('application/json') else []

            # 2) company_id megléte esetén pingeljünk egy company_id-t igénylő végpontot is
            cmp_id = (cfg.company_id or '').strip()
            detail = None
            if cmp_id:
                test_resp = requests.get(f"{base}/invoices/?company_id={cmp_id}", headers=headers, timeout=15)
                if test_resp.status_code in (401, 403, 400):
                    detail = {'invoices_status': test_resp.status_code}
                else:
                    detail = {'invoices_status': test_resp.status_code, 'invoices_len': len(test_resp.json() or [])}

            return Response({'ok': True, 'base': base, 'companies': companies, 'detail': detail})
        except requests.exceptions.RequestException as e:
            # Adjunk vissza hasznos tippeket a leggyakoribb hibákhoz
            err = str(e)
            tip = None
            if 'Connection refused' in err or 'Max retries exceeded' in err:
                if 'localhost' in base or '127.0.0.1' in base:
                    tip = 'A base_url jelenleg localhost-ra mutat, de nem fut helyben PixInvoice szerver. Indítsd el a szolgáltatást a 4001-es porton, vagy állítsd át a base_url-t a felhős/hosztolt végpontra.'
                else:
                    tip = 'Nem érhető el a megadott szerver. Ellenőrizd a base_url helyességét, a tűzfalat és a hálózati elérést (443/80, proxy).' 
            elif 'Name or service not known' in err or 'Failed to resolve' in err:
                tip = 'DNS feloldási hiba. Ellenőrizd, hogy a hosztnév helyes-e, és van-e kimenő internet/DNS hozzáférés azon a gépen, ahol a backend fut.'
            elif 'timed out' in err:
                tip = 'Időtúllépés. Lehet hálózati elérés vagy tűzfal probléma, illetve az endpoint lassú.'
            return Response({'ok': False, 'base': base, 'error': err, 'hint': tip}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def invoice_series(self, request, pk=None):
        """Get invoice blocks from PixInvoice using API key"""
        import requests
        
        cfg = self.get_object()
        headers = {'X-Api-Key': cfg.api_key, 'Accept': 'application/json'}
        base = cfg.base_url.rstrip('/')
        
        try:
            # Get all invoice blocks accessible with this API key
            blocks_response = requests.get(
                f"{base}/invoice-blocks/",
                headers=headers,
                timeout=15
            )
            
            if blocks_response.status_code in (401, 403):
                return Response({'ok': False, 'error': 'Érvénytelen API kulcs'})
            
            blocks_response.raise_for_status()
            blocks_data = blocks_response.json()
            
            all_series = blocks_data.get('results', [])
            
            if not all_series:
                return Response({'ok': False, 'error': 'Nincs elérhető számlatömb ezzel az API kulccsal'})
            
            return Response({'ok': True, 'series': all_series})
        except Exception as e:
            return Response({'ok': False, 'error': str(e)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_database_view(request):
    """Export database as JSON"""
    try:
        output = StringIO()
        call_command('dumpdata', 
                    '--natural-foreign', 
                    '--natural-primary',
                    '--indent', '2',
                    '--exclude', 'contenttypes',
                    '--exclude', 'auth.permission',
                    '--exclude', 'sessions',
                    stdout=output)
        
        response = HttpResponse(output.getvalue(), content_type='application/json')
        response['Content-Disposition'] = f'attachment; filename="pixierp_backup_{timezone.now().strftime("%Y%m%d_%H%M%S")}.json"'
        return response
    except Exception as e:
        return Response({
            'error': f'Hiba az adatbázis exportálása során: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_database_view(request):
    """Import database from JSON file"""
    if 'file' not in request.FILES:
        return Response({
            'error': 'Nincs fájl feltöltve'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        uploaded_file = request.FILES['file']
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as temp_file:
            content = uploaded_file.read().decode('utf-8')
            temp_file.write(content)
            temp_file.flush()
            
            # Load data
            call_command('loaddata', temp_file.name)
        
        return Response({
            'message': 'Adatbázis sikeresen importálva'
        })
    except Exception as e:
        return Response({
            'error': f'Hiba az adatbázis importálása során: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Backup Management Views
class BackupConfigurationViewSet(viewsets.ModelViewSet):
    """ViewSet for backup configurations"""
    queryset = BackupConfiguration.objects.all()
    serializer_class = BackupConfigurationSerializer
    permission_classes = [IsAuthenticated]


class BackupFileViewSet(viewsets.ModelViewSet):
    """ViewSet for backup files"""
    queryset = BackupFile.objects.all()
    serializer_class = BackupFileSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']
    
    @action(detail=False, methods=['post'])
    def create_backup(self, request):
        """Create a manual backup. Supports PostgreSQL (pg_dump) and falls back to SQLite copy."""
        import os
        import subprocess
        from django.conf import settings
		
        try:
            # Create backups directory if not exists
            backup_dir = os.path.join(settings.BASE_DIR, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
			
            db_settings = settings.DATABASES['default']
            engine = db_settings.get('ENGINE', '')
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')

            if 'postgresql' in engine:
                # PostgreSQL: use pg_dump
                filename = f'manual_backup_{timestamp}.dump'
                filepath = os.path.join(backup_dir, filename)
                host = db_settings.get('HOST') or 'localhost'
                port = str(db_settings.get('PORT') or 5432)
                user = db_settings.get('USER') or ''
                password = db_settings.get('PASSWORD') or ''
                db_name = db_settings.get('NAME')
                if not db_name:
                    raise ValueError('Adatbázis név nincs beállítva (DATABASES["default"]["NAME"]).')

                cmd = [
                    'pg_dump',
                    '-h', host,
                    '-p', port,
                    '-U', user,
                    '-F', 'c',  # custom format
                    '-f', filepath,
                    db_name,
                ]
                env = {**os.environ, 'PGPASSWORD': password}
                try:
                    subprocess.check_call(cmd, env=env)
                except FileNotFoundError:
                    raise RuntimeError('pg_dump nem található. Telepítsd a PostgreSQL klienst a szerveren.')
                except subprocess.CalledProcessError as e:
                    raise RuntimeError(f'pg_dump hiba: {e}')
            else:
                # SQLite fallback (legacy)
                import shutil
                filename = f'manual_backup_{timestamp}.sqlite3'
                filepath = os.path.join(backup_dir, filename)
                db_path = db_settings.get('NAME')
                if not db_path or not os.path.exists(db_path):
                    raise RuntimeError('SQLite adatbázis fájl nem található.')
                shutil.copy2(db_path, filepath)

            # Get file size
            file_size = os.path.getsize(filepath)
			
            # Create backup record
            backup = BackupFile.objects.create(
                filename=filename,
                filepath=filepath,
                file_size=file_size,
                created_by=request.user,
                is_manual=True
            )
			
            serializer = self.get_serializer(backup)
            return Response({
                'message': 'Backup sikeresen létrehozva',
                'backup': serializer.data
            })
        except Exception as e:
            return Response({
                'error': f'Hiba a backup létrehozása során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def upload_backup(self, request):
        """Upload a backup file for restoration"""
        import os
        from django.conf import settings
        
        try:
            uploaded_file = request.FILES.get('file')
            if not uploaded_file:
                return Response({
                    'error': 'Nincs fájl feltöltve'
                }, status=status.HTTP_400_BAD_REQUEST)
			
            # Validate file extension (allow pg_dump custom or SQL)
            if not (uploaded_file.name.endswith('.dump') or uploaded_file.name.endswith('.sql') or uploaded_file.name.endswith('.sqlite3')):
                return Response({
                    'error': 'Csak .dump, .sql vagy .sqlite3 kiterjesztésű fájlok tölthetők fel'
                }, status=status.HTTP_400_BAD_REQUEST)
			
            # Create backups directory if not exists
            backup_dir = os.path.join(settings.BASE_DIR, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
			
            # Generate unique filename
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            filename = f'uploaded_{uploaded_file.name}_{timestamp}'
            filepath = os.path.join(backup_dir, filename)
			
            # Save uploaded file
            with open(filepath, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
			
            # Get file size
            file_size = os.path.getsize(filepath)
			
            # Create backup record
            backup = BackupFile.objects.create(
                filename=filename,
                filepath=filepath,
                file_size=file_size,
                created_by=request.user,
                is_manual=True
            )
			
            serializer = self.get_serializer(backup)
            return Response({
                'message': 'Backup fájl sikeresen feltöltve',
                'backup': serializer.data
            }, status=status.HTTP_201_CREATED)
			
        except Exception as e:
            import traceback
            return Response({
                'error': f'Hiba a feltöltés során: {str(e)}',
                'traceback': traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download a backup file"""
        import os
        
        try:
            backup = self.get_object()
            
            if not os.path.exists(backup.filepath):
                return Response({
                    'error': 'A backup fájl nem található'
                }, status=status.HTTP_404_NOT_FOUND)
            
            with open(backup.filepath, 'rb') as f:
                response = HttpResponse(f.read(), content_type='application/octet-stream')
                response['Content-Disposition'] = f'attachment; filename="{backup.filename}"'
                return response
        except Exception as e:
            return Response({
                'error': f'Hiba a letöltés során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore from a backup file"""
        import os
        import shutil
        import subprocess
        from django.conf import settings
        
        try:
            backup = self.get_object()
			
            if not os.path.exists(backup.filepath):
                return Response({
                    'error': 'A backup fájl nem található'
                }, status=status.HTTP_404_NOT_FOUND)

            # Check if file is SQLite
            with open(backup.filepath, 'rb') as f:
                header = f.read(16)
            
            is_sqlite = header == b'SQLite format 3\x00'
            
            db_settings = settings.DATABASES['default']
            engine = db_settings.get('ENGINE', '')
            
            if is_sqlite and 'postgresql' in engine:
                 return Response({
                    'error': 'Nem lehet SQLite formátumú mentést PostgreSQL adatbázisba visszaállítani. Kérjük, használjon PostgreSQL kompatibilis (pl. pg_dump -Fc) mentést.'
                }, status=status.HTTP_400_BAD_REQUEST)
			
            host = db_settings.get('HOST') or 'localhost'
            port = str(db_settings.get('PORT') or 5432)
            user = db_settings.get('USER') or ''
            password = db_settings.get('PASSWORD') or ''
            db_name = db_settings.get('NAME')

            if 'postgresql' in engine:
                # Use explicit path for Postgres 16 tools if available
                pg_dump_cmd = 'pg_dump'
                pg_restore_cmd = 'pg_restore'
                pg_bin_16 = '/usr/lib/postgresql/16/bin'
                if os.path.exists(os.path.join(pg_bin_16, 'pg_restore')):
                    pg_dump_cmd = os.path.join(pg_bin_16, 'pg_dump')
                    pg_restore_cmd = os.path.join(pg_bin_16, 'pg_restore')

                # Create pre-restore backup
                pre_filename = f"pre_restore_{timezone.now().strftime('%Y%m%d_%H%M%S')}.dump"
                pre_path = os.path.join(settings.BASE_DIR, 'backups', pre_filename)
                os.makedirs(os.path.dirname(pre_path), exist_ok=True)
                env = {**os.environ, 'PGPASSWORD': password}
                pre_cmd = [
                    pg_dump_cmd, '-h', host, '-p', port, '-U', user, '-F', 'c', '-f', pre_path, db_name
                ]
                subprocess.check_call(pre_cmd, env=env)

                # Restore using pg_restore (clean + if-exists)
                restore_cmd = [
                    pg_restore_cmd,
                    '--clean', '--if-exists',
                    '-h', host,
                    '-p', port,
                    '-U', user,
                    '-d', db_name,
                    backup.filepath,
                ]
                subprocess.check_call(restore_cmd, env=env)
                current_backup = pre_path
            else:
                # SQLite fallback
                current_backup = f"{db_name}.before-restore-{timezone.now().strftime('%Y%m%d_%H%M%S')}"
                shutil.copy2(db_name, current_backup)
                shutil.copy2(backup.filepath, db_name)

            return Response({
                'message': 'Adatbázis sikeresen visszaállítva. Kérjük jelentkezzen be újra.',
                'current_backup': current_backup
            })
        except FileNotFoundError:
            return Response({
                'error': 'pg_dump/pg_restore nem található. Telepítsd a PostgreSQL klienst a szerveren.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({
                'error': f'Hiba a visszaállítás során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def cleanup_old_backups(self, request):
        """Clean up old backups based on retention policy"""
        import os
        
        try:
            deleted_count = 0
            configs = BackupConfiguration.objects.filter(is_active=True)
            
            for config in configs:
                cutoff_date = timezone.now() - timedelta(days=config.retention_days)
                old_backups = BackupFile.objects.filter(
                    configuration=config,
                    created_at__lt=cutoff_date,
                    is_manual=False
                )
                
                for backup in old_backups:
                    if os.path.exists(backup.filepath):
                        os.remove(backup.filepath)
                    backup.delete()
                    deleted_count += 1
            
            return Response({
                'message': f'{deleted_count} régi backup törölve',
                'deleted_count': deleted_count
            })
        except Exception as e:
            return Response({
                'error': f'Hiba a tisztítás során: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



from .models import Notification
from .serializers import NotificationSerializer


class TicketTopicViewSet(viewsets.ModelViewSet):
    queryset = TicketTopic.objects.all().order_by('sort_order', 'name')
    serializer_class = TicketTopicSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class TicketTypeViewSet(viewsets.ModelViewSet):
    queryset = TicketType.objects.all().order_by('sort_order', 'name')
    serializer_class = TicketTypeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class SiteFeatureViewSet(viewsets.ModelViewSet):
    queryset = SiteFeature.objects.all().order_by('sort_order', 'name')
    serializer_class = SiteFeatureSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class SalesSiteViewSet(viewsets.ModelViewSet):
    queryset = SalesSite.objects.all().prefetch_related('product_classes', 'calculators', 'features').order_by('name')
    serializer_class = SalesSiteSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class ClientPortalUserViewSet(viewsets.ModelViewSet):
    queryset = ClientPortalUser.objects.select_related('company', 'contact').all().order_by('email')
    serializer_class = ClientPortalUserSerializer
    permission_classes = [IsAuthenticated]


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all().select_related('topic', 'created_by').prefetch_related('departments', 'assigned_users', 'messages__attachments')
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _resolve_frontend_base_url(self, request):
        origin = (request.META.get('HTTP_ORIGIN') or '').rstrip('/')
        referer = (request.META.get('HTTP_REFERER') or '').rstrip('/')

        if origin:
            return origin

        if referer:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(referer)
                if parsed.scheme and parsed.netloc:
                    return f"{parsed.scheme}://{parsed.netloc}"
            except Exception:
                pass

        frontend_base = (getattr(settings, 'FRONTEND_BASE_URL', '') or '').rstrip('/')
        if frontend_base:
            return frontend_base

        return request.build_absolute_uri('/').rstrip('/')

    def _send_public_ticket_email(self, request, ticket):
        requester_email = (ticket.requester_email or '').strip()
        if not requester_email:
            return
        if ticket.audience not in ('external', 'both'):
            return
        if not ticket.public_reply_enabled:
            return

        public_url = f"{self._resolve_frontend_base_url(request)}/public/ticket/{ticket.public_token}"

        email_config = EmailServerConfig.objects.filter(is_active=True).first()
        try:
            if email_config:
                connection = get_connection(
                    backend='django.core.mail.backends.smtp.EmailBackend',
                    host=email_config.smtp_host,
                    port=email_config.smtp_port,
                    username=email_config.smtp_username,
                    password=email_config.smtp_password,
                    use_tls=email_config.smtp_use_tls,
                    use_ssl=email_config.smtp_use_ssl,
                    fail_silently=False,
                    timeout=10,
                )
                from_email = f"{email_config.from_name} <{email_config.from_email}>" if email_config.from_name else email_config.from_email
            else:
                logger.info('EmailServerConfig not found, using settings.py EMAIL_* variables for ticket email')
                connection = get_connection(
                    backend=getattr(settings, 'EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend'),
                    host=getattr(settings, 'EMAIL_HOST', ''),
                    port=getattr(settings, 'EMAIL_PORT', 25),
                    username=getattr(settings, 'EMAIL_HOST_USER', ''),
                    password=getattr(settings, 'EMAIL_HOST_PASSWORD', ''),
                    use_tls=getattr(settings, 'EMAIL_USE_TLS', False),
                    use_ssl=getattr(settings, 'EMAIL_USE_SSL', False),
                    fail_silently=False,
                    timeout=10,
                )
                from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '')

            requester_name = (ticket.requester_name or '').strip() or 'Ügyfelünk'
            subject = f"[{ticket.ticket_number}] Jegy rögzítve: {ticket.title}"
            text_body = (
                f"Kedves {requester_name}!\n\n"
                f"A jegyedet rögzítettük.\n"
                f"Jegyszám: {ticket.ticket_number}\n"
                f"Tárgy: {ticket.title}\n\n"
                f"A jegyet itt tudod megtekinteni és követni:\n{public_url}\n\n"
                f"Ez egy automatikusan generált üzenet a PixiERP rendszerből."
            )
            html_body = (
                f"<p>Kedves {requester_name}!</p>"
                f"<p>A jegyedet rögzítettük.</p>"
                f"<p><strong>Jegyszám:</strong> {ticket.ticket_number}<br/>"
                f"<strong>Tárgy:</strong> {ticket.title}</p>"
                f"<p>A jegyet itt tudod megtekinteni és követni:<br/>"
                f"<a href=\"{public_url}\">{public_url}</a></p>"
                f"<p><small>Ez egy automatikusan generált üzenet a PixiERP rendszerből.</small></p>"
            )

            message = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=from_email,
                to=[requester_email],
                connection=connection,
            )
            message.attach_alternative(html_body, 'text/html')
            message.send()
            logger.info(f'Ticket public link email sent to {requester_email} for {ticket.ticket_number}')
        except Exception as exc:
            logger.error(
                f'Ticket public link email failed for {ticket.ticket_number} to {requester_email}: {exc}',
                exc_info=True,
            )

    def _can_manage_status(self, user, ticket):
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.is_staff:
            return True
        if ticket.created_by_id == user.id:
            return True
        return ticket.assigned_users.filter(id=user.id).exists()

    def _can_reply(self, user, ticket):
        return self._can_manage_status(user, ticket)

    def _default_sla_hours(self, priority):
        mapping = {
            'low': (48, 120),
            'normal': (24, 72),
            'high': (8, 24),
            'urgent': (2, 8),
        }
        return mapping.get(priority or 'normal', (24, 72))

    def _notify_users(self, users, title, body, link='/tickets'):
        unique_users = []
        seen = set()
        for user in users:
            if not user or not getattr(user, 'id', None):
                continue
            if user.id in seen:
                continue
            seen.add(user.id)
            unique_users.append(user)

        for user in unique_users:
            Notification.objects.create(
                user=user,
                title=title,
                message=body,
                link=link,
                type='info',
            )

    def _apply_ticket_visibility(self, queryset):
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return queryset

        visibility_query = Q(created_by=user) | Q(assigned_users=user)

        try:
            employee = user.employee_profile
            department_ids = list(employee.departments.values_list('id', flat=True))
            if department_ids:
                visibility_query |= Q(departments__id__in=department_ids)
        except Employee.DoesNotExist:
            pass

        return queryset.filter(visibility_query)

    def _apply_ticket_filters(self, queryset, params, mine_only=False):
        if mine_only:
            queryset = queryset.filter(created_by=self.request.user)

        status_filter = params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        type_filter = params.get('ticket_type')
        if type_filter:
            queryset = queryset.filter(ticket_type=type_filter)

        audience_filter = params.get('audience')
        if audience_filter:
            queryset = queryset.filter(audience=audience_filter)

        topic_filter = params.get('topic')
        if topic_filter:
            queryset = queryset.filter(topic_id=topic_filter)

        department_filter = params.get('department')
        if department_filter:
            queryset = queryset.filter(departments__id=department_filter)

        assigned_to_me = params.get('assigned_to_me')
        if assigned_to_me in ('1', 'true', 'True'):
            queryset = queryset.filter(assigned_users=self.request.user)

        query = (params.get('q') or '').strip()
        if query:
            queryset = queryset.filter(
                Q(ticket_number__icontains=query)
                | Q(title__icontains=query)
                | Q(requester_name__icontains=query)
                | Q(messages__body_html__icontains=query)
            )

        return queryset.distinct().order_by('-created_at')

    def get_queryset(self):
        queryset = self._apply_ticket_visibility(super().get_queryset())
        params = self.request.query_params
        mine_only = params.get('mine_only') in ('1', 'true', 'True')
        return self._apply_ticket_filters(queryset, params, mine_only=mine_only)

    def perform_create(self, serializer):
        now = timezone.now()
        first_response_hours, resolution_hours = self._default_sla_hours(self.request.data.get('priority') or 'normal')
        ticket = serializer.save(
            created_by=self.request.user,
            first_response_due_at=now + timedelta(hours=first_response_hours),
            resolution_due_at=now + timedelta(hours=resolution_hours),
        )
        initial_message_html = self.request.data.get('initial_message_html', '')
        initial_message_html = (initial_message_html or '').strip()

        if initial_message_html:
            message = TicketMessage.objects.create(
                ticket=ticket,
                author=self.request.user,
                body_html=initial_message_html,
            )
            for uploaded_file in self.request.FILES.getlist('files'):
                TicketAttachment.objects.create(
                    message=message,
                    file=uploaded_file,
                    uploaded_by=self.request.user,
                )

        assignees = list(ticket.assigned_users.all())
        if assignees:
            self._notify_users(
                assignees,
                f'Új jegy érkezett: {ticket.ticket_number}',
                ticket.title,
            )

        self._send_public_ticket_email(self.request, ticket)

    def perform_update(self, serializer):
        ticket = self.get_object()
        previous_status = ticket.status
        next_status = self.request.data.get('status', previous_status)

        if next_status != previous_status and not self._can_manage_status(self.request.user, ticket):
            raise PermissionDenied('Nincs jogosultságod a jegy státuszát módosítani.')

        updated_ticket = serializer.save()

        if previous_status != updated_ticket.status:
            TicketStatusLog.objects.create(
                ticket=updated_ticket,
                from_status=previous_status,
                to_status=updated_ticket.status,
                changed_by=self.request.user,
            )

            recipients = list(updated_ticket.assigned_users.all())
            if updated_ticket.created_by:
                recipients.append(updated_ticket.created_by)
            self._notify_users(
                recipients,
                f'Jegy státusz változott: {updated_ticket.ticket_number}',
                f'{previous_status} → {updated_ticket.status}',
            )

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def reply(self, request, pk=None):
        ticket = self.get_object()
        if not self._can_reply(request.user, ticket):
            return Response({'error': 'Nincs jogosultságod válaszolni erre a jegyre.'}, status=status.HTTP_403_FORBIDDEN)
        body_html = (request.data.get('body_html') or '').strip()
        if not body_html:
            return Response({'error': 'Az üzenet szövege kötelező.'}, status=status.HTTP_400_BAD_REQUEST)

        message_obj = TicketMessage.objects.create(
            ticket=ticket,
            author=request.user,
            body_html=body_html,
        )
        for uploaded_file in request.FILES.getlist('files'):
            TicketAttachment.objects.create(
                message=message_obj,
                file=uploaded_file,
                uploaded_by=request.user,
            )

        if not ticket.first_responded_at and ticket.created_by_id and ticket.created_by_id != request.user.id:
            ticket.first_responded_at = timezone.now()

        old_status = ticket.status
        if ticket.status == 'closed':
            ticket.status = 'in_progress'
        elif ticket.status in ('open', 'in_progress') and ticket.created_by_id != request.user.id:
            ticket.status = 'answered'

        update_fields = []
        if ticket.status != old_status:
            update_fields.extend(['status'])
        if ticket.first_responded_at and not ticket.resolved_at and ticket.status in ('answered', 'closed'):
            ticket.resolved_at = timezone.now()
            update_fields.append('resolved_at')
        if ticket.first_responded_at:
            update_fields.append('first_responded_at')

        if update_fields:
            ticket.save(update_fields=list(set(update_fields)))

        if old_status != ticket.status:
            TicketStatusLog.objects.create(
                ticket=ticket,
                from_status=old_status,
                to_status=ticket.status,
                changed_by=request.user,
                note='Automatikus státuszváltás válasz alapján',
            )

        recipients = list(ticket.assigned_users.all())
        if ticket.created_by:
            recipients.append(ticket.created_by)
        self._notify_users(
            recipients,
            f'Új válasz érkezett: {ticket.ticket_number}',
            ticket.title,
        )

        return Response(TicketMessageSerializer(message_obj, context={'request': request}).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        now = timezone.now()

        total = qs.count()
        open_count = qs.filter(status='open').count()
        in_progress_count = qs.filter(status='in_progress').count()
        answered_count = qs.filter(status='answered').count()
        closed_count = qs.filter(status='closed').count()
        overdue_count = qs.filter(
            Q(first_responded_at__isnull=True, first_response_due_at__lt=now)
            | Q(resolved_at__isnull=True, resolution_due_at__lt=now)
        ).count()

        first_response_avg = qs.exclude(first_responded_at__isnull=True).exclude(created_at__isnull=True).annotate(
            diff=F('first_responded_at') - F('created_at')
        ).aggregate(avg=Avg('diff'))['avg']

        resolution_avg = qs.exclude(resolved_at__isnull=True).exclude(created_at__isnull=True).annotate(
            diff=F('resolved_at') - F('created_at')
        ).aggregate(avg=Avg('diff'))['avg']

        def duration_to_hours(value):
            if not value:
                return None
            return round(value.total_seconds() / 3600, 2)

        by_type = list(qs.values('ticket_type').annotate(count=Count('id')).order_by('-count'))

        return Response({
            'total': total,
            'open': open_count,
            'in_progress': in_progress_count,
            'answered': answered_count,
            'closed': closed_count,
            'overdue': overdue_count,
            'avg_first_response_hours': duration_to_hours(first_response_avg),
            'avg_resolution_hours': duration_to_hours(resolution_avg),
            'by_type': by_type,
        })

    @action(detail=False, methods=['get'])
    def my(self, request):
        queryset = self._apply_ticket_filters(super().get_queryset(), request.query_params, mine_only=True)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        ticket = self.get_object()
        if not self._can_manage_status(request.user, ticket):
            return Response({'error': 'Nincs jogosultságod státusz módosítására.'}, status=status.HTTP_403_FORBIDDEN)

        new_status = (request.data.get('status') or '').strip()
        valid_statuses = {choice[0] for choice in Ticket.STATUS_CHOICES}
        if new_status not in valid_statuses:
            return Response({'error': 'Érvénytelen státusz.'}, status=status.HTTP_400_BAD_REQUEST)

        old_status = ticket.status
        if old_status == new_status:
            return Response(TicketSerializer(ticket, context={'request': request}).data)

        ticket.status = new_status
        ticket.save()

        TicketStatusLog.objects.create(
            ticket=ticket,
            from_status=old_status,
            to_status=new_status,
            changed_by=request.user,
            note=request.data.get('note', ''),
        )

        recipients = list(ticket.assigned_users.all())
        if ticket.created_by:
            recipients.append(ticket.created_by)
        self._notify_users(
            recipients,
            f'Jegy státusz frissítve: {ticket.ticket_number}',
            f'{old_status} → {new_status}',
        )

        return Response(TicketSerializer(ticket, context={'request': request}).data)


class PublicTicketView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            ticket = Ticket.objects.select_related('topic').prefetch_related('messages__attachments').get(public_token=token)
        except Ticket.DoesNotExist:
            return Response({'error': 'Jegy nem található.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = TicketSerializer(ticket, context={'request': request})
        return Response(serializer.data)


class PublicTicketReplyView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, token):
        try:
            ticket = Ticket.objects.get(public_token=token)
        except Ticket.DoesNotExist:
            return Response({'error': 'Jegy nem található.'}, status=status.HTTP_404_NOT_FOUND)

        if not ticket.public_reply_enabled:
            return Response({'error': 'Erre a jegyre publikus válasz nem engedélyezett.'}, status=status.HTTP_403_FORBIDDEN)

        body_html = (request.data.get('body_html') or '').strip()
        if not body_html:
            return Response({'error': 'Az üzenet szövege kötelező.'}, status=status.HTTP_400_BAD_REQUEST)

        author_name = (request.data.get('author_name') or '').strip()
        author_email = (request.data.get('author_email') or '').strip()

        message_obj = TicketMessage.objects.create(
            ticket=ticket,
            author=None,
            author_name=author_name,
            author_email=author_email,
            body_html=body_html,
        )

        for uploaded_file in request.FILES.getlist('files'):
            TicketAttachment.objects.create(
                message=message_obj,
                file=uploaded_file,
                uploaded_by=None,
            )

        if not ticket.first_responded_at:
            ticket.first_responded_at = timezone.now()

        old_status = ticket.status
        if ticket.status == 'closed':
            ticket.status = 'in_progress'
        elif ticket.status in ('open', 'in_progress'):
            ticket.status = 'answered'

        ticket.save()

        if old_status != ticket.status:
            TicketStatusLog.objects.create(
                ticket=ticket,
                from_status=old_status,
                to_status=ticket.status,
                changed_by=None,
                note='Publikus válasz alapján',
            )

        recipients = list(ticket.assigned_users.all())
        if ticket.created_by:
            recipients.append(ticket.created_by)

        seen_user_ids = set()
        deduped_recipients = []
        for user in recipients:
            if not user:
                continue
            if user.id in seen_user_ids:
                continue
            seen_user_ids.add(user.id)
            deduped_recipients.append(user)

        for user in deduped_recipients:
            Notification.objects.create(
                user=user,
                title=f'Külsős válasz érkezett: {ticket.ticket_number}',
                message=ticket.title,
                link='/tickets',
                type='info',
            )

        return Response(TicketMessageSerializer(message_obj, context={'request': request}).data)


class NotificationViewSet(viewsets.ModelViewSet):
    """Értesítések kezelése"""
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)
    
    @action(detail=False, methods=['get'], url_path='unread-counts')
    def unread_counts(self, request):
        """Olvasatlan értesítések száma kategóriánként"""
        unread = self.get_queryset().filter(is_read=False)
        counts = {}
        
        # Helper to map link to menu key
        def get_menu_key(link):
            if not link: return '/other'
            # Assuming links match frontend paths mostly
            # e.g "/manufacturing/projects/1" -> "/manufacturing/projects"
            parts = link.strip('/').split('/')
            if len(parts) >= 2:
                return f"/{parts[0]}/{parts[1]}"
            if len(parts) >= 1:
                return f"/{parts[0]}"
            return '/other'

        for note in unread:
            key = get_menu_key(note.link)
            counts[key] = counts.get(key, 0) + 1
            
        return Response(counts)

    @action(detail=False, methods=['post'], url_path='mark-read-by-link')
    def mark_read_by_link(self, request):
        link = request.data.get('link')
        if not link:
            return Response({'error': 'Link required'}, status=400)
            
        updated = self.get_queryset().filter(link=link, is_read=False).update(is_read=True)
        return Response({'updated': updated})

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        note = self.get_object()
        note.is_read = True
        note.save()
        return Response({'status': 'read'})


class RoleViewSet(viewsets.ModelViewSet):
    """Szerepkörök kezelése"""
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def set_permissions(self, request, pk=None):
        """Szerepkör jogosultságainak beállítása"""
        role = self.get_object()
        permissions_data = request.data.get('permissions', [])
        
        # Töröljük a meglévő jogosultságokat (ha nem rendszer szerepkör)
        if not role.is_system or request.user.is_superuser:
            role.permissions.all().delete()
            
            # Új jogosultságok létrehozása
            for perm_data in permissions_data:
                Permission.objects.create(
                    role=role,
                    module=perm_data['module'],
                    action=perm_data['action'],
                    resource=perm_data.get('resource', ''),
                    allowed=perm_data.get('allowed', True)
                )
            
            return Response({'message': 'Jogosultságok frissítve'})
        else:
            return Response(
                {'error': 'Rendszer szerepkör jogosultságai csak superuser által módosíthatók'},
                status=status.HTTP_403_FORBIDDEN
            )


class PermissionViewSet(viewsets.ModelViewSet):
    """Jogosultságok kezelése"""
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        role_id = self.request.query_params.get('role')
        user_id = self.request.query_params.get('user')
        
        if role_id:
            queryset = queryset.filter(role_id=role_id)
        if user_id:
            queryset = queryset.filter(user_id=user_id)
            
        return queryset
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def modules(self, request):
        """Elérhető modulok, almodulok és műveletek listája"""
        # Modulok és almodulok csoportosítása
        modules_with_resources = {}
        for resource_value, resource_label in Permission.RESOURCE_CHOICES:
            module_code = resource_value.split('.')[0]
            module_name = dict(Permission.MODULE_CHOICES).get(module_code, module_code)
            
            if module_code not in modules_with_resources:
                modules_with_resources[module_code] = {
                    'code': module_code,
                    'name': module_name,
                    'resources': []
                }
            
            modules_with_resources[module_code]['resources'].append({
                'value': resource_value,
                'label': resource_label
            })
        
        return Response({
            'modules': [
                {'value': choice[0], 'label': choice[1]}
                for choice in Permission.MODULE_CHOICES
            ],
            'resources': modules_with_resources,
            'actions': [
                {'value': choice[0], 'label': choice[1]}
                for choice in Permission.ACTION_CHOICES
            ]
        })


class UserRoleViewSet(viewsets.ModelViewSet):
    """Felhasználó-Szerepkör hozzárendelések kezelése"""
    queryset = UserRole.objects.all()
    serializer_class = UserRoleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user_id = self.request.query_params.get('user')
        
        if user_id:
            queryset = queryset.filter(user_id=user_id)
            
        return queryset
    
    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

from .models import Zone
from .serializers import ZoneSerializer

class IoTDeviceViewSet(viewsets.ModelViewSet):
    from .models import IoTDevice as _IoTDevice
    from .serializers import IoTDeviceSerializer as _IoTDeviceSerializer
    queryset = None
    serializer_class = None
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        from .models import IoTDevice
        return IoTDevice.objects.all()

    def get_serializer_class(self):
        from .serializers import IoTDeviceSerializer
        return IoTDeviceSerializer

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Kapcsolat teszt — megpinggeli az eszközt"""
        device = self.get_object()
        if device.device_type == 'shelly_1mini_gen3_relay':
            import requests as req
            url = f"http://{device.shelly_host}/rpc/Shelly.GetStatus"
            try:
                auth = None
                if device.shelly_auth_user:
                    auth = (device.shelly_auth_user, device.shelly_auth_pass)
                r = req.get(url, auth=auth, timeout=5)
                r.raise_for_status()
                return Response({'success': True, 'status': r.json()})
            except Exception as e:
                return Response({'success': False, 'error': str(e)}, status=400)
        return Response({'error': 'Ismeretlen eszköz típus'}, status=400)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Aktivál egy konkrét csatornát (pulzus)"""
        device = self.get_object()
        channel = int(request.data.get('channel', device.shelly_channel))
        if device.device_type == 'shelly_1mini_gen3_relay':
            import requests as req
            url = f"http://{device.shelly_host}/rpc/Switch.Set"
            settings = device.type_settings if isinstance(device.type_settings, dict) else {}
            pulse_ms = int(settings.get('pulse_ms', 1000))
            payload = {
                'id': channel,
                'on': True,
                'toggle_after': pulse_ms / 1000,
            }
            try:
                auth = None
                if device.shelly_auth_user:
                    auth = (device.shelly_auth_user, device.shelly_auth_pass)
                r = req.post(url, json=payload, auth=auth, timeout=5)
                r.raise_for_status()
                return Response({'success': True, 'result': r.json()})
            except Exception as e:
                return Response({'success': False, 'error': str(e)}, status=400)
        return Response({'error': 'Ismeretlen eszköz típus'}, status=400)


def _verify_ntag424_sun(enc_picc_hex: str, cmac_hex: str, key_hex: str):
    """
    NTAG424 DNA SUN (Secure Unique NFC / SDM) hitelesítés ellenőrzése.
    NXP AN12196 és a libsdm referencia-implementáció alapján.

    Visszatér: (valid: bool, read_counter: int)

    Paraméterek:
      enc_picc_hex  — 32 hex kar. (16 bájt) titkosított PICC adat (?e= query param)
      cmac_hex      — 16 hex kar. (8 bájt) csonkított MAC  (?m= query param)
      key_hex       — 32 hex kar. (16 bájt) AES-128 kulcs   (tag.sun_key)

    Konfiguráció (TagWriter által a tagre írva):
      - SDMMetaReadKey = SDMFileReadKey = sun_key (ugyanaz a kulcs mindkettőhöz)
      - SDMMACInputOffset = SDMMACOffset (nincs titkosított file adat, csak PICC+CMAC mirror)
    """
    try:
        from Crypto.Cipher import AES
        from Crypto.Hash import CMAC as _CMAC

        if len(enc_picc_hex) != 32 or len(cmac_hex) != 16 or len(key_hex) != 32:
            return False, 0

        key = bytes.fromhex(key_hex)
        enc_picc = bytes.fromhex(enc_picc_hex)
        cmac_recv = bytes.fromhex(cmac_hex)

        # 1. lépés: EncPICCData visszafejtése (AES-CBC, IV=0, kulcs=sun_key)
        cipher = AES.new(key, AES.MODE_CBC, iv=bytes(16))
        picc_data = cipher.decrypt(enc_picc)

        # picc_data[0] = 0xC7 (NTAG424 DNA jelölő)
        # picc_data[1:8] = UID (7 bájt)
        # picc_data[8:11] = ReadCounter (3 bájt, little-endian)
        if picc_data[0] != 0xC7:
            return False, 0

        uid = picc_data[1:8]
        read_ctr_bytes = picc_data[8:11]
        read_ctr = int.from_bytes(read_ctr_bytes, 'little')

        # 2. lépés: session MAC kulcs levezetése
        # SV2 = 0x3C || 0xC3 || 0x00 || 0x01 || 0x00 || 0x80 || UID || ReadCtr
        sv2 = bytes([0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80]) + uid + read_ctr_bytes
        cobj = _CMAC.new(key, ciphermod=AES)
        cobj.update(sv2)
        session_mac_key = cobj.digest()

        # 3. lépés: várt CMAC kiszámítása (üres input, páratlan indexű bájtok)
        cobj2 = _CMAC.new(session_mac_key, ciphermod=AES)
        cobj2.update(b'')
        full_mac = cobj2.digest()
        expected_cmac = bytes(full_mac[i] for i in range(1, 16, 2))  # 8 bájt

        if expected_cmac != cmac_recv:
            return False, 0

        return True, read_ctr

    except Exception:
        return False, 0


class NfcTagViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        from .models import NfcTag
        return NfcTag.objects.select_related('iot_device').all()

    def get_serializer_class(self):
        from .serializers import NfcTagSerializer
        return NfcTagSerializer

    @action(detail=True, methods=['get', 'post'], permission_classes=[])
    def trigger(self, request, pk=None):
        """Public endpoint — NFC tag URL-be írva. Aktiválja a csatolt IoT eszköz csatornáját."""

        def _resp(success, title, detail, status_code=200):
            """Böngészőből (telefon) HTML-t, API-ból JSON-t ad vissza."""
            if 'text/html' in request.META.get('HTTP_ACCEPT', ''):
                from django.http import HttpResponse
                bg = '#f0fdf4' if success else '#fef2f2'
                hc = '#16a34a' if success else '#dc2626'
                icon = '✓' if success else '✗'
                html = (
                    f'<!DOCTYPE html><html><head><meta charset="utf-8">'
                    f'<meta name="viewport" content="width=device-width,initial-scale=1">'
                    f'<title>{title}</title>'
                    f'<style>body{{margin:0;font-family:-apple-system,sans-serif;background:{bg};'
                    f'display:flex;align-items:center;justify-content:center;min-height:100vh}}'
                    f'.box{{text-align:center;padding:32px 24px}}'
                    f'.icon{{font-size:64px;margin-bottom:16px}}'
                    f'h1{{color:{hc};margin:0 0 8px;font-size:24px}}'
                    f'p{{color:#555;margin:0;font-size:15px}}</style></head>'
                    f'<body><div class="box"><div class="icon">{icon}</div>'
                    f'<h1>{title}</h1><p>{detail}</p></div></body></html>'
                )
                return HttpResponse(html, status=status_code, content_type='text/html; charset=utf-8')
            data = {'success': success, 'message': detail} if success else {'error': detail}
            return Response(data, status=status_code)

        def _redirect_to_login(trigger_url):
            """Bejelentkezési oldalra irányítja a felhasználót, visszatérési URL-lel."""
            from django.http import HttpResponse
            frontend_base = getattr(settings, 'FRONTEND_BASE_URL', '').rstrip('/')
            login_url = f'{frontend_base}/login?next={trigger_url}'
            html = (
                f'<!DOCTYPE html><html><head><meta charset="utf-8">'
                f'<meta name="viewport" content="width=device-width,initial-scale=1">'
                f'<title>Bejelentkezés szükséges</title>'
                f'<style>body{{margin:0;font-family:-apple-system,sans-serif;background:#fffbeb;'
                f'display:flex;align-items:center;justify-content:center;min-height:100vh}}'
                f'.box{{text-align:center;padding:32px 24px}}'
                f'.icon{{font-size:64px;margin-bottom:16px}}'
                f'h1{{color:#d97706;margin:0 0 8px;font-size:24px}}'
                f'p{{color:#555;margin:0 0 20px;font-size:15px}}'
                f'a{{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;'
                f'padding:12px 28px;border-radius:8px;font-size:16px;font-weight:600}}</style></head>'
                f'<body><div class="box"><div class="icon">🔐</div>'
                f'<h1>Bejelentkezés szükséges</h1>'
                f'<p>Az NFC tag aktiválásához be kell jelentkezned.</p>'
                f'<a href="{login_url}">Bejelentkezés</a>'
                f'</div></body></html>'
            )
            return HttpResponse(html, status=401, content_type='text/html; charset=utf-8')

        tag = self.get_object()
        if not tag.is_active:
            return _resp(False, 'Inaktív tag', 'Ez az NFC tag jelenleg nincs aktiválva.', 403)

        # Bejelentkezés ellenőrzése
        if not request.user or not request.user.is_authenticated:
            trigger_url = request.build_absolute_uri()
            if 'text/html' in request.META.get('HTTP_ACCEPT', ''):
                return _redirect_to_login(trigger_url)
            return Response({'error': 'Bejelentkezés szükséges'}, status=401)

        # HR osztály jogosultság ellenőrzése az IoT eszközön
        device_for_auth = tag.iot_device
        if device_for_auth and device_for_auth.allowed_departments.exists():
            user = request.user
            # Superuser mindent elér
            if not user.is_superuser:
                try:
                    user_dept_ids = set(user.employee_profile.departments.values_list('id', flat=True))
                except Exception:
                    user_dept_ids = set()
                allowed_ids = set(device_for_auth.allowed_departments.values_list('id', flat=True))
                if not user_dept_ids.intersection(allowed_ids):
                    dept_names = ', '.join(device_for_auth.allowed_departments.values_list('name', flat=True))
                    return _resp(False, 'Nincs jogosultságod', f'Ehhez az eszközhöz csak a következő osztályok tagjai férhetnek hozzá: {dept_names}.', 403)

        # NTAG424 SUN (Secure Unique NFC) ellenőrzés
        if tag.tag_type == 'ntag424':
            if not tag.sun_key:
                return _resp(False, 'Konfiguráció hiányzik', 'Az NFC tag nincs helyesen konfigurálva: SUN kulcs hiányzik. Állítsd be a rendszerben.', 400)
            enc_picc = request.query_params.get('e', '')
            cmac_recv = request.query_params.get('m', '')
            if not enc_picc or not cmac_recv:
                return _resp(False, 'Helytelen NFC tag konfiguráció', 'A tag nem küldi a biztonsági paramétereket (?e= és ?m=). Állítsd be az SDM mirroringet a TagWriterben az útmutató szerint.', 400)
            valid, counter = _verify_ntag424_sun(enc_picc, cmac_recv, tag.sun_key)
            if not valid:
                return _resp(False, 'Érvénytelen hitelesítés', 'A tag kriptográfiai ellenőrzése sikertelen. Ellenőrizd a SUN AES kulcsot a rendszerben és a tagben.', 403)
            if counter <= tag.last_counter:
                return _resp(False, 'Visszajátszott tap', 'Ez a tap már fel lett használva (replay védelem). Érintsd újra a taget.', 403)
            # Számláló mentése — aktiválás előtt
            type(tag).objects.filter(pk=tag.pk).update(last_counter=counter)

        device = tag.iot_device
        if not device:
            return _resp(False, 'Konfiguráció hiányzik', 'Nincs IoT eszköz rendelve ehhez a taghez.', 400)
        if device.device_type == 'shelly_1mini_gen3_relay':
            import requests as req
            url = f"http://{device.shelly_host}/rpc/Switch.Set"
            s = device.type_settings if isinstance(device.type_settings, dict) else {}
            pulse_ms = int(s.get('pulse_ms', 1000))
            payload = {'id': tag.iot_channel, 'on': True, 'toggle_after': pulse_ms / 1000}
            try:
                auth = None
                if device.shelly_auth_user:
                    auth = (device.shelly_auth_user, device.shelly_auth_pass)
                r = req.post(url, json=payload, auth=auth, timeout=5)
                r.raise_for_status()
                return _resp(True, 'Aktiválva', f'A relé sikeresen aktiválva ({tag.name}).', 200)
            except Exception as e:
                return _resp(False, 'Eszköz hiba', f'Az IoT eszköz nem elérhető: {e}', 400)
        return _resp(False, 'Ismeretlen eszköz', 'Ismeretlen IoT eszköz típus.', 400)


class ZoneViewSet(viewsets.ModelViewSet):
    queryset = Zone.objects.all()
    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    @action(detail=False, methods=['get'])
    def next_number(self, request):
        """Generate next zone number"""
        import re
        last_zone = Zone.objects.order_by('-id').first() # Or order by zone_number logic
        
        # Simple auto-increment logic based on numeric ending
        next_num = 1
        prefix = "Z"
        
        if last_zone and last_zone.zone_number:
            # Try to extract number
            match = re.search(r'(\d+)$', last_zone.zone_number)
            if match:
                num_part = match.group(1)
                prefix = last_zone.zone_number[:match.start()]
                next_num = int(num_part) + 1
                
        return Response({'next_number': f"{prefix}{next_num:03d}"})


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing activity logs"""
    queryset = ActivityLog.objects.all()
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['user', 'action', 'content_type']
    search_fields = ['description', 'user__first_name', 'user__last_name', 'user__username']
    ordering_fields = ['timestamp', 'user', 'action']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        """Filter activity logs with date range and user filters"""
        queryset = super().get_queryset()
        
        # Date filtering
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
        if date_to:
            queryset = queryset.filter(timestamp__lte=date_to)
        
        # User filtering
        user_id = self.request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        # Content type and object filtering for related object logs
        content_type_id = self.request.query_params.get('content_type_id')
        object_id = self.request.query_params.get('object_id')
        
        if content_type_id and object_id:
            queryset = queryset.filter(content_type_id=content_type_id, object_id=object_id)
        
        return queryset.select_related('user', 'content_type')


User = get_user_model()


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """Simple user list for dropdowns and selections"""
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        return User.objects.filter(is_active=True).order_by('username')


class PublicSiteConfigView(APIView):
    permission_classes = [AllowAny]

    def _get_or_create(self):
        cfg = PublicSiteConfig.objects.filter(is_active=True).first()
        if cfg:
            return cfg
        return PublicSiteConfig.objects.create(is_active=True)

    def get(self, request):
        cfg = self._get_or_create()
        return Response(PublicSiteConfigSerializer(cfg).data)

    def put(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Hitelesítés szükséges'}, status=status.HTTP_401_UNAUTHORIZED)
        cfg = self._get_or_create()
        serializer = PublicSiteConfigSerializer(cfg, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Hitelesítés szükséges'}, status=status.HTTP_401_UNAUTHORIZED)
        cfg = self._get_or_create()
        serializer = PublicSiteConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PublicSiteResolveView(APIView):
    permission_classes = [AllowAny]

    def _normalize_domain(self, value):
        domain = (value or '').strip().lower()
        if not domain:
            return ''
        if '://' in domain:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(domain)
                domain = parsed.netloc or parsed.path
            except Exception:
                pass
        if ':' in domain:
            domain = domain.split(':')[0]
        return domain

    def _resolve_site(self, host_or_key):
        normalized_key = self._normalize_domain(host_or_key)
        raw_key = (host_or_key or '').strip().lower()
        active_sites = SalesSite.objects.filter(is_active=True).prefetch_related('product_classes', 'calculators', 'features')
        for site in active_sites:
            site_slug = (site.slug or '').strip().lower()
            if raw_key and site_slug == raw_key:
                return site

            domains = site.domains if isinstance(site.domains, list) else []
            normalized_domains = [self._normalize_domain(item) for item in domains if item]
            if normalized_key and normalized_key in normalized_domains:
                return site
        return active_sites.first()

    def get(self, request):
        query_key = request.query_params.get('key')
        host = request.query_params.get('host') or request.META.get('HTTP_HOST') or request.get_host()
        site = self._resolve_site(query_key or host)
        if site:
            return Response({
                'mode': 'sales_site',
                'site': SalesSiteSerializer(site).data,
            })

        cfg = PublicSiteConfig.objects.filter(is_active=True).first()
        if cfg:
            return Response({
                'mode': 'legacy_config',
                'site': PublicSiteConfigSerializer(cfg).data,
            })

        return Response({'mode': 'empty', 'site': None})


class ClientPortalSessionMixin:
    def _extract_token(self, request):
        auth = (request.META.get('HTTP_AUTHORIZATION') or '').strip()
        if auth.lower().startswith('bearer '):
            return auth[7:].strip()
        return (request.META.get('HTTP_X_PORTAL_TOKEN') or '').strip()

    def get_portal_session(self, request):
        token = self._extract_token(request)
        if not token:
            return None
        try:
            session = ClientPortalSession.objects.select_related('user', 'user__company', 'user__contact').get(token=token)
        except ClientPortalSession.DoesNotExist:
            return None
        if not session.is_active or not session.user.is_active:
            return None
        return session


class ClientPortalLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        password = request.data.get('password') or ''
        if not email or not password:
            return Response({'error': 'E-mail és jelszó kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        user = ClientPortalUser.objects.filter(email__iexact=email, is_active=True).first()
        if not user or not user.check_password(password):
            return Response({'error': 'Hibás e-mail vagy jelszó'}, status=status.HTTP_401_UNAUTHORIZED)

        expires_at = timezone.now() + timedelta(days=7)
        session = ClientPortalSession.objects.create(user=user, expires_at=expires_at)
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        return Response({
            'token': str(session.token),
            'expires_at': session.expires_at,
            'user': ClientPortalUserSerializer(user).data,
        })


class ClientPortalMeView(APIView, ClientPortalSessionMixin):
    permission_classes = [AllowAny]

    def get(self, request):
        session = self.get_portal_session(request)
        if not session:
            return Response({'error': 'Érvénytelen vagy lejárt portál session'}, status=status.HTTP_401_UNAUTHORIZED)

        cfg = PublicSiteConfig.objects.filter(is_active=True).first()
        return Response({
            'user': ClientPortalUserSerializer(session.user).data,
            'site': PublicSiteConfigSerializer(cfg).data if cfg else None,
        })


class ClientPortalLogoutView(APIView, ClientPortalSessionMixin):
    permission_classes = [AllowAny]

    def post(self, request):
        session = self.get_portal_session(request)
        if session and not session.revoked_at:
            session.revoked_at = timezone.now()
            session.save(update_fields=['revoked_at'])
        return Response({'message': 'Kijelentkezve'})


class ClientPortalDashboardView(APIView, ClientPortalSessionMixin):
    permission_classes = [AllowAny]

    def get(self, request):
        from apps.sales.models import QuoteRequest, CustomerOrder, DeliveryNote

        session = self.get_portal_session(request)
        if not session:
            return Response({'error': 'Érvénytelen vagy lejárt portál session'}, status=status.HTTP_401_UNAUTHORIZED)

        portal_user = session.user
        quote_q = Q()
        if portal_user.company_id:
            quote_q |= Q(company_id=portal_user.company_id)
        if portal_user.contact_id:
            quote_q |= Q(contacts__id=portal_user.contact_id)
        if portal_user.email:
            quote_q |= Q(contacts__email__iexact=portal_user.email)

        quotes_qs = QuoteRequest.objects.filter(quote_q).distinct().order_by('-created_at') if quote_q else QuoteRequest.objects.none()
        orders_qs = CustomerOrder.objects.filter(quote_request__in=quotes_qs).select_related('quote_request').distinct().order_by('-created_at')

        delivery_q = Q()
        if portal_user.company_id:
            delivery_q |= Q(customer_id=portal_user.company_id)
        if portal_user.contact_id:
            delivery_q |= Q(contact_id=portal_user.contact_id)
        if portal_user.email:
            delivery_q |= Q(contact__email__iexact=portal_user.email)
        delivery_qs = DeliveryNote.objects.filter(delivery_q).distinct().order_by('-created_at') if delivery_q else DeliveryNote.objects.none()

        invoices = []
        for order in orders_qs.exclude(invoice_number__isnull=True).exclude(invoice_number='')[:50]:
            invoices.append({
                'order_number': order.order_number,
                'invoice_number': order.invoice_number,
                'status': order.status,
                'order_date': order.order_date,
            })

        tickets_qs = Ticket.objects.filter(requester_email__iexact=portal_user.email).order_by('-created_at')

        return Response({
            'quotes': list(quotes_qs.values('id', 'number', 'request_number', 'title', 'status', 'issue_date')[:50]),
            'orders': list(orders_qs.values('id', 'order_number', 'status', 'order_date', 'delivery_note_number', 'invoice_number')[:50]),
            'delivery_notes': list(delivery_qs.values('id', 'delivery_note_number', 'issue_date', 'delivery_date', 'is_confirmed', 'public_token')[:50]),
            'invoices': invoices,
            'tickets': list(tickets_qs.values('id', 'ticket_number', 'title', 'status', 'priority', 'created_at')[:50]),
        })


class ClientPortalTicketCreateView(APIView, ClientPortalSessionMixin):
    permission_classes = [AllowAny]

    def post(self, request):
        session = self.get_portal_session(request)
        if not session:
            return Response({'error': 'Érvénytelen vagy lejárt portál session'}, status=status.HTTP_401_UNAUTHORIZED)

        title = (request.data.get('title') or '').strip()
        body_html = (request.data.get('body_html') or '').strip()
        ticket_type = (request.data.get('ticket_type') or 'other').strip() or 'other'
        priority = (request.data.get('priority') or 'normal').strip() or 'normal'

        if not title or not body_html:
            return Response({'error': 'Cím és üzenet kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        portal_user = session.user
        now = timezone.now()
        first_response_due_at = now + timedelta(hours=24)
        resolution_due_at = now + timedelta(hours=72)

        ticket = Ticket.objects.create(
            title=title,
            ticket_type=ticket_type,
            priority=priority,
            audience='external',
            requester_name=portal_user.full_name,
            requester_email=portal_user.email,
            public_reply_enabled=True,
            first_response_due_at=first_response_due_at,
            resolution_due_at=resolution_due_at,
        )

        TicketMessage.objects.create(
            ticket=ticket,
            author=None,
            author_name=portal_user.full_name,
            author_email=portal_user.email,
            body_html=body_html,
        )

        return Response(TicketSerializer(ticket, context={'request': request}).data, status=status.HTTP_201_CREATED)
