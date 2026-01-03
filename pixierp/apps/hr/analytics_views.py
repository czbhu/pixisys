from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Sum, Count, Q, F, DecimalField, Case, When, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from datetime import datetime, timedelta
from .models import Employee, TimeLog, AccessLog, ProjectParticipation
from .serializers import TimeLogSerializer, AccessLogSerializer, ProjectParticipationSerializer
from apps.manufacturing.models import Project


class EmployeeAnalyticsViewSet(viewsets.ViewSet):
    """
    Alkalmazotti tevékenység mérési végpontok
    """
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['get'])
    def project_profit_share(self, request):
        """
        1. Projekt profit részesedés - melyik projectben vett részt és mennyi a rájutó rész
        Query params:
        - employee_id: alkalmazott ID (opcionális)
        - start_date: kezdő dátum (YYYY-MM-DD)
        - end_date: záró dátum (YYYY-MM-DD)
        """
        employee_id = request.query_params.get('employee_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Ha nincs dátum megadva, alapértelmezett az aktuális hónap
        if not start_date or not end_date:
            today = timezone.now().date()
            start_date = today.replace(day=1)
            end_date = (start_date + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        else:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Projekt résztvevők lekérdezése
        participations = ProjectParticipation.objects.filter(
            Q(start_date__lte=end_date) & (Q(end_date__gte=start_date) | Q(end_date__isnull=True))
        ).select_related('employee', 'project')
        
        if employee_id:
            participations = participations.filter(employee_id=employee_id)
        
        # Eredmény összeállítása
        results = []
        for participation in participations:
            project = participation.project
            
            # Profit részesedés számítása
            profit_share = (project.profit * participation.participation_percentage) / 100
            
            results.append({
                'employee_id': participation.employee.id,
                'employee_name': participation.employee.user.get_full_name(),
                'project_id': project.id,
                'project_name': project.name,
                'role': participation.role,
                'participation_percentage': float(participation.participation_percentage),
                'project_profit': float(project.profit),
                'profit_share': float(profit_share),
                'project_revenue': float(project.total_revenue),
                'project_cost': float(project.total_cost),
                'project_status': project.status,
                'start_date': participation.start_date,
                'end_date': participation.end_date,
            })
        
        # Összesítés alkalmazottanként
        employee_summary = {}
        for result in results:
            emp_id = result['employee_id']
            if emp_id not in employee_summary:
                employee_summary[emp_id] = {
                    'employee_id': emp_id,
                    'employee_name': result['employee_name'],
                    'total_profit_share': 0,
                    'project_count': 0,
                    'projects': []
                }
            employee_summary[emp_id]['total_profit_share'] += result['profit_share']
            employee_summary[emp_id]['project_count'] += 1
            employee_summary[emp_id]['projects'].append(result)
        
        return Response({
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': list(employee_summary.values()),
            'details': results
        })
    
    @action(detail=False, methods=['get'])
    def time_based_analytics(self, request):
        """
        2. Idő alapú mérés - logolt idő összesen, munkánként és projectenként
        Query params:
        - employee_id: alkalmazott ID (opcionális)
        - start_date: kezdő dátum (YYYY-MM-DD)
        - end_date: záró dátum (YYYY-MM-DD)
        - group_by: csoportosítás ('employee', 'project', 'work_order', 'all')
        """
        employee_id = request.query_params.get('employee_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        group_by = request.query_params.get('group_by', 'all')
        
        # Ha nincs dátum megadva, alapértelmezett az aktuális hónap
        if not start_date or not end_date:
            today = timezone.now().date()
            start_date = today.replace(day=1)
            end_date = (start_date + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        else:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # TimeLog lekérdezése
        time_logs = TimeLog.objects.filter(
            start_time__date__gte=start_date,
            start_time__date__lte=end_date
        ).select_related('employee__user', 'project', 'work_order')
        
        if employee_id:
            time_logs = time_logs.filter(employee_id=employee_id)
        
        # Részletes lista
        details = []
        for log in time_logs:
            details.append({
                'id': log.id,
                'employee_id': log.employee.id,
                'employee_name': log.employee.user.get_full_name(),
                'project_id': log.project.id if log.project else None,
                'project_name': log.project.name if log.project else None,
                'work_order_id': log.work_order.id if log.work_order else None,
                'work_order_number': log.work_order.work_order_number if log.work_order else None,
                'task_description': log.task_description,
                'start_time': log.start_time,
                'end_time': log.end_time,
                'duration_hours': float(log.duration_hours),
                'is_billable': log.is_billable,
            })
        
        # Összesítések
        summary = {
            'total_hours': float(time_logs.aggregate(total=Sum('duration_hours'))['total'] or 0),
            'billable_hours': float(time_logs.filter(is_billable=True).aggregate(total=Sum('duration_hours'))['total'] or 0),
            'non_billable_hours': float(time_logs.filter(is_billable=False).aggregate(total=Sum('duration_hours'))['total'] or 0),
            'log_count': time_logs.count(),
        }
        
        # Alkalmazottankénti összesítés
        by_employee = time_logs.values(
            'employee_id',
            'employee__user__first_name',
            'employee__user__last_name'
        ).annotate(
            total_hours=Sum('duration_hours'),
            billable_hours=Sum('duration_hours', filter=Q(is_billable=True)),
            log_count=Count('id')
        ).order_by('-total_hours')
        
        # Projektenkénti összesítés
        by_project = time_logs.filter(project__isnull=False).values(
            'project_id',
            'project__name'
        ).annotate(
            total_hours=Sum('duration_hours'),
            billable_hours=Sum('duration_hours', filter=Q(is_billable=True)),
            log_count=Count('id'),
            employee_count=Count('employee_id', distinct=True)
        ).order_by('-total_hours')
        
        # Munkalapokra
        by_work_order = time_logs.filter(work_order__isnull=False).values(
            'work_order_id',
            'work_order__work_order_number'
        ).annotate(
            total_hours=Sum('duration_hours'),
            billable_hours=Sum('duration_hours', filter=Q(is_billable=True)),
            log_count=Count('id'),
            employee_count=Count('employee_id', distinct=True)
        ).order_by('-total_hours')
        
        return Response({
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': summary,
            'by_employee': [
                {
                    'employee_id': item['employee_id'],
                    'employee_name': f"{item['employee__user__first_name']} {item['employee__user__last_name']}",
                    'total_hours': float(item['total_hours'] or 0),
                    'billable_hours': float(item['billable_hours'] or 0),
                    'log_count': item['log_count']
                }
                for item in by_employee
            ],
            'by_project': [
                {
                    'project_id': item['project_id'],
                    'project_name': item['project__name'],
                    'total_hours': float(item['total_hours'] or 0),
                    'billable_hours': float(item['billable_hours'] or 0),
                    'log_count': item['log_count'],
                    'employee_count': item['employee_count']
                }
                for item in by_project
            ],
            'by_work_order': [
                {
                    'work_order_id': item['work_order_id'],
                    'work_order_number': item['work_order__work_order_number'],
                    'total_hours': float(item['total_hours'] or 0),
                    'billable_hours': float(item['billable_hours'] or 0),
                    'log_count': item['log_count'],
                    'employee_count': item['employee_count']
                }
                for item in by_work_order
            ],
            'details': details
        })
    
    @action(detail=False, methods=['get'])
    def workplace_attendance(self, request):
        """
        3. Munkahelyen töltött idő - beléptető rendszer adatok alapján
        Query params:
        - employee_id: alkalmazott ID (opcionális)
        - start_date: kezdő dátum (YYYY-MM-DD)
        - end_date: záró dátum (YYYY-MM-DD)
        """
        employee_id = request.query_params.get('employee_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Ha nincs dátum megadva, alapértelmezett az aktuális hónap
        if not start_date or not end_date:
            today = timezone.now().date()
            start_date = today.replace(day=1)
            end_date = (start_date + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        else:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # AccessLog lekérdezése
        access_logs = AccessLog.objects.filter(
            check_in_time__date__gte=start_date,
            check_in_time__date__lte=end_date
        ).select_related('employee__user')
        
        if employee_id:
            access_logs = access_logs.filter(employee_id=employee_id)
        
        # Részletes lista
        details = []
        for log in access_logs:
            details.append({
                'id': log.id,
                'employee_id': log.employee.id,
                'employee_name': log.employee.user.get_full_name(),
                'check_in_time': log.check_in_time,
                'check_out_time': log.check_out_time,
                'duration_hours': float(log.duration_hours),
                'location': log.location,
                'date': log.check_in_time.date(),
            })
        
        # Összesítés
        summary = {
            'total_hours': float(access_logs.aggregate(total=Sum('duration_hours'))['total'] or 0),
            'total_days': access_logs.values('check_in_time__date').distinct().count(),
            'log_count': access_logs.count(),
        }
        
        # Alkalmazottankénti összesítés
        by_employee = access_logs.values(
            'employee_id',
            'employee__user__first_name',
            'employee__user__last_name'
        ).annotate(
            total_hours=Sum('duration_hours'),
            days_count=Count('check_in_time__date', distinct=True),
            log_count=Count('id'),
            avg_daily_hours=Sum('duration_hours') / Count('check_in_time__date', distinct=True)
        ).order_by('-total_hours')
        
        # Naponkénti összesítés
        by_date = access_logs.values(
            'check_in_time__date'
        ).annotate(
            total_hours=Sum('duration_hours'),
            employee_count=Count('employee_id', distinct=True),
            log_count=Count('id')
        ).order_by('check_in_time__date')
        
        # Helyszínenkénti összesítés
        by_location = access_logs.values('location').annotate(
            total_hours=Sum('duration_hours'),
            employee_count=Count('employee_id', distinct=True),
            log_count=Count('id')
        ).order_by('-total_hours')
        
        return Response({
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': summary,
            'by_employee': [
                {
                    'employee_id': item['employee_id'],
                    'employee_name': f"{item['employee__user__first_name']} {item['employee__user__last_name']}",
                    'total_hours': float(item['total_hours'] or 0),
                    'days_count': item['days_count'],
                    'log_count': item['log_count'],
                    'avg_daily_hours': float(item['avg_daily_hours'] or 0)
                }
                for item in by_employee
            ],
            'by_date': [
                {
                    'date': item['check_in_time__date'],
                    'total_hours': float(item['total_hours'] or 0),
                    'employee_count': item['employee_count'],
                    'log_count': item['log_count']
                }
                for item in by_date
            ],
            'by_location': [
                {
                    'location': item['location'],
                    'total_hours': float(item['total_hours'] or 0),
                    'employee_count': item['employee_count'],
                    'log_count': item['log_count']
                }
                for item in by_location
            ],
            'details': details
        })
    
    @action(detail=False, methods=['get'])
    def combined_analytics(self, request):
        """
        Kombinált kimutatás - mind a 3 metrika egyszerre
        """
        profit_share = self.project_profit_share(request).data
        time_analytics = self.time_based_analytics(request).data
        workplace = self.workplace_attendance(request).data
        
        return Response({
            'profit_share': profit_share,
            'time_analytics': time_analytics,
            'workplace_attendance': workplace
        })


class TimeLogViewSet(viewsets.ModelViewSet):
    """TimeLog CRUD műveletek"""
    queryset = TimeLog.objects.all().order_by('-start_time')
    serializer_class = TimeLogSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get('employee_id')
        project_id = self.request.query_params.get('project_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if start_date:
            queryset = queryset.filter(start_time__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(start_time__date__lte=end_date)
        
        return queryset


class AccessLogViewSet(viewsets.ModelViewSet):
    """AccessLog CRUD műveletek"""
    queryset = AccessLog.objects.all().order_by('-check_in_time')
    serializer_class = AccessLogSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get('employee_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if start_date:
            queryset = queryset.filter(check_in_time__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(check_in_time__date__lte=end_date)
        
        return queryset


class ProjectParticipationViewSet(viewsets.ModelViewSet):
    """ProjectParticipation CRUD műveletek"""
    queryset = ProjectParticipation.objects.all().order_by('-start_date')
    serializer_class = ProjectParticipationSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        employee_id = self.request.query_params.get('employee_id')
        project_id = self.request.query_params.get('project_id')
        is_active = self.request.query_params.get('is_active')
        
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset
