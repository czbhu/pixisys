from rest_framework import serializers

from apps.finance.models import CashRegister
from apps.hr.models import Employee
from apps.warehouse.models import MaterialGroup

from .models import POSTerminal


class POSTerminalSerializer(serializers.ModelSerializer):
    cash_register_name = serializers.CharField(source='cash_register.name', read_only=True)
    cash_register_current_balance = serializers.DecimalField(
        source='cash_register.current_balance', max_digits=14, decimal_places=2, read_only=True
    )
    cash_register_currency_code = serializers.CharField(source='cash_register.currency.code', read_only=True)
    cash_register_currency_symbol = serializers.CharField(source='cash_register.currency.symbol', read_only=True)

    material_group_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        source='material_groups',
        queryset=MaterialGroup.objects.all(),
        required=False
    )
    material_group_names = serializers.SerializerMethodField()

    authorized_employee_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        source='authorized_employees',
        queryset=Employee.objects.all(),
        required=False
    )
    authorized_employee_names = serializers.SerializerMethodField()

    class Meta:
        model = POSTerminal
        fields = [
            'id', 'name', 'location', 'hepg', 'cash_register', 'cash_register_name',
            'cash_register_current_balance', 'cash_register_currency_code', 'cash_register_currency_symbol',
            'show_all_categories', 'material_group_ids', 'material_group_names',
            'authorized_employee_ids', 'authorized_employee_names',
            'is_active', 'created_by', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_material_group_names(self, obj):
        return [g.get_full_name() for g in obj.material_groups.all()]

    def get_authorized_employee_names(self, obj):
        names = []
        for employee in obj.authorized_employees.all():
            full_name = employee.user.get_full_name() or employee.user.username
            names.append(full_name)
        return names

    def create(self, validated_data):
        material_groups = validated_data.pop('material_groups', [])
        authorized_employees = validated_data.pop('authorized_employees', [])

        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        terminal = POSTerminal.objects.create(**validated_data)
        if material_groups:
            terminal.material_groups.set(material_groups)
        if authorized_employees:
            terminal.authorized_employees.set(authorized_employees)
        return terminal

    def update(self, instance, validated_data):
        material_groups = validated_data.pop('material_groups', None)
        authorized_employees = validated_data.pop('authorized_employees', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if material_groups is not None:
            instance.material_groups.set(material_groups)
        if authorized_employees is not None:
            instance.authorized_employees.set(authorized_employees)

        return instance
