from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.hr.models import Employee

from .models import POSTerminal
from .serializers import POSTerminalSerializer


class POSTerminalViewSet(viewsets.ModelViewSet):
	queryset = POSTerminal.objects.all()
	serializer_class = POSTerminalSerializer
	permission_classes = [IsAuthenticated]

	def get_queryset(self):
		qs = POSTerminal.objects.select_related('cash_register', 'cash_register__currency').prefetch_related(
			'material_groups',
			'warehouses',
			'authorized_employees',
			'authorized_employees__user',
			'fuel_pumps',
		)

		is_active = self.request.query_params.get('is_active')
		if is_active is not None:
			qs = qs.filter(is_active=str(is_active).lower() == 'true')

		mine = self.request.query_params.get('mine')
		if str(mine).lower() in ('1', 'true', 'yes'):
			try:
				employee = self.request.user.employee_profile
			except Employee.DoesNotExist:
				return qs.none()
			qs = qs.filter(Q(authorized_employees__isnull=True) | Q(authorized_employees=employee)).distinct()

		return qs

	@action(detail=True, methods=['get'])
	def launch_context(self, request, pk=None):
		terminal = self.get_object()

		try:
			employee = request.user.employee_profile
		except Employee.DoesNotExist:
			return Response({'error': 'A felhasználóhoz nincs alkalmazotti profil rendelve.'}, status=403)

		has_restrictions = terminal.authorized_employees.exists()
		if has_restrictions and not terminal.authorized_employees.filter(id=employee.id).exists():
			return Response({'error': 'Nincs jogosultságod ehhez a POS-hoz.'}, status=403)

		serializer = self.get_serializer(terminal)
		data = dict(serializer.data)
		data['fuel'] = self._build_fuel_context(terminal)
		return Response(data)

	def _build_fuel_context(self, terminal):
		"""Benzinkút modul kontextus a kasszaképernyőnek (None, ha nem aktív)."""
		try:
			from apps.fuel.models import FuelGrade, FuelPump, FuelStationConfig
		except ImportError:
			return None
		config = FuelStationConfig.objects.first()
		if not (config and config.enabled and terminal.fuel_module_enabled):
			return None

		pumps = terminal.fuel_pumps.filter(is_active=True)
		if not pumps.exists():
			pumps = FuelPump.objects.filter(is_active=True)
		fuel = {
			'poll_interval': config.poll_interval or 2,
			'auto_close_transaction': config.auto_close_transaction,
			'fuel_warehouse': (
				{'id': config.fuel_warehouse.id, 'name': config.fuel_warehouse.name}
				if config.fuel_warehouse else None
			),
			'grades': [],
			'pumps': [],
		}
		for grade in FuelGrade.objects.filter(is_active=True).select_related('material'):
			price = grade.gross_price
			fuel['grades'].append({
				'id': grade.id,
				'fuel_grade_id': grade.fuel_grade_id,
				'name': grade.name,
				'material': grade.material_id,
				'material_name': grade.material.name if grade.material else None,
				'unit': grade.material.unit if grade.material else 'liter',
				'price': float(price) if price is not None else None,
			})
		for pump in pumps.prefetch_related('nozzles__fuel_grade'):
			nozzles = []
			for nozzle in pump.nozzles.all():
				nozzles.append({
					'nozzle_number': nozzle.nozzle_number,
					'fuel_grade': nozzle.fuel_grade_id,
					'fuel_grade_name': nozzle.fuel_grade.name if nozzle.fuel_grade else None,
					'fuel_grade_pts_id': nozzle.fuel_grade.fuel_grade_id if nozzle.fuel_grade else None,
				})
			fuel['pumps'].append({
				'id': pump.id,
				'pump_id': pump.pump_id,
				'name': pump.name or f'{pump.pump_id}. kút',
				'nozzles': nozzles,
			})
		return fuel
