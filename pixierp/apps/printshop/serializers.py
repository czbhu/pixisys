from django.conf import settings
from rest_framework import serializers
from .models import (
    PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem, PrintMaterial,
    PrintOrderItemComment, SharedPrintPreview, SharedPrintPreviewComment,
    SharedPrintPreviewFolder, SharedPrintPreviewVersion,
    PrintTemplateCategory, PrintTemplate, Machine,
)


class PrintMaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintMaterial
        fields = ['id', 'name', 'description', 'is_active', 'sort_order']


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
    material_name = serializers.SerializerMethodField()
    preview_share_url = serializers.SerializerMethodField()

    class Meta:
        model = PrintOrderItem
        fields = [
            'id', 'order', 'product_name', 'material', 'material_name', 'quantity',
            'width_mm', 'height_mm', 'sides',
            'side1_mode', 'side2_mode',
            'binding', 'folding_count', 'folding_specs',
            'design_json_side1', 'design_json_side2',
            'artwork_side1', 'artwork_side2',
            'generated_pdf', 'generated_pdf_url',
            'unit_price', 'total_price', 'price_breakdown',
            'editor_locked', 'preview_locked', 'locked_at', 'locked_by',
            'preview_share_enabled', 'preview_share_editable', 'preview_share_commentable',
            'preview_share_exportable', 'preview_share_url',
        ]
        read_only_fields = ['id', 'order', 'generated_pdf', 'generated_pdf_url',
                            'editor_locked', 'preview_locked', 'locked_at', 'locked_by']

    def get_generated_pdf_url(self, obj):
        if obj.generated_pdf:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.generated_pdf.url)
            return obj.generated_pdf.url
        return None

    def get_material_name(self, obj):
        return obj.material.name if obj.material else None

    def get_preview_share_url(self, obj):
        if not obj.preview_share_token:
            return None
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', None)
        if not frontend_url:
            request = self.context.get('request')
            if request:
                frontend_url = f"{request.scheme}://{request.get_host()}"
            else:
                return None
        return f"{frontend_url}/public/print-preview/{obj.preview_share_token}"


class PrintOrderItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintOrderItem
        fields = [
            'id', 'product_name', 'material', 'quantity',
            'width_mm', 'height_mm', 'sides',
            'side1_mode', 'side2_mode',
            'binding', 'folding_count', 'folding_specs',
            'design_json_side1', 'design_json_side2',
            'unit_price', 'total_price', 'price_breakdown',
            'editor_locked', 'preview_locked',
        ]


class PrintOrderItemCommentSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source='author_name')

    class Meta:
        model = PrintOrderItemComment
        fields = [
            'id', 'x', 'y', 'w', 'h', 'x2', 'y2',
            'type', 'page', 'text', 'author', 'created_at', 'resolved', 'color',
        ]
        read_only_fields = ['id', 'created_at']


class SharedPrintPreviewSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    folder_name = serializers.CharField(source='folder.name', read_only=True, default=None)
    latest_version_number = serializers.SerializerMethodField()
    version_count = serializers.SerializerMethodField()

    class Meta:
        model = SharedPrintPreview
        fields = [
            'id', 'title', 'token', 'editable', 'commentable', 'exportable',
            'is_active', 'expires_at', 'is_expired',
            'folder', 'folder_name',
            'url', 'pdf_url', 'created_at', 'updated_at',
            'latest_version_number', 'version_count',
        ]
        read_only_fields = [
            'id', 'token', 'url', 'pdf_url', 'created_at', 'updated_at',
            'is_expired', 'folder_name', 'latest_version_number', 'version_count',
        ]

    def get_latest_version_number(self, obj):
        latest = obj.versions.order_by('-version_number').first()
        return latest.version_number if latest else None

    def get_version_count(self, obj):
        return obj.versions.count()

    def get_url(self, obj):
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', None)
        request = self.context.get('request')
        if not frontend_url and request:
            frontend_url = f"{request.scheme}://{request.get_host()}"
        if not frontend_url:
            return None
        return f"{frontend_url.rstrip('/')}/public/print-preview/{obj.token}"

    def get_pdf_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/api/v1/printshop/shared-preview/{obj.token}/pdf/')
        return None


class SharedPrintPreviewCommentSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source='author_name')

    class Meta:
        model = SharedPrintPreviewComment
        fields = [
            'id', 'x', 'y', 'w', 'h', 'x2', 'y2',
            'type', 'page', 'text', 'author', 'created_at', 'resolved', 'color',
        ]
        read_only_fields = ['id', 'created_at']


class SharedPrintPreviewFolderSerializer(serializers.ModelSerializer):
    preview_count = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = SharedPrintPreviewFolder
        fields = ['id', 'name', 'parent', 'preview_count', 'children_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'preview_count', 'children_count']

    def get_preview_count(self, obj):
        return obj.previews.count()

    def get_children_count(self, obj):
        return obj.children.count()


class SharedPrintPreviewVersionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = SharedPrintPreviewVersion
        fields = [
            'id', 'version_number', 'note', 'annotations',
            'created_at', 'created_by_name', 'pdf_url',
        ]
        read_only_fields = ['id', 'created_at', 'created_by_name', 'pdf_url']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_pdf_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(
                f'/api/v1/printshop/shared-preview/{obj.preview.token}/versions/{obj.id}/pdf/'
            )
        return None


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


class PrintTemplateCategorySerializer(serializers.ModelSerializer):
    template_count = serializers.SerializerMethodField()

    class Meta:
        model = PrintTemplateCategory
        fields = ['id', 'name', 'description', 'sort_order', 'template_count', 'created_at', 'updated_at']

    def get_template_count(self, obj):
        return obj.templates.filter(is_active=True).count()


class PrintTemplateSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = PrintTemplate
        fields = [
            'id', 'name', 'category', 'category_name', 'file', 'file_url',
            'file_type', 'thumbnail', 'thumbnail_url', 'is_active', 'sort_order',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_by_name', 'file_type', 'file_url', 'thumbnail_url']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def get_thumbnail_url(self, obj):
        if obj.thumbnail:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.thumbnail.url)
            return obj.thumbnail.url
        return None


class MachineSerializer(serializers.ModelSerializer):
    """Gép serializer."""
    tech_type_display = serializers.CharField(
        source='get_tech_type_display', read_only=True)

    class Meta:
        model = Machine
        fields = [
            'id', 'name', 'tech_type', 'tech_type_display',
            'max_width_mm', 'max_height_mm',
            'hourly_cost', 'setup_time_min',
            'print_cost_per_m2', 'speed_m2_per_hour',
            'click_cost_color', 'click_cost_bw',
            'is_active', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
