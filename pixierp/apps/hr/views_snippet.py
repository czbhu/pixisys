from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired

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
             
        # Find active session
        active_log = AccessLog.objects.filter(
            employee=employee,
            check_out_time__isnull=True
        ).order_by('-check_in_time').first()

        if active_log:
            # If provided time is earlier than check_in, clamp to check_in
            if checkout_time < active_log.check_in_time:
                 logger.warning(f"Inactive checkout for {user}: checkout time {checkout_time} < check in time {active_log.check_in_time}")
                 checkout_time = active_log.check_in_time + timedelta(seconds=1)

            # Close Log
            active_log.check_out_time = checkout_time
            active_log.save()
            
            # Update Attendance Record
            today = timezone.localdate()
            att_today = Attendance.objects.filter(employee=employee, date=today).first()
            if att_today:
                att_today.check_out = timezone.localtime(checkout_time).time()
                att_today.save()
            
            return Response({'message': 'Inactive session closed', 'timestamp': checkout_time.isoformat()})
        else:
            return Response({'message': 'No active session found', 'timestamp': checkout_time.isoformat()})

    @action(detail=False, methods=['post'])
    def trigger_kiosk_qr(self, request):
        """
        Trigger Kiosk to show a QR code for 'check_in' or 'check_out'.
        Used by the Attendance Dashboard on request.
        """
        mode = request.data.get('mode', 'check_in') # 'check_in' or 'check_out'
        
        # We need to know WHICH kiosk to trigger.
        # But this request comes from the user's browser (dashboard)?
        # If dashboard, we don't know the kiosk.
        # However, the user flow is usually: Phone Scans Kiosk QR (Static or Dynamic).
        # OR: Kiosk shows QR -> Phone Scans it.
        
        # If this endpoint is "Phone requests Kiosk to display QR", we need Kiosk ID.
        # If user is at a Kiosk, maybe they select "I want to Check In" on Phone?
        
        from django.core.signing import TimestampSigner
        import uuid
        signer = TimestampSigner()
        
        # Token format: KIOSK_ACTION:user_id:mode:nonce
        token = signer.sign(f"KIOSK_ACTION:{request.user.id}:{mode}:{uuid.uuid4().hex}")
        
        # Broadcast to Kiosks? Or return to Phone to show to Kiosk?
        # Assuming "Phone shows QR to Kiosk":
        return Response({'token': token, 'mode': mode, 'validity': 60})


    @action(detail=False, methods=['get'])
    def generate_token(self, request):
        """
        Generate a signed token for the user's mobile QR code.
        Validity: 10 seconds.
        Supports 'kiosk_id' to bind the token to a specific kiosk context.
        """
        user = request.user
        kiosk_id = request.query_params.get('kiosk_id')
        from django.core.signing import TimestampSigner
        import uuid
        
        signer = TimestampSigner()
        
        if kiosk_id:
            # Authorized Kiosk Token format: USER_ACCESS:user_id:kiosk_id:nonce
            data = f"USER_ACCESS:{user.id}:{kiosk_id}:{uuid.uuid4().hex[:8]}"
        else:
            # Generic User Token: user_id:nonce
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
        token = request.data.get('token')
        device_id = request.data.get('device_id')
        
        if not token or not device_id:
            return Response({'error': 'Missing parameters'}, status=400)
            
        # Verify Device
        from .models import KioskDevice
        device = KioskDevice.objects.filter(device_id=device_id, status='approved').first()
        if not device:
            return Response({'error': 'Invalid device'}, status=403)
            
        # Verify Token
        from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
        signer = TimestampSigner()
        try:
             # Max age 60s for scan
             val = signer.unsign(token, max_age=60)
             
             user_id = None
             # Try parsing USER_ACCESS:user_id:...
             if val.startswith("USER_ACCESS:"):
                 parts = val.split(":")
                 if len(parts) >= 2:
                     user_id = parts[1]
             # Try parsing straight user_id:nonce
             elif ":" in val:
                 parts = val.split(":")
                 if parts[0].isdigit():
                     user_id = parts[0]
                     
             if not user_id:
                 return Response({'error': 'Invalid token format'}, status=400)
                 
             from django.contrib.auth.models import User
             user = User.objects.get(pk=user_id)
             
             # Perform Attendance Action
             # We reuse _perform_attendance_action BUT we need to adapt it because
             # it expects 'request.user' usually.
             
             # We can't call 'self.scan(request)' because request is anonymous here.
             # We simulate authenticated state or extract logic.
             
             now = timezone.now()
             local_now = timezone.localtime(now)
             today = local_now.date()
             
             # Call logic directly
             response = self._perform_attendance_action(user, local_now, now, today, qr_source="DEVICE")
             return response
             
        except (BadSignature, SignatureExpired):
            return Response({'error': 'Invalid token'}, status=400)
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def scan(self, request):
        qr_code = request.data.get('qr_code')
        user = request.user
        
        now = timezone.now()
        local_now = timezone.localtime(now)
        today = local_now.date() 

        # --- 1. Identify Kiosk (User scans Kiosk ID) ---
        if qr_code:
            from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
            signer = TimestampSigner()
            try:
                base_validity = 10
                config = AttendanceKioskConfig.objects.first()
                if config:
                    base_validity = config.qr_validity_seconds
                max_age = base_validity + 20 

                original_value = signer.unsign(qr_code, max_age=max_age)

                # Kiosk Identity Scan -> Return User Token
                if original_value.startswith("KIOSK_ID:"):
                    parts = original_value.split(':', 1)
                    if len(parts) >= 2 and parts[0] == "KIOSK_ID":
                        return self._process_kiosk_identity_scan(request.user, parts[1])

                # --- 2. Check-In/Out Action (Kiosk scans User Token) ---
                if original_value.startswith("USER_ACCESS:"):
                    return self._perform_attendance_action(user, local_now, now, today, qr_source="KIOSK_SCAN")
                    
                if "KIOSK_QR" in qr_code:
                     pass 

            except SignatureExpired:
                return Response({'error': 'A QR kód lejárt.'}, status=400)
            except BadSignature:
                return Response({'error': 'Érvénytelen QR kód.'}, status=400)

        return Response({'message': 'Érvénytelen vagy ismeretlen QR kód.'}, status=400)

    def _process_kiosk_identity_scan(self, user, device_id):
        from .models import KioskDevice, Zone
        try:
            device = KioskDevice.objects.get(device_id=device_id)
        except KioskDevice.DoesNotExist:
            return Response({'error': 'Ismeretlen kioszk eszköz.'}, status=404)
            
        if device.status != 'approved':
             return Response({'error': 'Ez a kioszk nincs engedélyezve.'}, status=403)
             
        if not hasattr(user, 'employee_profile'):
             return Response({'error': 'Nem vagy nyilvántartva munkavállalóként.'}, status=403)
             
        employee = user.employee_profile
        kiosk_zones = device.zones.all()
        
        if not kiosk_zones.exists():
             return Response({'error': f'Kedves {user.first_name}! Ez a kioszk ({device.name}) nincs zónához rendelve.'}, status=403)
             
        employee_departments = employee.departments.all()
        allowed_zones = Zone.objects.filter(departments__in=employee_departments)
        common_zones = kiosk_zones.filter(id__in=allowed_zones.values_list('id', flat=True))
        
        if not common_zones.exists():
            return Response({'error': f'Kedves {user.first_name}! Ez a kioszk nem engedélyezett számodra!'}, status=403)

        signer = TimestampSigner()
        import uuid
        user_access_token = signer.sign(f"USER_ACCESS:{user.id}:{device.device_id}:{uuid.uuid4().hex[:8]}")
        
        return Response({
            'message': 'Kioszk azonosítva. Jogosultság rendben.',
            'kiosk_name': device.name,
            'kiosk_id': device.device_id,
            'access_token': user_access_token,
            'user_name': f"{user.last_name} {user.first_name}",
            'action': 'show_user_qr'
        })

    def _perform_attendance_action(self, user, local_now, now, today, qr_source=None):
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
             return Response({'error': 'Nem található dolgozói profil ehhez a felhasználóhoz'}, status=404)

        attendance_today, created = Attendance.objects.get_or_create(
            employee=employee, 
            date=today,
            defaults={
                'check_in': local_now.time(),
                'break_duration': timedelta(0),
                'overtime_hours': 0,
                'last_activity': now
            }
        )
        if created:
            attendance_today.last_activity = now
            attendance_today.save()
        else:
            if attendance_today.last_activity:
                delta = now - attendance_today.last_activity
                if delta.total_seconds() < 10 and qr_source != "FORCED":
                    logger.info(f"Scan ignored for {user} (debounce: {delta.total_seconds()}s)")
                    return Response({'message': 'Túl gyors beolvasás, kérlek várj!'})
        
        active_log = AccessLog.objects.filter(
            employee=employee,
            check_out_time__isnull=True
        ).order_by('-check_in_time').first()

        message_str = ""
        action_type = ""
        
        if active_log:
            active_start_local = timezone.localtime(active_log.check_in_time)
            
            if active_start_local.date() < today:
                boundary_date = active_start_local.date() + timedelta(days=1)
                boundary_naive = datetime.combine(boundary_date, datetime.min.time())
                boundary_aware = timezone.make_aware(boundary_naive, timezone.get_current_timezone())
                
                active_log.check_out_time = boundary_aware
                active_log.save()
                
                try:
                    att_old = Attendance.objects.get(employee=employee, date=active_start_local.date())
                    att_old.check_out = dt_time(23, 59, 59)
                    att_old.save()
                except Attendance.DoesNotExist:
                    pass

                AccessLog.objects.create(
                    employee=employee,
                    check_in_time=boundary_aware,
                    check_out_time=now,
                    location="Kiosk/Web (Auto Split)",
                    duration_hours=0
                )
                
                attendance_today.check_in = dt_time(0, 0, 0)
                attendance_today.check_out = local_now.time()
                attendance_today.last_activity = now
                attendance_today.save()
                
                message_str = f"Sikeres kilépés (Éjfél átlépve): {local_now.strftime('%H:%M:%S')}"
                action_type = "check_out"
            else:
                active_log.check_out_time = now
                active_log.save()
                
                attendance_today.check_out = local_now.time()
                attendance_today.last_activity = now
                attendance_today.save()
                
                message_str = f"Sikeres kilépés: {local_now.strftime('%H:%M:%S')}"
                action_type = "check_out"
                
        else:
            AccessLog.objects.create(
                employee=employee,
                check_in_time=now,
                location="Kiosk/Web",
                duration_hours=0
            )
            
            attendance_today.check_out = None
            attendance_today.last_activity = now
            attendance_today.save()
            
            message_str = f"Sikeres belépés: {local_now.strftime('%H:%M:%S')}"
            action_type = "check_in"

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
