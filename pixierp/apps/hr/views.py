from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from django.utils.crypto import get_random_string
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
from datetime import datetime, date, timedelta, time as dt_time
from django.db.models import Min, Max, Q
from calendar import monthrange
from collections import defaultdict
import re
import unicodedata
import subprocess
import shlex
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging
import requests
import secrets

logger = logging.getLogger(__name__)

from apps.core.permissions import (
    OwnDataFilterMixin,
    HasPermission,
    check_permission,
    has_own_data_permission,
)
from apps.core.models import Zone
from apps.core.services import send_notification
from .models import Department, Position, Employee, Attendance, LeaveRequest, Payroll, AccessLog, AttendanceKioskConfig, TaskConfiguration, TaskExecution
from .serializers import (
    DepartmentSerializer, PositionSerializer, EmployeeSerializer,
    AttendanceSerializer, LeaveRequestSerializer, PayrollSerializer, AttendanceReportSerializer, AttendanceKioskConfigSerializer,
    TaskConfigurationSerializer, TaskExecutionSerializer
)

User = get_user_model()


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.order_by('sort_order', 'name')
    serializer_class = DepartmentSerializer


class PositionViewSet(viewsets.ModelViewSet):
    queryset = Position.objects.order_by('title', 'department__name')
    serializer_class = PositionSerializer


class TaskConfigurationViewSet(viewsets.ModelViewSet):
    queryset = TaskConfiguration.objects.all().prefetch_related('employees__user', 'departments')
    serializer_class = TaskConfigurationSerializer
    permission_classes = [AllowAny]

    def _get_employee(self, request):
        return getattr(request.user, 'employee_profile', None)

    def _get_allowed_kiosk_device_ids(self, user, employee):
        from .models import KioskDevice

        if employee:
            departments = employee.departments.all()
            if departments.exists():
                zones = Zone.objects.filter(departments__in=departments)
                return list(
                    KioskDevice.objects.filter(zones__in=zones, status='approved')
                    .distinct()
                    .values_list('device_id', flat=True)
                )
            return []

        if user.is_staff or user.is_superuser:
            return list(KioskDevice.objects.filter(status='approved').values_list('device_id', flat=True))

        return []

    def _is_task_for_employee(self, task, employee):
        if not employee:
            return False
        if task.employees.filter(id=employee.id).exists():
            return True
        employee_department_ids = set(employee.departments.values_list('id', flat=True))
        task_department_ids = set(task.departments.values_list('id', flat=True))
        return bool(employee_department_ids.intersection(task_department_ids))

    def _period_window(self, task, now, employee):
        local_now = timezone.localtime(now)
        if task.frequency_type == 'once':
            start = timezone.make_aware(datetime.combine(date(1970, 1, 1), dt_time.min))
            end = timezone.make_aware(datetime.combine(date(9999, 12, 31), dt_time.max))
            period_key = 'once:global'
            return start, end, period_key

        if task.frequency_type == 'daily':
            start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            period_key = f"daily:{start.date().isoformat()}"
            return start, end, period_key

        if task.frequency_type == 'weekly':
            week_start_date = local_now.date() - timedelta(days=local_now.weekday())
            start = timezone.make_aware(datetime.combine(week_start_date, dt_time.min))
            end = start + timedelta(days=7)
            period_key = f"weekly:{week_start_date.isoformat()}"
            return start, end, period_key

        if task.frequency_type == 'monthly':
            month_start_date = local_now.date().replace(day=1)
            start = timezone.make_aware(datetime.combine(month_start_date, dt_time.min))
            if month_start_date.month == 12:
                next_month_start = date(month_start_date.year + 1, 1, 1)
            else:
                next_month_start = date(month_start_date.year, month_start_date.month + 1, 1)
            end = timezone.make_aware(datetime.combine(next_month_start, dt_time.min))
            period_key = f"monthly:{month_start_date.strftime('%Y-%m')}"
            return start, end, period_key

        if task.frequency_type == 'yearly':
            year_start_date = date(local_now.year, 1, 1)
            start = timezone.make_aware(datetime.combine(year_start_date, dt_time.min))
            next_year_start = date(local_now.year + 1, 1, 1)
            end = timezone.make_aware(datetime.combine(next_year_start, dt_time.min))
            period_key = f"yearly:{local_now.year}"
            return start, end, period_key

        login_time = getattr(employee.user, 'last_login', None) if employee and employee.user else None
        start = login_time or local_now
        if timezone.is_naive(start):
            start = timezone.make_aware(start)
        period_owner = employee.id if employee else 0
        period_key = f"login:{period_owner}:{int(start.timestamp())}"
        end = start + timedelta(days=1)
        return start, end, period_key

    def _calculate_due_at(self, task, now, period_start, completed_count):
        due_at = period_start
        required_count = max(1, int(task.required_count or 1))

        if task.frequency_type == 'weekly' and task.days_of_week:
            today_weekday = now.weekday()
            valid_days = sorted([d for d in task.days_of_week if isinstance(d, int) and 0 <= d <= 6])
            if valid_days:
                selected_day = next((d for d in valid_days if d >= today_weekday), valid_days[0])
                day_offset = selected_day - today_weekday if selected_day >= today_weekday else (7 - today_weekday + selected_day)
                due_date = now.date() + timedelta(days=day_offset)
                due_at = timezone.make_aware(datetime.combine(due_date, dt_time.min))

        if task.schedule_type in ('time', 'time_and_count') and task.interval_minutes:
            occurrence_index = min(required_count, completed_count + 1)
            due_at = due_at + timedelta(minutes=int(task.interval_minutes) * occurrence_index)

        if task.frequency_type == 'monthly':
            _, month_last_day = monthrange(period_start.year, period_start.month)
            selected_day = int(task.due_day_of_month or 1)
            selected_day = max(1, min(selected_day, month_last_day))
            due_at = timezone.make_aware(datetime.combine(date(period_start.year, period_start.month, selected_day), dt_time.min))

        if task.frequency_type == 'yearly':
            selected_month = int(task.due_month_of_year or 12)
            selected_month = max(1, min(selected_month, 12))
            _, month_last_day = monthrange(period_start.year, selected_month)
            selected_day = int(task.due_day_of_month or month_last_day)
            selected_day = max(1, min(selected_day, month_last_day))
            due_at = timezone.make_aware(datetime.combine(date(period_start.year, selected_month, selected_day), dt_time.min))

        return due_at

    def _task_type(self, task):
        if task.kiosk_required:
            return 'kiosk'
        if task.qr_required:
            return 'qr'
        return 'simple'

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=str(is_active).lower() == 'true')
        return qs.order_by('name')

    @action(detail=False, methods=['post'])
    def generate_qr(self, request):
        token = secrets.token_urlsafe(16)
        return Response({'qr_code': token})

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated], url_path='my-tasks')
    def my_tasks(self, request):
        employee = self._get_employee(request)
        if not employee:
            return Response([], status=status.HTTP_200_OK)

        now = timezone.now()
        configs = TaskConfiguration.objects.filter(
            is_active=True
        ).filter(
            Q(employees=employee) | Q(departments__in=employee.departments.all())
        ).distinct().prefetch_related('employees', 'departments')

        response_rows = []
        for config in configs:
            period_start, period_end, period_key = self._period_window(config, now, employee)

            base_executions = TaskExecution.objects.filter(
                task_configuration=config,
                period_key=period_key,
            )
            if config.target_level == 'person':
                period_executions = base_executions.filter(employee=employee)
            else:
                department_ids = config.departments.values_list('id', flat=True)
                period_executions = base_executions.filter(employee__departments__id__in=department_ids).distinct()

            completed_queryset = period_executions.filter(status='completed')
            completed_count = completed_queryset.count()
            latest_completed = completed_queryset.order_by('-completed_at').first()

            active_execution = base_executions.filter(
                employee=employee,
                status__in=['in_progress', 'paused']
            ).order_by('-started_at').first()

            required_count = max(1, int(config.required_count or 1))
            is_completed = completed_count >= required_count
            due_at = self._calculate_due_at(config, now, period_start, completed_count)
            due_in_minutes = int((due_at - now).total_seconds() // 60)
            flexibility_minutes = int(config.flexibility_minutes or 0)
            overdue_at = due_at + timedelta(minutes=flexibility_minutes)
            overdue_minutes = int((now - overdue_at).total_seconds() // 60) if (now > overdue_at and not is_completed) else 0

            active_payload = None
            if active_execution:
                elapsed_seconds = active_execution.get_total_duration_seconds(now=now)
                active_payload = {
                    'id': active_execution.id,
                    'status': active_execution.status,
                    'started_at': active_execution.started_at,
                    'last_resumed_at': active_execution.last_resumed_at,
                    'paused_at': active_execution.paused_at,
                    'notes': active_execution.notes or '',
                    'elapsed_seconds': elapsed_seconds,
                    'elapsed_minutes': round(elapsed_seconds / 60, 2),
                }

            duration_minutes = None
            if latest_completed:
                duration_minutes = round(latest_completed.get_total_duration_seconds() / 60, 2)

            response_rows.append({
                'task_id': config.id,
                'task_code': f"TASK-{config.id}",
                'task_name': config.name,
                'description': config.description or '',
                'task_type': self._task_type(config),
                'due_at': due_at,
                'due_in_minutes': due_in_minutes,
                'overdue_minutes': overdue_minutes,
                'period_key': period_key,
                'required_count': required_count,
                'completed_count': completed_count,
                'is_completed': is_completed,
                'completed_at': latest_completed.completed_at if latest_completed else None,
                'completed_by_name': (
                    latest_completed.completed_by.get_full_name() or latest_completed.completed_by.username
                    if latest_completed and latest_completed.completed_by else None
                ),
                'duration_minutes': duration_minutes,
                'active_execution': active_payload,
                'qr_required': config.qr_required,
                'kiosk_required': config.kiosk_required,
                'can_start': (not is_completed and not active_execution),
                'can_resume': bool(active_execution and active_execution.status == 'paused'),
                'can_finish': bool(active_execution),
                'sort_due': due_at,
            })

        response_rows.sort(key=lambda row: row['sort_due'])
        for row in response_rows:
            row.pop('sort_due', None)

        return Response(response_rows, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='request-kiosk-token')
    def request_kiosk_token(self, request, pk=None):
        task = self.get_object()
        employee = self._get_employee(request)
        if not employee or not self._is_task_for_employee(task, employee):
            return Response({'error': 'Nincs jogosultság a feladathoz.'}, status=status.HTTP_403_FORBIDDEN)

        if not task.kiosk_required:
            return Response({'error': 'Ehhez a feladathoz nem kell KIOSK azonosítás.'}, status=status.HTTP_400_BAD_REQUEST)

        allowed_kiosk_ids = self._get_allowed_kiosk_device_ids(request.user, employee)
        if not allowed_kiosk_ids:
            return Response({'error': 'Nincs engedélyezett KIOSK a dolgozó zónáiban.'}, status=status.HTTP_403_FORBIDDEN)

        kiosk_cfg = AttendanceKioskConfig.objects.first()
        qr_validity_seconds = int(kiosk_cfg.qr_validity_seconds) if kiosk_cfg and kiosk_cfg.qr_validity_seconds else 10
        nonce = secrets.token_urlsafe(8)
        signer = TimestampSigner()
        payload = f"TASK_KIOSK:{request.user.id}:{task.id}:{nonce}"
        signed_token = signer.sign(payload)

        channel_layer = get_channel_layer()
        user_name = request.user.get_full_name() or request.user.username or 'Felhasználó'
        for kiosk_device_id in allowed_kiosk_ids:
            async_to_sync(channel_layer.group_send)(
                f"attendance_kiosk_{kiosk_device_id}",
                {
                    "type": "kiosk_message",
                    "message": {
                        "type": "show_qr",
                        "qr_data": signed_token,
                        "user_name": user_name,
                        "mode": "task_kiosk"
                    }
                }
            )

        return Response({
            'message': 'A KIOSK QR kód kiküldve az engedélyezett kioszkokra.',
            'kiosk_count': len(allowed_kiosk_ids),
            'expires_seconds': qr_validity_seconds,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='start-execution')
    def start_execution(self, request, pk=None):
        task = self.get_object()
        employee = self._get_employee(request)
        if not employee or not self._is_task_for_employee(task, employee):
            return Response({'error': 'Nincs jogosultság a feladathoz.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        _, _, period_key = self._period_window(task, now, employee)

        existing_active = TaskExecution.objects.filter(
            task_configuration=task,
            employee=employee,
            period_key=period_key,
            status__in=['in_progress', 'paused']
        ).order_by('-started_at').first()
        if existing_active:
            return Response(TaskExecutionSerializer(existing_active).data, status=status.HTTP_200_OK)

        base_executions = TaskExecution.objects.filter(task_configuration=task, period_key=period_key)
        if task.target_level == 'person':
            completed_count = base_executions.filter(employee=employee, status='completed').count()
        else:
            department_ids = task.departments.values_list('id', flat=True)
            completed_count = base_executions.filter(employee__departments__id__in=department_ids, status='completed').distinct().count()

        required_count = max(1, int(task.required_count or 1))
        if completed_count >= required_count:
            return Response({'error': 'A feladat ebben a periódusban már teljesítve lett.'}, status=status.HTTP_400_BAD_REQUEST)

        scanned_qr = (request.data.get('qr_code') or '').strip()
        if task.qr_required and scanned_qr != (task.qr_code or '').strip():
            return Response({'error': 'Érvénytelen QR kód.'}, status=status.HTTP_400_BAD_REQUEST)

        kiosk_verified = False
        if task.kiosk_required:
            provided_token = (request.data.get('kiosk_token') or '').strip()
            if not provided_token:
                return Response({'error': 'A KIOSK token megadása kötelező.'}, status=status.HTTP_400_BAD_REQUEST)

            kiosk_cfg = AttendanceKioskConfig.objects.first()
            qr_validity_seconds = int(kiosk_cfg.qr_validity_seconds) if kiosk_cfg and kiosk_cfg.qr_validity_seconds else 10

            signer = TimestampSigner()
            try:
                original = signer.unsign(provided_token, max_age=qr_validity_seconds + 20)
                parts = original.split(':')
                if len(parts) < 4 or parts[0] != 'TASK_KIOSK':
                    raise BadSignature('Hibás token formátum')

                token_user_id = parts[1]
                token_task_id = parts[2]
                if str(token_user_id) != str(request.user.id) or str(token_task_id) != str(task.id):
                    return Response({'error': 'A KIOSK token nem ehhez a felhasználóhoz vagy feladathoz tartozik.'}, status=status.HTTP_403_FORBIDDEN)
            except SignatureExpired:
                return Response({'error': 'Lejárt KIOSK token.'}, status=status.HTTP_400_BAD_REQUEST)
            except BadSignature:
                return Response({'error': 'Érvénytelen KIOSK token.'}, status=status.HTTP_400_BAD_REQUEST)

            kiosk_verified = True

        notes = (request.data.get('notes') or '').strip()
        execution = TaskExecution.objects.create(
            task_configuration=task,
            employee=employee,
            started_by=request.user,
            status='in_progress',
            started_at=now,
            last_resumed_at=now,
            notes=notes,
            period_key=period_key,
            qr_verified_code=scanned_qr if task.qr_required else '',
            kiosk_verified=kiosk_verified,
        )
        return Response(TaskExecutionSerializer(execution).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='pause-execution')
    def pause_execution(self, request, pk=None):
        task = self.get_object()
        employee = self._get_employee(request)
        if not employee or not self._is_task_for_employee(task, employee):
            return Response({'error': 'Nincs jogosultság a feladathoz.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        _, _, period_key = self._period_window(task, now, employee)
        execution = TaskExecution.objects.filter(
            task_configuration=task,
            employee=employee,
            period_key=period_key,
            status='in_progress'
        ).order_by('-started_at').first()

        if not execution:
            return Response({'error': 'Nincs futó feladat.'}, status=status.HTTP_400_BAD_REQUEST)

        if execution.last_resumed_at:
            execution.total_duration_seconds = execution.get_total_duration_seconds(now=now)
        execution.status = 'paused'
        execution.paused_at = now
        execution.last_resumed_at = None
        notes = request.data.get('notes')
        if notes is not None:
            execution.notes = notes
        execution.save()
        return Response(TaskExecutionSerializer(execution).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='resume-execution')
    def resume_execution(self, request, pk=None):
        task = self.get_object()
        employee = self._get_employee(request)
        if not employee or not self._is_task_for_employee(task, employee):
            return Response({'error': 'Nincs jogosultság a feladathoz.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        _, _, period_key = self._period_window(task, now, employee)
        execution = TaskExecution.objects.filter(
            task_configuration=task,
            employee=employee,
            period_key=period_key,
            status='paused'
        ).order_by('-started_at').first()

        if not execution:
            return Response({'error': 'Nincs szüneteltetett feladat.'}, status=status.HTTP_400_BAD_REQUEST)

        execution.status = 'in_progress'
        execution.last_resumed_at = now
        execution.paused_at = None
        notes = request.data.get('notes')
        if notes is not None:
            execution.notes = notes
        execution.save()
        return Response(TaskExecutionSerializer(execution).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated], url_path='complete-execution')
    def complete_execution(self, request, pk=None):
        task = self.get_object()
        employee = self._get_employee(request)
        if not employee or not self._is_task_for_employee(task, employee):
            return Response({'error': 'Nincs jogosultság a feladathoz.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        _, _, period_key = self._period_window(task, now, employee)
        execution = TaskExecution.objects.filter(
            task_configuration=task,
            employee=employee,
            period_key=period_key,
            status__in=['in_progress', 'paused']
        ).order_by('-started_at').first()

        if not execution:
            return Response({'error': 'Nincs lezárható feladat.'}, status=status.HTTP_400_BAD_REQUEST)

        total_seconds = execution.get_total_duration_seconds(now=now)
        execution.total_duration_seconds = total_seconds
        execution.status = 'completed'
        execution.completed_at = now
        execution.completed_by = request.user
        execution.last_resumed_at = None
        execution.paused_at = None
        notes = request.data.get('notes')
        if notes is not None:
            execution.notes = notes
        execution.save()
        return Response(TaskExecutionSerializer(execution).data, status=status.HTTP_200_OK)


class EmployeeViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = Employee.objects.order_by('user__last_name', 'user__first_name', 'employee_id')
    serializer_class = EmployeeSerializer
    permission_classes = [HasPermission]
    permission_module = 'hr'
    permission_resource = 'hr.employees'
    own_data_user_field = 'user'
    
    def perform_destroy(self, instance):
        """
        Delete the associated User when the Employee is deleted.
        """
        user = instance.user
        instance.delete()
        if user:
            user.delete()

    def _hestia_cli_run(self, cmd_parts, cfg, timeout=30):
        cmd = list(cmd_parts)

        if cfg and cfg.cli_use_sudo:
            sudo_cmd = ['sudo', '-n']
            sudo_runner = (cfg.cli_sudo_runner or '').strip()
            ssh_user = (cfg.ssh_user or '').strip()
            if sudo_runner and sudo_runner != ssh_user:
                sudo_cmd.extend(['-u', sudo_runner])
            cmd = sudo_cmd + cmd

        if cfg and cfg.ssh_enabled:
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

    def _delete_hestia_mailbox(self, email_address: str):
        from apps.core.models import HestiaConfig

        if not email_address or '@' not in email_address:
            return {'success': True, 'skipped': True, 'message': 'Nincs érvényes e-mail cím, mailbox törlés kihagyva.'}

        local_part, domain = email_address.strip().lower().split('@', 1)
        hestia_config = HestiaConfig.objects.filter(is_active=True).first()
        if not hestia_config:
            return {'success': False, 'error': 'Nincs aktív Hestia konfiguráció.'}

        hestia_mode = (hestia_config.mode or 'cli').strip().lower()
        hestia_user = (hestia_config.hestia_user or '').strip()
        hestia_bin = (hestia_config.cli_bin_path or '/usr/local/hestia/bin').rstrip('/')

        if not hestia_user:
            return {'success': False, 'error': 'A Hestia user nincs beállítva.'}

        if hestia_mode == 'rest':
            rest_api_url = (hestia_config.rest_api_url or '').strip()
            rest_api_user = (hestia_config.rest_api_user or '').strip()
            rest_api_password = (hestia_config.rest_api_password or '').strip()

            if not rest_api_url or not rest_api_user or not rest_api_password:
                return {'success': False, 'error': 'A Hestia REST módhoz hiányzik az API URL/felhasználó/jelszó.'}

            try:
                response = requests.post(
                    rest_api_url,
                    data={
                        'user': rest_api_user,
                        'password': rest_api_password,
                        'returncode': 'yes',
                        'cmd': 'v-delete-mail-account',
                        'arg1': hestia_user,
                        'arg2': domain,
                        'arg3': local_part,
                        'arg4': 'yes',
                    },
                    timeout=30,
                )
                payload = (response.text or '').strip()
                lower_payload = payload.lower()
                if response.status_code >= 400 or payload not in ('0', 'OK', 'ok', ''):
                    if 'not exist' in lower_payload or 'does not exist' in lower_payload:
                        return {'success': True, 'skipped': True, 'message': 'A mailbox nem létezett a Hestia rendszerben.'}
                    return {'success': False, 'error': f'Hestia REST hiba: {payload or response.status_code}'}

                return {'success': True, 'message': 'Mailbox törölve Hestia REST API-val.'}
            except requests.RequestException as exc:
                return {'success': False, 'error': f'Hestia REST kapcsolat hiba: {str(exc)}'}

        if hestia_config.ssh_enabled and (not hestia_config.ssh_host or not hestia_config.ssh_user):
            return {'success': False, 'error': 'SSH módhoz kötelező a host és user mező.'}

        delete_cmd = [
            f"{hestia_bin}/v-delete-mail-account",
            hestia_user,
            domain,
            local_part,
            'yes',
        ]
        result = self._hestia_cli_run(delete_cmd, hestia_config, timeout=40)
        if result.returncode != 0:
            err = (result.stderr or result.stdout or '').strip()
            lower_err = err.lower()
            if 'not exist' in lower_err or 'does not exist' in lower_err:
                return {'success': True, 'skipped': True, 'message': 'A mailbox nem létezett a Hestia rendszerben.'}

            sudo_user = (hestia_config.ssh_user or 'ceze').strip() or 'ceze'
            sudoers_file = f"/etc/sudoers.d/{sudo_user}-hestia"
            sudoers_cmds = (
                f"sudo visudo -f {sudoers_file}\n"
                f"{sudo_user} ALL=(root) NOPASSWD: /usr/local/hestia/bin/v-list-sys-info, /usr/local/hestia/bin/v-list-mail-domain, /usr/local/hestia/bin/v-list-mail-accounts, /usr/local/hestia/bin/v-add-mail-account, /usr/local/hestia/bin/v-delete-mail-account\n"
                f"sudo chmod 440 {sudoers_file}\n"
                f"sudo -l -U {sudo_user}"
            )

            if 'sudo' in lower_err and ('password is required' in lower_err or 'jelszó szükséges' in lower_err or 'not allowed to execute' in lower_err):
                return {
                    'success': False,
                    'error': f'Sudo jogosultsági hiba: {err}',
                    'hint': sudoers_cmds,
                }

            return {'success': False, 'error': f'Hestia hiba: {err or "ismeretlen hiba"}'}

        return {'success': True, 'message': 'Mailbox és tartalma törölve Hestia CLI-vel.'}

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        delete_mailbox_raw = request.query_params.get('delete_mailbox', '0')
        delete_mailbox = str(delete_mailbox_raw).strip().lower() in ('1', 'true', 'yes', 'on')

        if delete_mailbox:
            email_address = (getattr(instance.user, 'email', '') or '').strip()
            mailbox_result = self._delete_hestia_mailbox(email_address)
            if not mailbox_result.get('success'):
                payload = {'error': mailbox_result.get('error', 'Mailbox törlés sikertelen.')}
                if mailbox_result.get('hint'):
                    payload['hint'] = mailbox_result.get('hint')
                return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

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
            try:
                from apps.core.email_utils import archive_to_imap_sent
                archive_to_imap_sent(email_config, msg)
            except Exception:
                pass
            
            return Response({'message': 'Jelszó generálva és e-mailben elküldve'})
        except Exception as e:
            logger.error(f"Jelszó generálás email hiba: {str(e)}")
            return Response(
                {'message': f'Jelszó generálva, de e-mail küldése sikertelen: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def generate_email_account(self, request):
        """E-mail cím generálása és Hestia postafiók létrehozása."""
        from apps.core.models import EmailServerConfig, HestiaConfig, EmailTemplate
        from django.core.mail import get_connection, EmailMultiAlternatives

        first_name = (request.data.get('first_name') or '').strip()
        last_name = (request.data.get('last_name') or '').strip()
        create_account = request.data.get('create_account', True)

        if not first_name or not last_name:
            return Response(
                {'error': 'A keresztnév és vezetéknév megadása kötelező.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def normalize_part(value: str) -> str:
            normalized = unicodedata.normalize('NFKD', value)
            ascii_value = normalized.encode('ascii', 'ignore').decode('ascii')
            cleaned = re.sub(r'[^a-zA-Z0-9]+', '.', ascii_value).strip('.')
            cleaned = re.sub(r'\.+', '.', cleaned)
            return cleaned.lower()

        local_part = f"{normalize_part(first_name)}.{normalize_part(last_name)}"
        local_part = re.sub(r'\.+', '.', local_part).strip('.')
        if not local_part:
            return Response(
                {'error': 'Nem sikerült e-mail előtagot képezni a névből.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def resolve_department_domain() -> str:
            department_ids = request.data.get('department_ids')
            employee_id = request.data.get('employee_id')
            selected_departments = Department.objects.none()

            if isinstance(department_ids, list) and department_ids:
                selected_departments = Department.objects.filter(id__in=department_ids)
            elif employee_id:
                employee = Employee.objects.filter(id=employee_id).prefetch_related('departments').first()
                if employee:
                    selected_departments = employee.departments.all()

            prioritized = selected_departments.exclude(email_domain__isnull=True).exclude(email_domain='').order_by('sort_order', 'name').first()
            if prioritized:
                return prioritized.email_domain.strip().lower()
            return ''

        hestia_config = HestiaConfig.objects.filter(is_active=True).first()
        department_domain = resolve_department_domain()
        domain = (
            request.data.get('domain')
            or department_domain
            or (hestia_config.default_domain if hestia_config else '')
            or getattr(settings, 'HESTIA_EMAIL_DOMAIN', '')
            or ''
        ).strip().lower()

        if not domain:
            email_config = EmailServerConfig.objects.filter(is_active=True).first()
            if email_config and email_config.from_email and '@' in email_config.from_email:
                domain = email_config.from_email.split('@', 1)[1].lower()

        if not domain:
            return Response(
                {'error': 'Nincs beállítva HESTIA_EMAIL_DOMAIN és nem található aktív feladó domain sem.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email_address = f"{local_part}@{domain}"

        if not create_account:
            return Response({'email': email_address, 'account_created': False})

        hestia_mode = (hestia_config.mode if hestia_config else 'cli').strip().lower()
        hestia_user = ((hestia_config.hestia_user if hestia_config else '') or getattr(settings, 'HESTIA_CLI_USER', '') or '').strip()
        hestia_bin = ((hestia_config.cli_bin_path if hestia_config else '') or getattr(settings, 'HESTIA_CLI_BIN', '') or '/usr/local/hestia/bin').rstrip('/')
        cli_use_sudo = bool(hestia_config.cli_use_sudo) if hestia_config else False
        cli_sudo_runner = (hestia_config.cli_sudo_runner if hestia_config else '').strip()
        ssh_enabled = bool(hestia_config.ssh_enabled) if hestia_config else False
        ssh_host = (hestia_config.ssh_host if hestia_config else '').strip()
        ssh_port = int(hestia_config.ssh_port) if hestia_config and hestia_config.ssh_port else 22
        ssh_user = (hestia_config.ssh_user if hestia_config else '').strip()
        ssh_key_path = (hestia_config.ssh_private_key_path if hestia_config else '').strip()
        ssh_strict_host_key = bool(hestia_config.ssh_strict_host_key) if hestia_config else True

        if not hestia_user:
            return Response(
                {'error': 'HESTIA_CLI_USER nincs beállítva a szerveren.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        mailbox_password = get_random_string(16)

        def notify_creator_with_credentials(created_email: str, created_password: str):
            notify_error = None
            creator_user = request.user if request.user and request.user.is_authenticated else None

            if creator_user:
                try:
                    send_notification(
                        user=creator_user,
                        title='Új alkalmazotti e-mail fiók létrehozva',
                        message=f'E-mail: {created_email} | Jelszó: {created_password}',
                        link='/hr/employees',
                        type='success'
                    )
                except Exception as exc:
                    notify_error = f'In-app értesítés hiba: {str(exc)}'
                    logger.warning(notify_error)

            creator_email = (getattr(creator_user, 'email', '') or '').strip() if creator_user else ''
            if not creator_email:
                return notify_error or 'A létrehozó felhasználónak nincs e-mail címe, ezért e-mail értesítés nem ment ki.'

            email_config = EmailServerConfig.objects.filter(is_active=True).first()
            if not email_config:
                return notify_error or 'Nincs aktív email szerver konfiguráció, ezért e-mail értesítés nem ment ki.'

            try:
                template, _ = EmailTemplate.objects.get_or_create(
                    key='hr_employee_mailbox_credentials',
                    defaults={
                        'name': 'HR - Postafiók belépési adatok',
                        'subject_template': 'Új postafiók beállítások - {VezetékNév} {KeresztNév}',
                        'body_template': (
                            '<p>Kedves Kolléga!</p>'
                            '<p>A postafiók létrehozása sikeresen megtörtént. Az alábbi adatokkal tudtok belépni:</p>'
                            '<p><strong>Név:</strong> {VezetékNév} {KeresztNév}<br/>'
                            '<strong>Domain:</strong> {domain}<br/>'
                            '<strong>E-mail cím:</strong> {e-mail cím}<br/>'
                            '<strong>Jelszó:</strong> {jelszó}</p>'
                            '<p>Kérlek, az első belépés után változtassátok meg a jelszót.</p>'
                            '<p>Üdvözlettel,<br/>PixiERP</p>'
                        ),
                        'is_html': True,
                        'description': 'Alkalmazotti postafiók létrehozásakor küldött belépési adatok.',
                    }
                )

                context_values = {
                    'KeresztNév': first_name,
                    'VezetékNév': last_name,
                    'domain': domain,
                    'e-mail cím': created_email,
                    'jelszó': created_password,
                    'email': created_email,
                    'password': created_password,
                    'first_name': first_name,
                    'last_name': last_name,
                }

                def render_template(content: str) -> str:
                    rendered = content or ''
                    for key, value in context_values.items():
                        rendered = rendered.replace(f'{{{key}}}', str(value or ''))
                    return rendered

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
                subject = render_template(template.subject_template) or 'Új alkalmazott e-mail belépési adatai - PixiERP'
                html_content = render_template(template.body_template)
                text_content = re.sub(r'<[^>]+>', '', html_content)

                msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text_content,
                    from_email=from_email,
                    to=[creator_email],
                    connection=connection,
                )
                msg.attach_alternative(html_content, 'text/html')
                msg.send()
                try:
                    from apps.core.email_utils import archive_to_imap_sent
                    archive_to_imap_sent(email_config, msg)
                except Exception:
                    pass
                return notify_error
            except Exception as exc:
                email_err = f'Belépési adatok e-mail küldése sikertelen: {str(exc)}'
                logger.warning(email_err)
                return notify_error or email_err

        if hestia_mode == 'rest':
            rest_api_url = (hestia_config.rest_api_url if hestia_config else '').strip()
            rest_api_user = (hestia_config.rest_api_user if hestia_config else '').strip()
            rest_api_password = (hestia_config.rest_api_password if hestia_config else '').strip()

            if not rest_api_url or not rest_api_user or not rest_api_password:
                return Response(
                    {'error': 'A Hestia REST módhoz hiányzik az API URL/felhasználó/jelszó.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            try:
                response = requests.post(
                    rest_api_url,
                    data={
                        'user': rest_api_user,
                        'password': rest_api_password,
                        'returncode': 'yes',
                        'cmd': 'v-add-mail-account',
                        'arg1': hestia_user,
                        'arg2': domain,
                        'arg3': local_part,
                        'arg4': mailbox_password,
                    },
                    timeout=25,
                )
                payload = (response.text or '').strip()
                if response.status_code >= 400 or payload not in ('0', 'OK', 'ok', ''):
                    lower_payload = payload.lower()
                    if 'exist' in lower_payload or 'already' in lower_payload:
                        return Response(
                            {
                                'email': email_address,
                                'account_created': False,
                                'message': 'Az e-mail fiók már létezik, a mező kitöltve.',
                            }
                        )
                    return Response(
                        {'error': f'Hestia REST hiba: {payload or response.status_code}'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                return Response(
                    {
                        'email': email_address,
                        'account_created': True,
                        'mailbox_password': mailbox_password,
                        'message': 'E-mail cím generálva és postafiók létrehozva Hestia REST API-val.',
                        'creator_notification_warning': notify_creator_with_credentials(email_address, mailbox_password),
                    }
                )
            except requests.RequestException as exc:
                return Response(
                    {'error': f'Hestia REST kapcsolat hiba: {str(exc)}'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        base_cmd = [
            f"{hestia_bin}/v-add-mail-account",
            hestia_user,
            domain,
            local_part,
            mailbox_password,
        ]
        cmd = list(base_cmd)
        if cli_use_sudo:
            sudo_cmd = ['sudo', '-n']
            if cli_sudo_runner and cli_sudo_runner != ssh_user:
                sudo_cmd.extend(['-u', cli_sudo_runner])
            cmd = sudo_cmd + cmd

        if ssh_enabled:
            if not ssh_host or not ssh_user:
                return Response(
                    {'error': 'SSH módhoz kötelező a host és user mező.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            remote_cmd = ' '.join(shlex.quote(part) for part in cmd)
            ssh_cmd = [
                'ssh',
                '-p', str(ssh_port),
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=10',
                '-o', f"StrictHostKeyChecking={'yes' if ssh_strict_host_key else 'no'}",
            ]
            if not ssh_strict_host_key:
                ssh_cmd.extend(['-o', 'UserKnownHostsFile=/dev/null'])
            if ssh_key_path:
                ssh_cmd.extend(['-i', ssh_key_path])
            ssh_cmd.append(f"{ssh_user}@{ssh_host}")
            ssh_cmd.append(remote_cmd)
            cmd = ssh_cmd

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=25,
                check=False,
            )

            if result.returncode != 0:
                error_output = (result.stderr or result.stdout or '').strip()
                lower_error = error_output.lower()
                sudo_user = (ssh_user or 'ceze').strip() or 'ceze'
                sudoers_file = f"/etc/sudoers.d/{sudo_user}-hestia"
                sudoers_cmds = (
                    f"sudo visudo -f {sudoers_file}\n"
                    f"{sudo_user} ALL=(root) NOPASSWD: /usr/local/hestia/bin/v-list-sys-info, /usr/local/hestia/bin/v-list-mail-domain, /usr/local/hestia/bin/v-list-mail-accounts, /usr/local/hestia/bin/v-add-mail-account\n"
                    f"sudo chmod 440 {sudoers_file}\n"
                    f"sudo -l -U {sudo_user}"
                )
                if 'exist' in lower_error or 'already' in lower_error:
                    return Response(
                        {
                            'email': email_address,
                            'account_created': False,
                            'message': 'Az e-mail fiók már létezik, a mező kitöltve.',
                        }
                    )

                if (
                    'hestia.conf' in lower_error and 'permission denied' in lower_error
                ) or (
                    '/usr/local/hestia/log/error.log' in lower_error and 'permission denied' in lower_error
                ):
                    hint = f'A Hestia CLI futtatásához engedélyezd a "CLI futtatás sudo-val" opciót a Hestia beállításokban, és adj jelszó nélküli sudo jogot a szükséges Hestia parancsokra.\n\n{sudoers_cmds}'
                    return Response(
                        {'error': f'Hestia jogosultsági hiba: {error_output}', 'hint': hint},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if 'sudo' in lower_error and (
                    'password is required' in lower_error
                    or 'jelszó szükséges' in lower_error
                    or 'not allowed to execute' in lower_error
                ):
                    return Response(
                        {'error': f'Sudo jogosultsági hiba: {error_output}', 'hint': sudoers_cmds},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                logger.error(f"Hestia mailbox create failed: {error_output}")
                return Response(
                    {'error': f'Hestia hiba: {error_output or "ismeretlen hiba"}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            return Response(
                {
                    'email': email_address,
                    'account_created': True,
                    'mailbox_password': mailbox_password,
                    'message': 'E-mail cím generálva és postafiók létrehozva Hestia-ban.',
                    'creator_notification_warning': notify_creator_with_credentials(email_address, mailbox_password),
                }
            )

        except FileNotFoundError:
            return Response(
                {'error': f'Hestia CLI nem található: {hestia_bin}/v-add-mail-account'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except subprocess.TimeoutExpired:
            return Response(
                {'error': 'Hestia művelet timeout.'},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as exc:
            logger.exception('Unexpected Hestia mailbox error')
            return Response(
                {'error': f'Váratlan hiba: {str(exc)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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
        
        # DEBUG LOGGING
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"SCAN REQUEST: User={user}, Code={qr_code}")
        
        now = timezone.now()
        local_now = timezone.localtime(now)
        today = local_now.date() 

        # --- QR LOGIN (munkaállomás bejelentkezési QR — plain, nem aláírt) ---
        if qr_code and str(qr_code).startswith("LOGIN_QR:"):
            session_id = str(qr_code)[len("LOGIN_QR:"):]
            from django.core.cache import cache
            data = cache.get(f'qr_login:{session_id}')
            if data is None:
                return Response({'error': 'A bejelentkezési QR kód lejárt.'}, status=404)
            if data.get('status') != 'pending':
                return Response({'error': 'Ez a QR kód már fel lett használva.'}, status=400)
            from rest_framework_simplejwt.tokens import RefreshToken
            from apps.core.serializers import UserSerializer
            refresh = RefreshToken.for_user(user)
            cache.set(f'qr_login:{session_id}', {
                'status': 'approved',
                'tokens': {
                    'access': str(refresh.access_token),
                    'refresh': str(refresh),
                },
                'user': UserSerializer(user).data,
            }, timeout=30)
            return Response({'message': f'Bejelentkezés jóváhagyva: {user.get_full_name() or user.username}'})

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

                # Kiosk Identity Scan -> TRIGGER IDENTITY CHALLENGE (WS)
                if original_value.startswith("KIOSK_ID:"):
                    parts = original_value.split(':', 1)
                    if len(parts) >= 2 and parts[0] == "KIOSK_ID":
                        return self._initiate_kiosk_challenge(request, parts[1])

                # --- 2. Check-In/Out Action (Kiosk scans User Token) OR User scans Challenge Token ---
                
                # CASE A: CHALLENGE RESPONSE (User scans Kiosk Challenge Token)
                # Format: CHALLENGE:user_id:kiosk_id:nonce
                if original_value.startswith("CHALLENGE:"):
                     return self._process_challenge_response(request, original_value)

                # CASE B: USER_ACCESS (Old flow - Kiosk scans user) -> Still support?
                if original_value.startswith("USER_ACCESS:"):
                    return self._perform_attendance_action(user, local_now, now, today, qr_source="KIOSK_SCAN")
                    
                if "KIOSK_QR" in qr_code:
                     pass 

            except (SignatureExpired, BadSignature):
                 # Fallback: Allow static or expired KIOSK_ID qr codes (e.g. stickers)
                if str(qr_code).startswith("KIOSK_ID:"):
                    parts = str(qr_code).split(':')
                    if len(parts) >= 2:
                        return self._initiate_kiosk_challenge(request, parts[1])
                
                return Response({'error': 'Érvénytelen vagy lejárt QR kód.'}, status=400)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return Response({'error': 'Hiba a feldolgozás során.'}, status=400)

        return Response({'message': 'Érvénytelen vagy ismeretlen QR kód.'}, status=400)

    def _initiate_kiosk_challenge(self, request, device_id):
        """
        Step 1: User scans Kiosk. 
        Backend tells Kiosk via WS to show a specific Challenge QR code for THIS user.
        """
        user = request.user
        from .models import KioskDevice
        try:
            device = KioskDevice.objects.get(device_id=device_id)
        except KioskDevice.DoesNotExist:
            return Response({'error': 'Ismeretlen kioszk eszköz.'}, status=404)
            
        if device.status != 'approved':
             return Response({'error': 'Ez a kioszk nincs engedélyezve.'}, status=403)
             
        # Generate Challenge Token
        # It must include User ID and Kiosk ID to bind them.
        import uuid
        from django.core.signing import TimestampSigner
        signer = TimestampSigner()
        
        # Challenge Token: Signed(CHALLENGE:user_id:kiosk_id:nonce)
        # Validity: Short (e.g. 30s) because user is standing right there.
        challenge_payload = f"CHALLENGE:{user.id}:{device.device_id}:{uuid.uuid4().hex[:8]}"
        challenge_token = signer.sign(challenge_payload)
        
        # Send to Kiosk via WebSocket
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        # Group name is usually 'attendance_{device_id}' based on consumer logic? 
        # Checking consumer... Assumed 'attendance_{device_id}' or similar.
        # Based on KioskPage.tsx: wsUrl = `/ws/attendance/${deviceId}/`
        # Consumers usually group by URL param. Let's assume group name is `attendance_{device_id}`.
        
        async_to_sync(channel_layer.group_send)(
            f"attendance_kiosk_{device.device_id}",
            {
                "type": "kiosk.message",
                "message": {
                    "type": "show_qr",
                    "qr_data": challenge_token,
                    "user_name": f"{user.last_name} {user.first_name}",
                    "mode": "challenge"
                }
            }
        )
        
        # --- RESET OTHER KIOSKS & STOP ROTATION ---
        # 1. Stop Rotation Loop on User's Controller
        async_to_sync(channel_layer.group_send)(
            f"qr_controller_{user.id}",
            {
                "type": "controller_message",
                "message": { "type": "stop_rotation" }
            }
        )

        # 2. Reset other kiosks
        try:
            from apps.core.models import Zone
            
            # Logic to find allowed kiosks (Replicates consumer logic)
            allowed_ids = []
            
            # 1. Employee-based logic (Priority)
            if hasattr(user, 'employee_profile'):
                employee_p = user.employee_profile
                departments = employee_p.departments.all()
                if departments:
                    zones = Zone.objects.filter(departments__in=departments)
                    # Exclude current kiosk
                    kiosks = KioskDevice.objects.filter(zones__in=zones, status='approved').exclude(device_id=device.device_id).distinct()
                    allowed_ids = [k.device_id for k in kiosks]
            
            # 2. Admin fallback (Only if no employee restrictions found above)
            elif user.is_staff or user.is_superuser:
                # Admin controls all active kiosks
                allowed_ids = list(KioskDevice.objects.filter(status='approved').exclude(device_id=device.device_id).values_list('device_id', flat=True))

            
            if allowed_ids:
                for other_id in allowed_ids:
                    async_to_sync(channel_layer.group_send)(
                        f"attendance_kiosk_{other_id}",
                        {
                            "type": "kiosk_message",
                            "message": { "type": "stop_qr" }
                        }
                    )
        except Exception as e:
            logger.error(f"Error in Identify Reset: {e}")

        return Response({
            'message': 'Kioszk azonosítva. Kérlek olvasd be a kioszk képernyőjén megjelenő QR kódot!',
            'action': 'kiosk_challenge_sent'
        })

    def _process_challenge_response(self, request, signed_token):
        """
        Step 2: User scans the Challenge QR displayed on Kiosk.
        Backend validates it matches the user and performs check-in.
        """
        user = request.user
        # Token is already unsigned by caller (scan method), but wait... 
        # scan method only unsigns 'original_value'.  It passes 'original_value' here. 
        # Correct.
        
        parts = signed_token.split(':')
        # Structure: CHALLENGE:user_id:kiosk_id:nonce
        if len(parts) < 4:
            return Response({'error': 'Hibás token formátum'}, status=400)
            
        token_user_id = parts[1]
        token_kiosk_id = parts[2]
        
        if str(token_user_id) != str(user.id):
             return Response({'error': 'Ez a kód nem neked szól!'}, status=403)
             
        # Perform Attendance Action
        now = timezone.now()
        local_now = timezone.localtime(now)
        today = local_now.date()
        
        # We can fetch kiosk name for logging
        from .models import KioskDevice
        kiosk_name = "Kiosk"
        try:
            kiosk = KioskDevice.objects.get(device_id=token_kiosk_id)
            kiosk_name = kiosk.name
        except:
            pass
            
        return self._perform_attendance_action(user, local_now, now, today, qr_source=f"CHALLENGE:{kiosk_name}", kiosk_id=token_kiosk_id)


    def _perform_attendance_action(self, user, local_now, now, today, qr_source=None, kiosk_id=None):
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
                # Skip debounce for CHALLENGE flow (quick sequential scans are expected)
                is_challenge = qr_source and qr_source.startswith("CHALLENGE:")
                if delta.total_seconds() < 10 and qr_source != "FORCED" and not is_challenge:
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
        
        # Send success message to the specific kiosk if kiosk_id provided
        if kiosk_id:
            # 1. Send Success to the identified Kiosk
            async_to_sync(channel_layer.group_send)(
                f"attendance_kiosk_{kiosk_id}",
                {
                    "type": "kiosk_message",
                    "message": {
                        "type": "success",
                        "user_name": f"{user.last_name} {user.first_name}",
                        "timestamp": local_now.strftime('%Y-%m-%d %H:%M:%S'),
                        "action": action_type
                    }
                }
            )

            # 2. Sync Reset: Send stop_qr to ALL OTHER kiosks accessible to this user
            try:
                from .models import KioskDevice
                from apps.core.models import Zone
                
                # Logic to find allowed kiosks (Replicates consumer logic)
                allowed_ids = []
                
                # 1. Employee based logic
                if hasattr(user, 'employee_profile'):
                    employee_p = user.employee_profile
                    departments = employee_p.departments.all()
                    if departments:
                        zones = Zone.objects.filter(departments__in=departments)
                        # Exclude current kiosk
                        kiosks = KioskDevice.objects.filter(zones__in=zones, status='approved').exclude(device_id=kiosk_id).distinct()
                        allowed_ids = [k.device_id for k in kiosks]

                # 2. Admin fallback
                elif user.is_staff or user.is_superuser:
                    # Admin controls all active kiosks
                    allowed_ids = list(KioskDevice.objects.filter(status='approved').exclude(device_id=kiosk_id).values_list('device_id', flat=True))
                
                if allowed_ids:
                    # logger.info(f"Sync Reset: Stopping kiosks {allowed_ids}")
                    for other_id in allowed_ids:
                        async_to_sync(channel_layer.group_send)(
                            f"attendance_kiosk_{other_id}",
                            {
                                "type": "kiosk_message",
                                "message": { "type": "stop_qr" }
                            }
                        )
            except Exception as e:
                logger.error(f"Error in Sync Reset: {e}")

        else:
            # Fallback: broadcast to all kiosks (legacy)
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
        try:
            """
            Get attendance report with filtering options
            """
            # Get filter parameters
            employee_id = request.query_params.get('employee_id')
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            month_filter = request.query_params.get('month', 'current')

            user = request.user
            can_view_all = check_permission(user, self.permission_module, self.permission_resource, 'view')
            can_view_own = has_own_data_permission(user, self.permission_module, self.permission_resource)
            
            # Check if requesting own data implicitly
            is_requesting_own = False
            try:
                if hasattr(user, 'employee_profile'):
                    user_emp_id = user.employee_profile.id
                    # If no employee_id specified, it defaults to own (handled later)
                    if not employee_id:
                        is_requesting_own = True
                    # If specified, must match
                    elif str(employee_id) == str(user_emp_id):
                        is_requesting_own = True
            except:
                pass

            # Deny access if the user has no relevant permission AND is not requesting own data
            if not (can_view_all or can_view_own or is_requesting_own):
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
            if can_view_all and employee_id:
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
                if log.check_in_time:
                    log_date = timezone.localtime(log.check_in_time).date()
                    attendance_dict[log.employee_id][log_date].append(log)
            
            # Build report data
            report_data = []
            
            # Get all employees in the filter
            if target_employee_id:
                employees = Employee.objects.filter(id=target_employee_id, is_active=True)
            else:
                employees = Employee.objects.filter(is_active=True)
            
            can_edit = check_permission(user, self.permission_module, self.permission_resource, 'edit')

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
                        
                        # Calculate total hours (sum of all duration)
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
                        last_log = logs_for_day[-1]
                        if last_log.check_out_time:
                            check_out = last_log.check_out_time

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
        except Exception as e:
            import traceback
            logger.error(f"Attendance Report Error: {str(e)}\n{traceback.format_exc()}")
            return Response({'error': str(e), 'detail': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
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

    @action(detail=False, methods=['post'], permission_classes=[HasPermission])
    def restart_all(self, request):
        """
        Broadcasts a 'reload' message to all connected Kiosk devices.
        """
        logger.info(f"Kiosk Restart initiated by user {request.user}")
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "attendance_kiosk_broadcast",
            {
                'type': 'kiosk_message',
                'message': {
                    'type': 'reload'
                }
            }
        )
        return Response({'status': 'restarted', 'message': 'Újraindítási parancs elküldve minden Kiosknak.'})

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

    @action(detail=True, methods=['post'])
    def restart(self, request, pk=None):
        if not request.user.is_authenticated:
            return Response(status=401)
        device = self.get_object()
        
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"attendance_kiosk_{device.device_id}",
            {
                "type": "kiosk_message",
                "message": {
                    "type": "restart"
                }
            }
        )
        return Response({'status': 'restart_sent'})

    @action(detail=True, methods=['post'])
    def identify(self, request, pk=None):
        if not request.user.is_authenticated:
            return Response(status=401)
        device = self.get_object()
        
        mode = request.data.get('mode', 'start') # start | stop
        
        channel_layer = get_channel_layer()
        # Ensure we broadcast to both specific device group and generic group (if listener is legacy)
        # But we only really care about the specific one now.
        groups = [f"attendance_kiosk_{device.device_id}", "attendance_kiosk"]
        
        for group in groups:
           async_to_sync(channel_layer.group_send)(
               group,
               {
                   'type': 'kiosk_message',
                   'message': {
                       'type': 'identify',
                       'mode': mode,
                       'device_id': device.device_id,
                       'name': device.name
                   }
               }
           )
        return Response({'status': f'identified_{mode}'})
