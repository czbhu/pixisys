from rest_framework import serializers
from .models import PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem


class PrintSizePresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintSizePreset
        fields = ['id', 'name', 'width_mm', 'height_mm', 'is_active', 'sort_order']


class PrintPricingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintPricingConfig
        fields = [
            'id', 'paper_cost_per_m2',
            'print_color_cost', 'print_bw_cost', 'print_color_white_cost',
            'cutting_cost', 'folding_cost_per_fold',
            'margin_pct', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


class PrintOrderItemSerializer(serializers.ModelSerializer):
    generated_pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = PrintOrderItem
        fields = [
            'id', 'order', 'product_name', 'quantity',
            'width_mm', 'height_mm', 'sides',
            'side1_mode', 'side2_mode',
            'binding', 'folding_count', 'folding_specs',
            'design_json_side1', 'design_json_side2',
            'artwork_side1', 'artwork_side2',
            'generated_pdf', 'generated_pdf_url',
            'unit_price', 'total_price', 'price_breakdown',
        ]
        read_only_fields = ['id', 'order', 'generated_pdf', 'generated_pdf_url']

    def get_generated_pdf_url(self, obj):
        if obj.generated_pdf:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.generated_pdf.url)
            return obj.generated_pdf.url
        return None


class PrintOrderItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintOrderItem
        fields = [
            'id', 'product_name', 'quantity',
            'width_mm', 'height_mm', 'sides',
            'side1_mode', 'side2_mode',
            'binding', 'folding_count', 'folding_specs',
            'design_json_side1', 'design_json_side2',
            'unit_price', 'total_price', 'price_breakdown',
        ]


class PrintOrderSerializer(serializers.ModelSerializer):
    items = PrintOrderItemWriteSerializer(many=True, required=False)
    total_price = serializers.ReadOnlyField()
    created_by_name = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PrintOrder
        fields = [
            'id', 'company', 'company_name', 'contact', 'contact_name',
            'created_by', 'created_by_name', 'status', 'status_display',
            'notes', 'items', 'total_price',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_company_name(self, obj):
        return obj.company.name if obj.company else None

    def get_contact_name(self, obj):
        return obj.contact.name if obj.contact else None

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        order = PrintOrder.objects.create(**validated_data)
        for item_data in items_data:
            PrintOrderItem.objects.create(order=order, **item_data)
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                PrintOrderItem.objects.create(order=instance, **item_data)
        return instance


class PrintOrderListSerializer(serializers.ModelSerializer):
    total_price = serializers.ReadOnlyField()
    company_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = PrintOrder
        fields = [
            'id', 'company', 'company_name', 'status', 'status_display',
            'total_price', 'item_count', 'created_at',
        ]

    def get_company_name(self, obj):
        return obj.company.name if obj.company else None

    def get_item_count(self, obj):
        return obj.items.count()
