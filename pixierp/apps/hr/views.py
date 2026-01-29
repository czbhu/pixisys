from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth import get_user_model
from django.utils.crypto import get_random_string
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
from datetime import datetime, date, timedelta, time as dt_time
from django.db.models import Min, Max, Q
from calendar import monthrange
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

from apps.core.permissions import (
    OwnDataFilterMixin,
    HasPermission,
    check_permission,
    has_own_data_permission,
)
from apps.core.services import send_notification
from .models import Department, Position, Employee, Attendance, LeaveRequest, Payroll, AccessLog, AttendanceKioskConfig
from .serializers import (
    DepartmentSerializer, PositionSerializer, EmployeeSerializer,
    AttendanceSerializer, LeaveRequestSerializer, PayrollSerializer, AttendanceReportSerializer, AttendanceKioskConfigSerializer
)

User = get_user_model()


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.order_by('name')
    serializer_class = DepartmentSerializer


class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.order_by('title', 'department__name')
    serializer_class = PositionSerializer


class EmployeeViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = Employee.objects.order_by('user__last_name', 'user__first_name', 'employee_id')
    serializer_class = EmployeeSerializer
    permission_classes = [HasPermission]
    permission_module = 'hr'
    permission_resource = 'hr.employees'
    own_data_user_field = 'user'
    
    # ELTÁVOLÍTVA: Egyéni jogosultságok már nem használtak
    # Csak osztály-alapú szerepkörök vannak használva (Department.roles)
    # @action(detail=True, methods=['get', 'post'])
    # def custom_permissions(self, request, pk=None):
    #     """Egyéni jogosultságok kezelése (nem szerepkör alapú)"""
    #     ...
    
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


from rest_framework.permissions import IsAuthenticated

class AttendanceViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [HasPermission]
    permission_module = 'hr'
    permission_resource = 'hr.attendance'
    own_data_user_field = 'employee__user'  # Attendance -> Employee -> User

    def get_permissions(self):
        """
        Custom permissions for specific actions.
        'status', 'scan', 'generate_token' should be available to any authenticated user (employee).
        """
        if self.action in ['status', 'scan', 'generate_token']:
            return [IsAuthenticated()]
        return super().get_permissions()

    @action(detail=False, methods=['get'])
    def status(self, request):
        user = request.user
        today = timezone.localdate()
        # Find employee profile
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
             return Response({'error': 'Employee profile not found'}, status=404)

        # Find active session (AccessLog from today/ongoing)
        active_log = AccessLog.objects.filter(
            employee=employee,
            check_out_time__isnull=True
        ).order_by('-check_in_time').first()
        
        # Calculate daily worked seconds (sum of closed logs for today)
        today_start_aware = timezone.make_aware(datetime.combine(today, dt_time.min))
        today_end_aware = timezone.make_aware(datetime.combine(today, dt_time.max))

        closed_logs_today = AccessLog.objects.filter(
            employee=employee,
            check_in_time__range=(today_start_aware, today_end_aware),
            check_out_time__isnull=False
        )
        
        daily_worked_seconds = 0
        for log in closed_logs_today:
            delta = log.check_out_time - log.check_in_time
            daily_worked_seconds += delta.total_seconds()
            
        # Determine Max Inactivity Timeout from User's Departments
        # Default to 60 if no department or not set
        max_timeout = 60
        if employee.departments.exists():
            from django.db.models import Max
            result = employee.departments.aggregate(Max('inactivity_timeout'))
            if result['inactivity_timeout__max'] is not None:
                max_timeout = result['inactivity_timeout__max']
                
        # If max_timeout is 0, it means inactivity check is disabled


        attendance = Attendance.objects.filter(employee=employee, date=today).first()
        
        data = {
            'is_clocked_in': False,
            'check_in': None,
            'check_out': None,
            'employee_name': f"{user.last_name} {user.first_name}",
            'daily_worked_seconds': daily_worked_seconds,
            'inactivity_timeout': max_timeout
        }
        
        if active_log:
            # Active session found -> Use its start time
            data['is_clocked_in'] = True
            data['check_in'] = active_log.check_in_time.isoformat() # Already datetime aware
            # data['check_out'] remains None
        elif attendance:
            # No active log, but attendance exists (maybe clocked out or just have record)
            # Find last closed log for today to maybe show something?
            # Or just fallback to attendance aggregated times
            
            if attendance.check_in:
                 # Check if attendance says clocked in (but active_log missing?? Inconsistent state fallback)
                 # Or if attendance.check_out is null
                 if not attendance.check_out:
                     # This shouldn't happen if AccessLog logic is sound, but if it does:
                     data['is_clocked_in'] = True
                     data['check_in'] = datetime.combine(attendance.date, attendance.check_in).isoformat()
                 else:
                     # Clocked out for the day (or break)
                     data['is_clocked_in'] = False
                     data['check_in'] = datetime.combine(attendance.date, attendance.check_in).isoformat()
                     data['check_out'] = datetime.combine(attendance.date, attendance.check_out).isoformat()
                     
        return Response(data)

    @action(detail=False, methods=['post'])
    def inactive_checkout(self, request):
        """
        Check out user due to inactivity.
        Sets check_out time to the provided valid last_activity timestamp.
        """
        user = request.user
        last_activity = request.data.get('last_activity')
        
        if not last_activity:
             return Response({'error': 'Last activity time is required'}, status=400)
             
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
             return Response({'error': 'Employee profile not found'}, status=404)

        # Parse timestamp
        from django.utils.dateparse import parse_datetime
        checkout_time = parse_datetime(last_activity)
        
        if not checkout_time:
             return Response({'error': 'Invalid date format'}, status=400)
             
        if timezone.is_naive(checkout_time):
             checkout_time = timezone.make_aware(checkout_time)
             
        # Find Active Log
        active_log = AccessLog.objects.filter(
            employee=employee,
            check_out_time__isnull=True
        ).order_by('-check_in_time').first()

        if active_log:
            # Ensure checkout time is not before check-in
            if checkout_time < active_log.check_in_time:
                 # If last activity was somehow before checkin (impossible), fallback to now
                 checkout_time = timezone.now()

            active_log.check_out_time = checkout_time
            
            # AccessLog note
            note_msg = "Inaktívitás miatt kilépve"
            if active_log.notes:
                if note_msg not in active_log.notes:
                    active_log.notes += f"\n{note_msg}"
            else:
                active_log.notes = note_msg
                
            active_log.save()
            
            # Update Attendance
            log_date = timezone.localtime(active_log.check_in_time).date()
            local_checkout_time = timezone.localtime(checkout_time).time()
            
            attendance = Attendance.objects.filter(employee=employee, date=log_date).first()
            if attendance:
                 attendance.check_out = local_checkout_time
                 
                 # Attendance note
                 if attendance.notes:
                     if note_msg not in attendance.notes:
                         attendance.notes += f"\n{note_msg}"
                 else:
                     attendance.notes = note_msg
                     
                 attendance.save()
                
            return Response({'message': 'Inactive checkout successful'})
            
        return Response({'message': 'No active session found'})

    @action(detail=False, methods=['post'])
    def initiate(self, request):
        """
        User initiates check-in/out from phone.
        Triggers Kiosk to show a QR code.
        """
        user = request.user
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        import uuid
        import time

        # Determine if Check In or Check Out
        today = date.today()
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
             return Response({'error': 'Employee profile not found'}, status=404)

        attendance = Attendance.objects.filter(employee=employee, date=today).first()
        mode = "check_in"
        if attendance and attendance.check_in and not attendance.check_out:
            mode = "check_out"
        
        # Generate a secure token for the QR
        # This token should ideally be stored in Redis/Cache with 10s TTL to verify later
        # specific to this user interaction
        # Format: "uid:timestamp:nonce"
        timestamp = int(time.time())
        token = f"{user.id}:{timestamp}:{uuid.uuid4().hex[:8]}"
        
        # In a real app, save this token to cache to verify 
        # But here we will sign it or just rely on backend-kiosk trust for display
        # The QR content is what gets scanned back.
        
        # Get timeout from config
        config = AttendanceKioskConfig.objects.first()
        timeout = config.qr_validity_seconds if config else 10

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "attendance_kiosk",
            {
                "type": "kiosk.message",
                "message": {
                    "type": "show_qr",
                    "qr_data": token, 
                    "user_id": user.id,
                    "user_name": f"{user.last_name} {user.first_name}",
                    "mode": mode,
                    "timeout": timeout
                }
            }
        )
        
        return Response({'message': 'Kiosk QR triggered', 'token': token, 'mode': mode})


    @action(detail=False, methods=['get'])
    def generate_token(self, request):
        """
        Generate a signed token for the user's mobile QR code.
        Validity: 10 seconds.
        """
        user = request.user
        from django.core.signing import TimestampSigner
        
        signer = TimestampSigner()
        # Data to sign: user_id:random_nonce
        import uuid
        data = f"{user.id}:{uuid.uuid4().hex[:8]}"
        signed_token = signer.sign(data)
        
        return Response({'token': signed_token, 'validity': 10})

    @action(detail=False, methods=['post'], permission_classes=[])
    @csrf_exempt
    def device_scan(self, request):
        """
        Public endpoint for Hardware ESP8266 Scanner.
        Expects: { "token": "...", "device_id": "..." }
        """
        # Since this is public/hardware, we might not have request.user authentication
        # We rely on the signed token itself.
        
        token = request.data.get('token')
        device_id = request.data.get('device_id')
        
        if not token:
            return Response({'error': 'Token missing'}, status=400)
            
        from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
        from django.contrib.auth import get_user_model
        
        signer = TimestampSigner()
        try:
            # Validate max_age=15 (10s validity + 5s latency buffer)
            original_value = signer.unsign(token, max_age=15)
            # original_value is "user_id:nonce"
            user_id = original_value.split(':')[0]
            
            User = get_user_model()
            user = User.objects.get(pk=user_id)
            
            # --- Attendance Logic (Same as scan) ---
            today = date.today()
            now = datetime.now()
            
            try:
                employee = user.employee_profile
            except Employee.DoesNotExist:
                 return Response({'error': 'Employee profile not found'}, status=404)
    
            attendance, created = Attendance.objects.get_or_create(
                employee=employee, 
                date=today,
                defaults={
                    'check_in': now.time(),
                    'break_duration': timedelta(0),
                    'overtime_hours': 0
                }
            )
            
            action_type = "check_in"
            if created:
                logger.info(f"[DEVICE] Check-in: {user.username} via {device_id}")
            else:
                if not attendance.check_out:
                    attendance.check_out = now.time()
                    attendance.save()
                    action_type = "check_out"
                    logger.info(f"[DEVICE] Check-out: {user.username} via {device_id}")
                else:
                     logger.info(f"[DEVICE] Duplicate scan: {user.username}")
                     return Response({'message': 'Already checked out'}, status=200)
            
            # Optional: Push notification to user via WebSocket?
            message_str = f"Sikeres { 'belépés' if action_type == 'check_in' else 'kilépés' }: {now.strftime('%H:%M:%S')}"
            
            send_notification(
                user=user,
                title="Jelenlét frissítés",
                message=message_str,
                link="/personal/attendance",
                type="success"
            )

            return Response({'status': 'success', 'action': action_type}, status=200)

        except SignatureExpired:
            return Response({'error': 'Token expired'}, status=400)
        except BadSignature:
            return Response({'error': 'Invalid token signature'}, status=400)
        except Exception as e:
            logger.error(f"[DEVICE] Scan error: {e}")
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def scan(self, request):
        qr_code = request.data.get('qr_code')
        user = request.user
        
        # Timezone aware Current Time
        now = timezone.now()
        local_now = timezone.localtime(now)
        today = local_now.date() 

        # Check if it is a Kiosk QR
        if qr_code and "KIOSK_QR" in qr_code:
            from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
            signer = TimestampSigner()
            try:
                base_validity = 10
                config = AttendanceKioskConfig.objects.first()
                if config:
                    base_validity = config.qr_validity_seconds
                
                max_age = base_validity + 20 
                
                signer.unsign(qr_code, max_age=max_age)
            except (BadSignature, SignatureExpired) as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Scan failed for user {user}: {e} Code: {qr_code[:10]}...")
                return Response({'message': f'Érvénytelen vagy lejárt Kioszk QR kód: {str(e)}'}, status=400)
        else:
            pass
            
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
             return Response({'message': 'Nem található dolgozói profil ehhez a felhasználóhoz'}, status=404)

        # Get/Create Attendance for TODAY
        attendance_today, created = Attendance.objects.get_or_create(
            employee=employee, 
            date=today,
            defaults={
                'check_in': local_now.time(),
                'break_duration': timedelta(0),
                'overtime_hours': 0,
                'last_activity': now # Initialize last_activity on check-in
            }
        )
        if created:
            attendance_today.last_activity = now
            attendance_today.save()
        
        # Find Active Log (Any open log from past)
        active_log = AccessLog.objects.filter(
            employee=employee,
            check_out_time__isnull=True
        ).order_by('-check_in_time').first()

        message_str = ""
        action_type = ""
        
        if active_log:
            # CHECK OUT logic (or Split)
            active_start_local = timezone.localtime(active_log.check_in_time)
            
            if active_start_local.date() < today:
                # SPANNING MIDNIGHT -> SPLIT
                
                # Close OLD Log at boundary (Next Day 00:00 which is effectively End Of Old Day)
                boundary_date = active_start_local.date() + timedelta(days=1)
                boundary_naive = datetime.combine(boundary_date, datetime.min.time()) # 00:00
                boundary_aware = timezone.make_aware(boundary_naive, timezone.get_current_timezone())
                
                active_log.check_out_time = boundary_aware
                active_log.save()
                
                # Update Old Attendance Check Out (to 23:59:59)
                try:
                    att_old = Attendance.objects.get(employee=employee, date=active_start_local.date())
                    att_old.check_out = dt_time(23, 59, 59)
                    att_old.save()
                except Attendance.DoesNotExist:
                    pass

                # Create NEW Log for Today (00:00 -> Now) because we are closing the session now
                AccessLog.objects.create(
                    employee=employee,
                    check_in_time=boundary_aware,
                    check_out_time=now,
                    location="Kiosk/Web (Auto Split)",
                    duration_hours=0
                )
                
                # Update Today's Attendance
                attendance_today.check_in = dt_time(0, 0, 0)
                attendance_today.check_out = local_now.time()
                attendance_today.save()
                
                message_str = f"Sikeres kilépés (Éjfél átlépve): {local_now.strftime('%H:%M:%S')}"
                action_type = "check_out"
            else:
                # SAME DAY CHECK OUT
                active_log.check_out_time = now
                active_log.save()
                
                attendance_today.check_out = local_now.time()
                attendance_today.save()
                
                message_str = f"Sikeres kilépés: {local_now.strftime('%H:%M:%S')}"
                action_type = "check_out"
                
        else:
            # CHECK IN (Starting new)
            AccessLog.objects.create(
                employee=employee,
                check_in_time=now,
                location="Kiosk/Web",
                duration_hours=0
            )
            
            attendance_today.check_out = None
            attendance_today.last_activity = now # Reset/Update last acitivity on check-in
            attendance_today.save()
            
            message_str = f"Sikeres belépés: {local_now.strftime('%H:%M:%S')}"
            action_type = "check_in"

        # Notify Kiosk of success
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "attendance_kiosk",
            {
                "type": "kiosk.message",
                "message": {
                    "type": "success",
                    "user_name": f"{user.last_name} {user.first_name}",
                    "timestamp": local_now.strftime('%Y-%m-%d %H:%M:%S'),
                    "action": action_type
                }
            }
        )

        # Notify User (for Web UI refresh)
        send_notification(
            user=user,
            title="Jelenlét frissítés",
            message=message_str,
            link="/personal/attendance",
            type="success"
        )
                 
        return Response({
            'message': message_str, 
            'timestamp': now.isoformat(),
            'user_name': f"{user.last_name} {user.first_name}",
            'action': action_type
        })
    
    @action(detail=False, methods=['post'])
    def update_heartbeat(self, request):
        """Update last_activity timestamp for the current open attendance"""
        user = request.user
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
            return Response(status=404)
            
        today = timezone.localdate()
        now = timezone.now()
        
        attendance = Attendance.objects.filter(employee=employee, date=today, check_out__isnull=True).first()
        if attendance:
            attendance.last_activity = now
            attendance.save(update_fields=['last_activity'])
            return Response({'status': 'updated', 'last_activity': now.isoformat()})
            
        return Response({'status': 'no_active_attendance'})
        
    @action(detail=False, methods=['get'])
    def status(self, request):
        """Get current attendance status and inactivity info"""
        user = request.user
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
            return Response({'check_in': None})
            
        today = timezone.localdate()
        attendance = Attendance.objects.filter(employee=employee, date=today).first()
        
        # Calculate daily worked seconds (including previous closed logs for today)
        daily_logs = AccessLog.objects.filter(
            employee=employee,
            check_in_time__date=today,
            check_out_time__isnull=False
        )
        worked_seconds = sum([(log.check_out_time - log.check_in_time).total_seconds() for log in daily_logs])
        
        # Get Max Inactivity Timeout from user's departments (min: 60 minutes default)
        timeout_minutes = 60
        timeout_values = []
        
        # Check direct departments
        for dept in employee.departments.all():
             if dept.inactivity_timeout:
                 timeout_values.append(dept.inactivity_timeout)
                 
        # Check position's department
        if employee.position and employee.position.department:
             if employee.position.department.inactivity_timeout:
                 timeout_values.append(employee.position.department.inactivity_timeout)
        
        if timeout_values:
            timeout_minutes = max(timeout_values)
        
        result = {
            'check_in': None,
            'daily_worked_seconds': worked_seconds,
            'inactivity_timeout': timeout_minutes,
            'last_activity': None
        }
        
        if attendance and not attendance.check_out:
            # Active session
            active_log = AccessLog.objects.filter(
                employee=employee, 
                check_out_time__isnull=True
            ).last()
            
            if active_log:
                result['check_in'] = active_log.check_in_time
            elif attendance.check_in:
                 # Fallback if no access log but attendance exists (shouldn't happen logic wise but safe)
                 # Combine Date + Time
                 local_dt = datetime.combine(attendance.date, attendance.check_in)
                 result['check_in'] = timezone.make_aware(local_dt)
            
            if attendance.last_activity:
                result['last_activity'] = attendance.last_activity
        
        return Response(result)

    @action(detail=False, methods=['post'])
    def inactive_checkout(self, request):
        """Force checkout due to inactivity"""
        user = request.user
        last_activity_str = request.data.get('last_activity')
        
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
             return Response(status=404)
             
        today = timezone.localdate()
        now = timezone.now()
        
        # Use provided last activity or current time if missing
        checkout_time = now
        if last_activity_str:
            try:
                from dateutil.parser import parse
                checkout_time = parse(last_activity_str)
                # Ensure timezone aware
                if timezone.is_naive(checkout_time):
                    checkout_time = timezone.make_aware(checkout_time)
            except:
                pass
        
        # If we have a stored last_activity in Attendance that is more recent/accurate?
        # Actually user wants "last active counts", so if frontend claims X, trusting it is risky?
        # Better: use the max of stored and reported? 
        # Or simplistic: If Attendance has last_activity, use that.
        
        attendance = Attendance.objects.filter(employee=employee, date=today, check_out__isnull=True).first()
        if not attendance:
            return Response({'message': 'Already checked out'})
            
        if attendance.last_activity:
             # Prefer server side stored activity if available
             checkout_time = attendance.last_activity
        
        # Perform Checkout logic similar to scan
        active_log = AccessLog.objects.filter(
            employee=employee,
            check_out_time__isnull=True
        ).last()
        
        if active_log:
            active_log.check_out_time = checkout_time
            active_log.location = "Auto/Inactivity"
            active_log.save()
            
        attendance.check_out = timezone.localtime(checkout_time).time()
        attendance.save()
        
        return Response({'status': 'checked_out', 'time': checkout_time})


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
    permission_classes = [HasPermission]
    permission_module = 'hr'
    permission_resource = 'hr.attendance'
    
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

        user = request.user
        can_view_all = check_permission(user, self.permission_module, self.permission_resource, 'view')
        can_view_own = has_own_data_permission(user, self.permission_module, self.permission_resource)
        can_edit = check_permission(user, self.permission_module, self.permission_resource, 'edit')

        # Deny access if the user has no relevant permission
        if not (can_view_all or can_view_own):
            return Response(
                {'detail': 'Nincs jogosultság a jelenlét adatok megtekintéséhez.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        
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
        # Decide which employee(s) the user is allowed to see
        if can_view_all:
            target_employee_id = employee_id
        else:
            user_employee = Employee.objects.filter(user=user, is_active=True).first()
            if not user_employee:
                return Response({
                    'results': [],
                    'summary': {
                        'total_days_worked': 0,
                        'total_hours': 0,
                        'start_date': start_date,
                        'end_date': end_date,
                    }
                })
            target_employee_id = user_employee.id

        filters = Q(check_in_time__date__gte=start_date, check_in_time__date__lte=end_date)
        if target_employee_id:
            filters &= Q(employee_id=target_employee_id)
        
        # Get all access logs in the date range
        access_logs = AccessLog.objects.filter(filters).select_related('employee', 'employee__user')
        
        # Group by employee and date
        attendance_dict = defaultdict(lambda: defaultdict(list))
        
        for log in access_logs:
            # Use Local Time for date grouping
            log_date = timezone.localtime(log.check_in_time).date()
            attendance_dict[log.employee_id][log_date].append(log)
        
        # Build report data
        report_data = []
        
        # Get all employees in the filter
        if target_employee_id:
            employees = Employee.objects.filter(id=target_employee_id, is_active=True)
        else:
            employees = Employee.objects.filter(is_active=True)
        
        for employee in employees:
            # Calculate total monthly hours
            monthly_hours = 0
            
            # Iterate through all days in the range
            current_date = start_date
            while current_date <= end_date:
                logs_for_day = attendance_dict[employee.id].get(current_date, [])
                
                segments = []
                check_in = None
                check_out = None
                hours_worked = 0
                notes = ''
                access_log_id = None

                if logs_for_day:
                    # Sort logs by check_in time
                    logs_for_day.sort(key=lambda x: x.check_in_time)
                    
                    # Get first check-in and last check-out for summary
                    check_in = logs_for_day[0].check_in_time
                    
                    # Calculate total hours (sum of all durations)
                    # And build segments list
                    for log in logs_for_day:
                        duration = 0
                        c_out = log.check_out_time
                        if c_out and log.check_in_time:
                            delta = c_out - log.check_in_time
                            duration = round(delta.total_seconds() / 3600, 2)
                        
                        hours_worked += duration
                        
                        segments.append({
                            'id': log.id,
                            'check_in': log.check_in_time,
                            'check_out': log.check_out_time,
                            'duration': duration,
                            'notes': log.notes or ''
                        })
                    
                    # Last check out text (summary)
                    if logs_for_day[-1].check_out_time:
                         check_out = logs_for_day[-1].check_out_time

                    notes = logs_for_day[0].notes or ''
                    access_log_id = logs_for_day[0].id
                
                report_data.append({
                    'id': access_log_id,
                    'employee_id': employee.id,
                    'employee_name': employee.user.get_full_name(),
                    'date': current_date,
                    'check_in': check_in,
                    'check_out': check_out,
                    'hours_worked': round(hours_worked, 2), # Total sum
                    'notes': notes,
                    'is_editable': can_edit,
                    'segments': segments # New field
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

class AttendanceKioskConfigViewSet(viewsets.ModelViewSet):
    queryset = AttendanceKioskConfig.objects.all()
    serializer_class = AttendanceKioskConfigSerializer
    permission_classes = [HasPermission]
    permission_module = 'settings' # Or HR? The user said "Settings > Attendance Kiosk"
    permission_resource = 'settings.company' # Close enough, or define new one.
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def current(self, request):
        config = AttendanceKioskConfig.objects.first()
        if not config:
            config = AttendanceKioskConfig.objects.create()
        serializer = self.get_serializer(config)
        return Response(serializer.data)

from .models import KioskDevice
from .serializers import KioskDeviceSerializer

class KioskDeviceViewSet(viewsets.ModelViewSet):
    queryset = KioskDevice.objects.all()
    serializer_class = KioskDeviceSerializer
    permission_classes = [AllowAny] 
    
    @action(detail=False, methods=['post'])
    def register(self, request):
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({'error': 'device_id kötelező'}, status=400)
        
        # Capture IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
            
        device, created = KioskDevice.objects.get_or_create(
            device_id=device_id,
            defaults={'status': 'pending'}
        )
        device.last_seen = timezone.now()
        device.ip_address = ip
        device.save()
        
        return Response(KioskDeviceSerializer(device).data)
        
    @action(detail=False, methods=['post'])
    def unregister(self, request):
        device_id = request.data.get('device_id')
        if not device_id:
             return Response({'error': 'device_id kötelező'}, status=400)
        
        KioskDevice.objects.filter(device_id=device_id).delete()
        return Response({'status': 'deleted'})
        
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if not request.user.is_authenticated:
            return Response(status=401)
        device = self.get_object()
        device.status = 'approved'
        device.save()
        return Response(KioskDeviceSerializer(device).data)

    @action(detail=True, methods=['post'])
    def block(self, request, pk=None):
        if not request.user.is_authenticated:
            return Response(status=401)
        device = self.get_object()
        device.status = 'blocked'
        device.save()
        return Response(KioskDeviceSerializer(device).data)
