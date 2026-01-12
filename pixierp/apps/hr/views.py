from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from django.utils.crypto import get_random_string
from django.conf import settings
from datetime import datetime, date, timedelta
from django.db.models import Min, Max, Q
from calendar import monthrange
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

from apps.core.permissions import OwnDataFilterMixin
from .models import Department, Position, Employee, Attendance, LeaveRequest, Payroll, AccessLog
from .serializers import (
    DepartmentSerializer, PositionSerializer, EmployeeSerializer,
    AttendanceSerializer, LeaveRequestSerializer, PayrollSerializer, AttendanceReportSerializer
)

User = get_user_model()


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.order_by('name')
    serializer_class = DepartmentSerializer


class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.order_by('title', 'department__name')
    serializer_class = PositionSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.order_by('user__last_name', 'user__first_name', 'employee_id')
    serializer_class = EmployeeSerializer
    
    @action(detail=True, methods=['get', 'post'])
    def custom_permissions(self, request, pk=None):
        """Egyéni jogosultságok kezelése (nem szerepkör alapú)"""
        from apps.core.models import Permission
        from apps.core.serializers import PermissionSerializer
        
        employee = self.get_object()
        
        if request.method == 'GET':
            # Egyéni jogosultságok lekérdezése
            permissions = Permission.objects.filter(user=employee.user)
            serializer = PermissionSerializer(permissions, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            # Egyéni jogosultságok beállítása
            permissions_data = request.data.get('permissions', [])
            
            # Töröljük a meglévő egyéni jogosultságokat
            Permission.objects.filter(user=employee.user).delete()
            
            # Új egyéni jogosultságok létrehozása
            for perm_data in permissions_data:
                Permission.objects.create(
                    user=employee.user,
                    module=perm_data['module'],
                    resource=perm_data.get('resource'),
                    action=perm_data['action'],
                    allowed=perm_data.get('allowed', True)
                )
            
            return Response({'message': 'Egyéni jogosultságok frissítve'})
    
    @action(detail=True, methods=['post'])
    def generate_password(self, request, pk=None):
        """Jelszó generálása és e-mail küldése"""
        from django.core.mail import get_connection, EmailMultiAlternatives
        from apps.core.models import EmailServerConfig
        
        employee = self.get_object()
        
        # Új jelszó generálása
        new_password = get_random_string(12)
        
        # User jelszó frissítése (hashelve)
        user = employee.user
        user.set_password(new_password)
        user.save()
        
        # E-mail küldése (ha van SMTP konfigurálva)
        try:
            # EmailServerConfig használata - ugyanaz mint a teszt email
            email_config = EmailServerConfig.objects.filter(is_active=True).first()
            if not email_config:
                return Response(
                    {'message': 'Jelszó generálva, de nincs aktív email szerver konfiguráció'},
                    status=status.HTTP_206_PARTIAL_CONTENT
                )
            
            # SMTP kapcsolat létrehozása - explicit backend használattal
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
            
            html_content = f"""
            <html>
                <body>
                    <h2>PixiERP - Új jelszó</h2>
                    <p>Tisztelt {user.get_full_name() or user.username}!</p>
                    <p>Az Ön új jelszava:</p>
                    <p style="font-size: 18px; font-weight: bold; background: #f0f0f0; padding: 10px;">{new_password}</p>
                    <p>Kérjük, jelentkezzen be a rendszerbe és változtassa meg ezt a jelszót egy saját, biztonságos jelszóra.</p>
                    <hr>
                    <p><small>Ez egy automatikusan generált üzenet a PixiERP rendszerből.</small></p>
                </body>
            </html>
            """
            
            text_content = f"""
PixiERP - Új jelszó

Tisztelt {user.get_full_name() or user.username}!

Az Ön új jelszava: {new_password}

Kérjük, jelentkezzen be a rendszerbe és változtassa meg ezt a jelszót egy saját, biztonságos jelszóra.

---
Ez egy automatikusan generált üzenet a PixiERP rendszerből.
            """
            
            msg = EmailMultiAlternatives(
                subject='Új jelszó - PixiERP',
                body=text_content,
                from_email=from_email,
                to=[user.email],
                connection=connection
            )
            msg.attach_alternative(html_content, "text/html")
            msg.send()
            
            return Response({'message': 'Jelszó generálva és e-mailben elküldve'})
        except Exception as e:
            logger.error(f"Jelszó generálás email hiba: {str(e)}")
            return Response(
                {'message': f'Jelszó generálva, de e-mail küldése sikertelen: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AttendanceViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_module = 'hr'
    permission_resource = 'hr.attendance'
    own_data_user_field = 'employee__user'  # Attendance -> Employee -> User


class LeaveRequestViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.all()
    serializer_class = LeaveRequestSerializer
    permission_module = 'hr'
    permission_resource = 'hr.leave_requests'
    own_data_user_field = 'employee__user'  # LeaveRequest -> Employee -> User


class PayrollViewSet(viewsets.ModelViewSet):
    queryset = Payroll.objects.all()
    serializer_class = PayrollSerializer


class AttendanceReportViewSet(viewsets.ViewSet):
    """
    ViewSet for attendance reports based on AccessLog data
    Provides daily attendance records with check-in/check-out times
    """
    permission_classes = [AllowAny]  # Később módosítható jogosultságra
    
    def list(self, request):
        """
        Get attendance report with filtering options
        Query params:
        - employee_id: Filter by employee
        - start_date: Start of date range (default: first day of current month)
        - end_date: End of date range (default: last day of current month)
        - month: Quick filter - 'current' or 'previous'
        """
        # Get filter parameters
        employee_id = request.query_params.get('employee_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        month_filter = request.query_params.get('month', 'current')
        
        # Calculate date range
        today = date.today()
        
        if month_filter == 'previous':
            # Previous month
            if today.month == 1:
                year = today.year - 1
                month = 12
            else:
                year = today.year
                month = today.month - 1
            start_date = date(year, month, 1)
            _, last_day = monthrange(year, month)
            end_date = date(year, month, last_day)
        elif start_date and end_date:
            # Custom date range
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        else:
            # Current month (default)
            start_date = date(today.year, today.month, 1)
            _, last_day = monthrange(today.year, today.month)
            end_date = date(today.year, today.month, last_day)
        
        # Build query
        filters = Q(check_in_time__date__gte=start_date, check_in_time__date__lte=end_date)
        if employee_id:
            filters &= Q(employee_id=employee_id)
        
        # Get all access logs in the date range
        access_logs = AccessLog.objects.filter(filters).select_related('employee', 'employee__user')
        
        # Group by employee and date
        attendance_dict = defaultdict(lambda: defaultdict(list))
        
        for log in access_logs:
            log_date = log.check_in_time.date()
            attendance_dict[log.employee_id][log_date].append(log)
        
        # Build report data
        report_data = []
        
        # Get all employees in the filter
        if employee_id:
            employees = Employee.objects.filter(id=employee_id, is_active=True)
        else:
            employees = Employee.objects.filter(is_active=True)
        
        for employee in employees:
            # Calculate total monthly hours
            monthly_hours = 0
            
            # Iterate through all days in the range
            current_date = start_date
            while current_date <= end_date:
                logs_for_day = attendance_dict[employee.id].get(current_date, [])
                
                if logs_for_day:
                    # Get first check-in and last check-out
                    check_in = min(log.check_in_time for log in logs_for_day)
                    check_outs = [log.check_out_time for log in logs_for_day if log.check_out_time]
                    check_out = max(check_outs) if check_outs else None
                    
                    # Calculate hours
                    if check_out and check_in:
                        delta = check_out - check_in
                        hours_worked = round(delta.total_seconds() / 3600, 2)
                    else:
                        hours_worked = 0
                    
                    monthly_hours += hours_worked
                    
                    # Use the first log for notes (or combine all notes)
                    notes = logs_for_day[0].notes or ''
                    access_log_id = logs_for_day[0].id
                else:
                    # No attendance for this day
                    check_in = None
                    check_out = None
                    hours_worked = 0
                    notes = ''
                    access_log_id = None
                
                report_data.append({
                    'id': access_log_id,
                    'employee_id': employee.id,
                    'employee_name': employee.user.get_full_name(),
                    'date': current_date,
                    'check_in': check_in,
                    'check_out': check_out,
                    'hours_worked': hours_worked,
                    'notes': notes,
                    'is_editable': True
                })
                
                current_date += timedelta(days=1)
        
        serializer = AttendanceReportSerializer(report_data, many=True)
        
        # Calculate summary
        total_days_worked = sum(1 for item in report_data if item['hours_worked'] > 0)
        total_hours = sum(item['hours_worked'] for item in report_data)
        
        return Response({
            'results': serializer.data,
            'summary': {
                'total_days_worked': total_days_worked,
                'total_hours': round(total_hours, 2),
                'start_date': start_date,
                'end_date': end_date
            }
        })
    
    def update(self, request, pk=None):
        """Update a specific attendance record"""
        try:
            access_log = AccessLog.objects.get(pk=pk)
        except AccessLog.DoesNotExist:
            return Response({'error': 'Attendance record not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Import AccessLogSerializer from serializers
        from .serializers import AccessLogSerializer
        serializer = AccessLogSerializer(access_log, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def partial_update(self, request, pk=None):
        """Partially update an attendance record"""
        return self.update(request, pk)


# Device webhook endpoints for devicebroker integration
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
import json

@csrf_exempt
def check_device_login(request):
    """
    Device login check endpoint - called by devicebroker when device logs in
    """
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            device_id = data.get('sn', data.get('device_id', 'UNKNOWN'))
            
            logger.info(f"[DEVICE_LOGIN] Device login request: DeviceID={device_id}")
            
            # Update device online status
            from django.utils import timezone
            try:
                device_config = AccessControlConfig.objects.get(device_id=device_id)
                device_config.is_online = True
                device_config.last_seen = timezone.now()
                device_config.save()
                logger.info(f"[DEVICE_LOGIN] Device {device_id} logged in successfully")
            except AccessControlConfig.DoesNotExist:
                logger.warning(f"[DEVICE_LOGIN] Device {device_id} not found in database")
            
            return JsonResponse({
                'result': 'Success'
            })
        except Exception as e:
            logger.error(f"[DEVICE_LOGIN] Login error: {e}")
            return JsonResponse({'result': 'Fail', 'error': str(e)})
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def device_keepalive(request):
    """
    Device keepalive endpoint - called periodically by devicebroker to update device status
    """
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            device_id = data.get('sn', data.get('device_id', 'UNKNOWN'))
            
            # Update device last_seen timestamp
            from django.utils import timezone
            try:
                device_config = AccessControlConfig.objects.get(device_id=device_id)
                device_config.is_online = True
                device_config.last_seen = timezone.now()
                device_config.save(update_fields=['is_online', 'last_seen'])
            except AccessControlConfig.DoesNotExist:
                # Device not registered yet, ignore
                pass
            
            return JsonResponse({'result': 'Success'})
        except Exception as e:
            logger.error(f"[DEVICE_KEEPALIVE] Error: {e}")
            return JsonResponse({'result': 'Fail', 'error': str(e)})
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def check_device_registration(request):
    """
    Device registration check endpoint - called by devicebroker when device registers
    Always accepts devices and enables WorkCode and FaceDetection
    """
    if request.method == 'POST':
        try:
            # Decode request body
            body = request.body.decode('utf-8') if request.body else '{}'
            data = json.loads(body) if body else {}
            
            # Extract device info - DeviceBroker sends flat JSON
            sn = data.get('sn', data.get('device_id', 'UNKNOWN'))
            terminal_type = data.get('terminal_type', '')
            product_name = data.get('product_name', '')
            cloud_id = data.get('cloud_id', '')
            
            logger.info(f"[DEVICE_REGISTRATION] Device registration request: SN={sn}, Type={terminal_type}, Product={product_name}")
            
            # Get or create device config in database
            from django.utils import timezone
            device_config, created = AccessControlConfig.objects.get_or_create(
                device_id=sn,
                defaults={
                    'name': f"{product_name} ({sn})" if product_name else sn,
                    'device_ip': '0.0.0.0',  # Will be updated on first connection
                    'device_port': 5005,
                    'is_online': True,
                    'last_seen': timezone.now()
                }
            )
            
            # Update device status
            if not created:
                device_config.is_online = True
                device_config.last_seen = timezone.now()
                device_config.save()
            
            logger.info(f"[DEVICE_REGISTRATION] Device {sn} registered successfully (created={created})")
            
            # Generate a token for the device
            import secrets
            token = secrets.token_hex(16)
            
            # Always accept the device with token
            return JsonResponse({
                'result': 'Success',
                'token': token,
                'settings': {
                    'WorkCode': True,
                    'FaceDetection': True
                }
            })
        except Exception as e:
            logger.error(f"[DEVICE_REGISTRATION] Registration error: {e}")
            logger.error(f"[DEVICE_REGISTRATION] Request body: {request.body}")
            return JsonResponse({'result': 'Fail', 'error': str(e)})
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


from .models import AccessControlConfig
from .serializers import AccessControlConfigSerializer


class AccessControlConfigViewSet(viewsets.ModelViewSet):
    """ViewSet for managing access control device configurations"""
    queryset = AccessControlConfig.objects.all()
    serializer_class = AccessControlConfigSerializer
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def discover_devices(self, request):
        """Discover all devices currently connected to WebSocket"""
        from apps.hr.device_consumer import CONNECTED_DEVICES
        from django.utils import timezone
        from datetime import timedelta
        
        # Define timeout for considering a device offline (30 seconds)
        ONLINE_TIMEOUT = timedelta(seconds=30)
        now = timezone.now()
        
        # Update offline status for devices that haven't sent keepalive recently
        stale_devices = AccessControlConfig.objects.filter(
            is_online=True,
            last_seen__lt=now - ONLINE_TIMEOUT
        )
        stale_count = stale_devices.update(is_online=False)
        if stale_count > 0:
            logger.info(f"[DISCOVER] Set {stale_count} devices offline (timeout)")
        
        # Get online devices from database
        online_devices = AccessControlConfig.objects.filter(is_online=True)
        
        # Debug logging
        logger.info(f"[DISCOVER] CONNECTED_DEVICES (memory) = {len(CONNECTED_DEVICES)}")
        logger.info(f"[DISCOVER] Online devices (DB) = {online_devices.count()}")
        
        # Format the connected devices for response
        devices = []
        for device in online_devices:
            # Try to get additional info from memory if available
            memory_info = CONNECTED_DEVICES.get(device.device_id, {})
            
            devices.append({
                'device_id': device.device_id,
                'name': device.name,
                'ip': device.device_ip,
                'port': device.device_port,
                'location': device.location or '',
                'connected_at': device.last_seen.isoformat() if device.last_seen else None,
                'device_info': memory_info.get('device_info', {})
            })
        
        return Response({
            'success': True,
            'connected_devices': devices,
            'total': len(devices),
            'message': f'{len(devices)} eszköz csatlakozva'
        })
    
    @action(detail=False, methods=['post'])
    def test_connection(self, request):
        """Test connection to access control device using provided parameters"""
        # Get device parameters from request
        device_ip = request.data.get('device_ip')
        device_port = request.data.get('device_port')
        device_id = request.data.get('device_id')
        
        if not device_ip or not device_port:
            return Response(
                {
                    'success': False,
                    'error': 'Device IP és Port megadása kötelező'
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            service = AccessControlService(
                device_ip=device_ip,
                device_port=device_port,
                device_id=device_id
            )
            result = service.test_connection()
            return Response(result)
        except Exception as e:
            logger.error(f"Connection test error: {str(e)}")
            return Response(
                {
                    'success': False,
                    'error': f'Hiba a kapcsolat tesztelésekor: {str(e)}',
                    'broker_status': 'error',
                    'recommendations': [
                        'Ellenőrizze a devicebroker szolgáltatást',
                        'Ellenőrizze az eszköz hálózati kapcsolatát',
                        'Ellenőrizze az eszköz IP címét és portját'
                    ]
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
