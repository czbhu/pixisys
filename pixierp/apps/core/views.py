from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from django.contrib.auth import authenticate, get_user_model
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
from django.http import HttpResponse
from .serializers import (
    UserSerializer,
    EmailServerConfigSerializer,
    EmailTemplateSerializer,
    SignatureTemplateSerializer,
    PixinvoiceConfigSerializer,
    BackupConfigurationSerializer,
    BackupFileSerializer,
)
from rest_framework import viewsets
from .models import EmailServerConfig, EmailTemplate, SignatureTemplate, PixinvoiceConfig, BackupConfiguration, BackupFile
import traceback
import requests
import json
import tempfile
from io import StringIO


User = get_user_model()

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
@permission_classes([AllowAny])
def login_view(request):
    """User login endpoint - accepts email or username"""
    email = request.data.get('email')
    password = request.data.get('password')
    
    if not email or not password:
        return Response(
            {'error': 'Email and password are required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Try to find user by email first, then by username (for backward compatibility)
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
            'user': UserSerializer(user).data,
            'tokens': {
                'access': str(refresh.access_token),
                'refresh': str(refresh)
            }
        })
    else:
        return Response(
            {'error': 'Invalid credentials'}, 
            status=status.HTTP_401_UNAUTHORIZED
        )

@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    """User registration endpoint"""
    data = request.data
    email = data.get('email')
    
    # Check if user already exists by email
    if User.objects.filter(email=email).exists():
        return Response(
            {'error': 'Email already exists'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Create user with email as username
    user = User.objects.create(
        username=email,  # Use email as username
        email=email,
        first_name=data.get('first_name', ''),
        last_name=data.get('last_name', ''),
        password=make_password(data.get('password'))
    )
    
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user).data,
        'tokens': {
            'access': str(refresh.access_token),
            'refresh': str(refresh)
        }
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """User logout endpoint"""
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        return Response({'message': 'Successfully logged out'})
    except Exception as e:
        return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)

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
    email = (request.data.get('email') or '').strip()
    if not email:
        return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        base = (getattr(settings, 'FRONTEND_BASE_URL', '') or '').rstrip('/')
        if not base:
            base = request.build_absolute_uri('/').rstrip('/')
        reset_link = f"{base}/reset-password/{uid}/{token}"

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
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
            to=[email],
        )
        message.send(fail_silently=False)

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
            
            # SMTP kapcsolat létrehozása
            connection = get_connection(
                host=email_server.smtp_host,
                port=email_server.smtp_port,
                username=email_server.smtp_username,
                password=email_server.smtp_password,
                use_tls=email_server.smtp_use_tls,
                use_ssl=email_server.smtp_use_ssl,
                fail_silently=False,
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
            msg.send()
            log_messages.append("Email sikeresen elküldve!")
            
            return Response({
                'success': True,
                'message': f'Teszt email sikeresen elküldve a {recipient} címre',
                'log': log_messages
            })
            
        except Exception as e:
            error_trace = traceback.format_exc()
            log_messages.append(f"HIBA: {str(e)}")
            log_messages.append(f"Részletes hiba:\n{error_trace}")
            
            return Response({
                'success': False,
                'error': str(e),
                'log': log_messages,
                'traceback': error_trace
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EmailTemplateViewSet(viewsets.ModelViewSet):
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsAuthenticated]


class SignatureTemplateViewSet(viewsets.ModelViewSet):
    queryset = SignatureTemplate.objects.all()
    serializer_class = SignatureTemplateSerializer
    permission_classes = [IsAuthenticated]


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
        """Create a manual backup"""
        import os
        from django.conf import settings
        
        try:
            # Create backups directory if not exists
            backup_dir = os.path.join(settings.BASE_DIR, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            
            # Generate filename
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            filename = f'manual_backup_{timestamp}.sqlite3'
            filepath = os.path.join(backup_dir, filename)
            
            # Copy database file
            import shutil
            db_path = settings.DATABASES['default']['NAME']
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
        from django.conf import settings
        
        try:
            backup = self.get_object()
            
            if not os.path.exists(backup.filepath):
                return Response({
                    'error': 'A backup fájl nem található'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Create a backup of current database before restore
            db_path = settings.DATABASES['default']['NAME']
            current_backup = f"{db_path}.before-restore-{timezone.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(db_path, current_backup)
            
            # Restore from backup
            shutil.copy2(backup.filepath, db_path)
            
            return Response({
                'message': 'Adatbázis sikeresen visszaállítva. Kérjük jelentkezzen be újra.',
                'current_backup': current_backup
            })
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
