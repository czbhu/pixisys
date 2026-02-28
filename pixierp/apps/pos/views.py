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
			'authorized_employees',
			'authorized_employees__user'
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
		return Response(serializer.data)
