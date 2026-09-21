from rest_framework import serializers

from apps.warehouse.models import Material, Warehouse

from .models import (
    FuelGrade,
    FuelPump,
    FuelPumpNozzle,
    FuelPumpTotalsLog,
    FuelSaleTransaction,
    FuelShift,
    FuelShiftNozzleReading,
    FuelShiftTankReading,
    FuelStationConfig,
)


class FuelStationConfigSerializer(serializers.ModelSerializer):
    fuel_warehouse_name = serializers.CharField(source='fuel_warehouse.name', read_only=True)

    class Meta:
        model = FuelStationConfig
        fields = [
            'id', 'enabled', 'controller_url', 'auth_type', 'username', 'password',
            'request_timeout', 'poll_interval', 'auto_sync_prices', 'auto_close_transaction',
            'fuel_warehouse', 'fuel_warehouse_name',
            'created_at', 'updated_at',
        ]


class FuelGradeSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit = serializers.CharField(source='material.unit', read_only=True)
    gross_price = serializers.SerializerMethodField()
    nozzle_count = serializers.SerializerMethodField()

    class Meta:
        model = FuelGrade
        fields = [
            'id', 'fuel_grade_id', 'name', 'material', 'material_name', 'material_code',
            'material_unit', 'gross_price', 'nozzle_count', 'is_active', 'created_at', 'updated_at',
        ]

    def get_gross_price(self, obj):
        price = obj.gross_price
        return float(price) if price is not None else None

    def get_nozzle_count(self, obj):
        return obj.nozzles.count()


class FuelPumpNozzleSerializer(serializers.ModelSerializer):
    fuel_grade_name = serializers.CharField(source='fuel_grade.name', read_only=True)
    fuel_grade_id_ref = serializers.IntegerField(source='fuel_grade.fuel_grade_id', read_only=True)

    class Meta:
        model = FuelPumpNozzle
        fields = ['id', 'pump', 'nozzle_number', 'fuel_grade', 'fuel_grade_name', 'fuel_grade_id_ref']


class FuelPumpSerializer(serializers.ModelSerializer):
    nozzles = FuelPumpNozzleSerializer(many=True, read_only=True)
    display_name = serializers.SerializerMethodField()
    open_transaction = serializers.SerializerMethodField()

    class Meta:
        model = FuelPump
        fields = [
            'id', 'pump_id', 'name', 'display_name', 'is_active', 'nozzles', 'open_transaction',
            'created_at', 'updated_at',
        ]

    def get_display_name(self, obj):
        return obj.name or f'{obj.pump_id}. kút'

    def get_open_transaction(self, obj):
        ftx = obj.fuel_transactions.filter(
            state__in=['authorized', 'filling', 'end_of_transaction']
        ).order_by('-created_at').first()
        return FuelSaleTransactionSerializer(ftx).data if ftx else None


class FuelSaleTransactionSerializer(serializers.ModelSerializer):
    pump_name = serializers.SerializerMethodField()
    fuel_grade_name = serializers.CharField(source='fuel_grade.name', read_only=True)
    state_display = serializers.CharField(source='get_state_display', read_only=True)
    pos_transaction_number = serializers.CharField(source='pos_transaction.transaction_number', read_only=True)
    cashier_name = serializers.SerializerMethodField()

    class Meta:
        model = FuelSaleTransaction
        fields = [
            'id', 'pump', 'pump_name', 'nozzle_number', 'fuel_grade', 'fuel_grade_name',
            'pts_transaction_number', 'state', 'state_display', 'source', 'volume', 'unit_price',
            'amount', 'is_test', 'pos_transaction', 'pos_transaction_number', 'terminal', 'cashier',
            'cashier_name', 'stock_deducted', 'started_at', 'ended_at', 'closed_at', 'paid_at',
            'created_at', 'updated_at',
        ]

    def get_pump_name(self, obj):
        return obj.pump.name or f'{obj.pump.pump_id}. kút'

    def get_cashier_name(self, obj):
        if not obj.cashier:
            return None
        return obj.cashier.get_full_name() or obj.cashier.username


class FuelPumpTotalsLogSerializer(serializers.ModelSerializer):
    pump_name = serializers.SerializerMethodField()
    fuel_grade_name = serializers.CharField(source='fuel_grade.name', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)

    class Meta:
        model = FuelPumpTotalsLog
        fields = [
            'id', 'pump', 'pump_name', 'nozzle_number', 'fuel_grade', 'fuel_grade_name',
            'volume_total', 'amount_total', 'source', 'source_display', 'read_at',
        ]

    def get_pump_name(self, obj):
        return obj.pump.name or f'{obj.pump.pump_id}. kút'


class FuelPumpNozzleInputSerializer(serializers.Serializer):
    """Kútfej mentésekor érkező pisztoly definíciók."""
    nozzle_number = serializers.IntegerField(min_value=1, max_value=6)
    fuel_grade = serializers.PrimaryKeyRelatedField(
        queryset=FuelGrade.objects.all(), allow_null=True, required=False
    )


class FuelPumpCreateUpdateSerializer(serializers.ModelSerializer):
    nozzles = FuelPumpNozzleInputSerializer(many=True, required=False)

    class Meta:
        model = FuelPump
        fields = ['id', 'pump_id', 'name', 'is_active', 'nozzles']

    def validate(self, attrs):
        nozzles = attrs.get('nozzles')
        if nozzles is not None:
            numbers = [n['nozzle_number'] for n in nozzles]
            if len(numbers) != len(set(numbers)):
                raise serializers.ValidationError({'nozzles': 'A pisztolyszámok egyediek kell legyenek.'})
        return attrs

    def create(self, validated_data):
        nozzles = validated_data.pop('nozzles', [])
        pump = FuelPump.objects.create(**validated_data)
        self._save_nozzles(pump, nozzles)
        return pump

    def update(self, instance, validated_data):
        nozzles = validated_data.pop('nozzles', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if nozzles is not None:
            self._save_nozzles(instance, nozzles)
        return instance

    def _save_nozzles(self, pump, nozzles):
        keep_ids = []
        for item in nozzles:
            nozzle, _ = FuelPumpNozzle.objects.update_or_create(
                pump=pump,
                nozzle_number=item['nozzle_number'],
                defaults={'fuel_grade': item.get('fuel_grade')},
            )
            keep_ids.append(nozzle.pk)
        pump.nozzles.exclude(pk__in=keep_ids).delete()


class FuelShiftNozzleReadingSerializer(serializers.ModelSerializer):
    pump_name = serializers.SerializerMethodField()
    pump_id_ref = serializers.IntegerField(source='pump.pump_id', read_only=True)
    fuel_grade_name = serializers.CharField(source='fuel_grade.name', read_only=True)
    movement = serializers.SerializerMethodField()

    class Meta:
        model = FuelShiftNozzleReading
        fields = [
            'id', 'pump', 'pump_name', 'pump_id_ref', 'nozzle_number', 'fuel_grade',
            'fuel_grade_name', 'opening_total', 'closing_total', 'closing_source', 'movement',
        ]

    def get_pump_name(self, obj):
        return obj.pump.name or f'{obj.pump.pump_id}. kút'

    def get_movement(self, obj):
        return float(obj.movement) if obj.movement is not None else None


class FuelShiftTankReadingSerializer(serializers.ModelSerializer):
    fuel_grade_name = serializers.CharField(source='fuel_grade.name', read_only=True)
    fuel_grade_id_ref = serializers.IntegerField(source='fuel_grade.fuel_grade_id', read_only=True)
    material_name = serializers.CharField(source='material.name', read_only=True)

    class Meta:
        model = FuelShiftTankReading
        fields = [
            'id', 'fuel_grade', 'fuel_grade_name', 'fuel_grade_id_ref', 'material', 'material_name',
            'opening_stock', 'received', 'dispensed', 'calculated_closing', 'measured_closing',
            'difference',
        ]


class FuelShiftSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    terminal_name = serializers.SerializerMethodField()
    nozzle_readings = FuelShiftNozzleReadingSerializer(many=True, read_only=True)
    tank_readings = FuelShiftTankReadingSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    has_pdf = serializers.SerializerMethodField()

    class Meta:
        model = FuelShift
        fields = [
            'id', 'number', 'status', 'status_display', 'terminal', 'terminal_name',
            'opened_by', 'opened_by_name', 'opened_at', 'closed_by', 'closed_by_name',
            'closed_at', 'counted_cash', 'notes', 'summary', 'nozzle_readings',
            'tank_readings', 'has_pdf', 'created_at',
        ]

    def get_opened_by_name(self, obj):
        if not obj.opened_by:
            return None
        return obj.opened_by.get_full_name() or obj.opened_by.username

    def get_closed_by_name(self, obj):
        if not obj.closed_by:
            return None
        return obj.closed_by.get_full_name() or obj.closed_by.username

    def get_terminal_name(self, obj):
        return obj.terminal.name if obj.terminal else None

    def get_has_pdf(self, obj):
        return bool(obj.pdf_file)
