from rest_framework import serializers
from .models import (
    ProductClass, Project, ManufacturingProduct, Service, ServiceGroup,
    CalculatorTemplate, Calculation, ServiceSupplierPrice, ServiceCostItem,
    ManufacturingCostItem, ProductTemplate, ProductTemplateSize,
    ProductTemplateQuantityDiscount, ManufacturingProductAttachment,
)
from apps.crm.models import Contact, Company as CRMCompany
from apps.crm.utils import sync_company_to_local_db
from apps.finance.views import PixinvoiceClient
from apps.hr.models import Department, Employee
from apps.core.models import Currency
from apps.warehouse.models import Material


class ManufacturingProductAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ManufacturingProductAttachment
        fields = ['id', 'file', 'file_url', 'remark', 'uploaded_by', 'created_at']
        read_only_fields = ['file_url', 'uploaded_by', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and hasattr(obj.file, 'url'):
            url = obj.file.url
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        return None


class ProductClassSerializer(serializers.ModelSerializer):
    hr_department_names = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductClass
        fields = '__all__'
    
    def get_hr_department_names(self, obj):
        return [dept.name for dept in obj.hr_departments.all()]

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        try:
            url = obj.image.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url


class ProjectSerializer(serializers.ModelSerializer):
    contact_names = serializers.SerializerMethodField()
    project_manager_name = serializers.SerializerMethodField()
    company_name = serializers.CharField(source='company.name', read_only=True)
    
    class Meta:
        model = Project
        fields = '__all__'
    
    def get_contact_names(self, obj):
        return [contact.name for contact in obj.contacts.all()]
    
    def get_project_manager_name(self, obj):
        return obj.project_manager.get_full_name() if obj.project_manager else None


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ['id', 'code', 'name', 'symbol', 'exchange_rate', 'is_default']


class ManufacturingCostItemSerializer(serializers.ModelSerializer):
    supplier = serializers.PrimaryKeyRelatedField(
        queryset=CRMCompany.objects.all(),
        required=False,
        allow_null=True
    )
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        required=False,
        allow_null=True
    )
    department_name = serializers.CharField(source='department.name', read_only=True)
    code = serializers.SerializerMethodField()
    # Client-supplied index (within the cost_items array of the request)
    # of this item's parent cost item. Used because parent FK refers to
    # other rows that may not exist yet at create-time.
    parent_index = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    parent = serializers.PrimaryKeyRelatedField(read_only=True)

    def get_code(self, obj):
        """Resolve cost item's source code (material or service)."""
        try:
            if obj.type == 'material' and obj.ref_id:
                from apps.warehouse.models import Material
                m = Material.objects.filter(id=obj.ref_id).only('code').first()
                return m.code if m else ''
            if obj.type == 'service' and obj.ref_id:
                from apps.manufacturing.models import Service
                s = Service.objects.filter(id=obj.ref_id).only('code').first()
                return s.code if s else ''
        except Exception:
            pass
        return ''

    class Meta:
        model = ManufacturingCostItem
        exclude = ['product']


class ManufacturingProductSerializer(serializers.ModelSerializer):
    product_class_name = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    contact_company_name = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    currency_info = serializers.SerializerMethodField()
    cost_items = ManufacturingCostItemSerializer(many=True, required=False)
    
    # We accept a list of IDs (which might be external UUIDs or internal Integers)
    allowed_companies = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )
    
    allowed_contacts = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )
    
    allowed_companies_data = serializers.SerializerMethodField(read_only=True)
    allowed_contacts_data = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ManufacturingProduct
        fields = '__all__'

    def get_allowed_companies_data(self, obj):
        # Return internal integer id so the frontend Select can match options
        return [{'id': c.id, 'name': c.name} for c in obj.allowed_companies.all()]

    def get_allowed_contacts_data(self, obj):
        # Return internal integer id so the frontend Select can match options
        result = []
        for c in obj.allowed_contacts.all():
            last = getattr(c, 'last_name', '') or ''
            first = getattr(c, 'first_name', '') or ''
            name = f"{last} {first}".strip() or getattr(c, 'name', '') or str(c.id)
            result.append({'id': c.id, 'name': name})
        return result

    @staticmethod
    def _link_cost_parents(created_items, parent_indexes):
        """Second pass: assign parent FK based on client-supplied index in the
        cost_items array. ``parent_indexes[i]`` is the index of the parent of
        ``created_items[i]`` (or None for root)."""
        for i, parent_idx in enumerate(parent_indexes or []):
            if parent_idx is None:
                continue
            try:
                pi = int(parent_idx)
            except (TypeError, ValueError):
                continue
            if pi == i or pi < 0 or pi >= len(created_items):
                continue
            child = created_items[i]
            child.parent = created_items[pi]
            child.save(update_fields=['parent'])

    def _resolve_companies(self, company_ids):
        """
        Resolves a list of company IDs (integers or UUIDs) to local Company instances.
        If a UUID is provided, looks up by external_id.
        """
        import datetime
        if not company_ids:
            return []
            
        resolved_companies = []
        with open("/tmp/debug_serializer.log", "a") as f:
            f.write(f"{datetime.datetime.now()} - Resolving companies: {company_ids}\n")
            
        for cid in company_ids:
            # 1. Try as Integer ID (Local ID)
            if isinstance(cid, int) or (isinstance(cid, str) and cid.isdigit()):
                try:
                    c = CRMCompany.objects.get(id=int(cid))
                    resolved_companies.append(c)
                    continue
                except CRMCompany.DoesNotExist:
                    pass
            
            # 2. Try as External ID (UUID)
            # Check if it is a valid UUID string
            c = CRMCompany.objects.filter(external_id=str(cid)).first()
            if c:
                # Stub check: if name is placeholders, try to heal
                if c.name.startswith("External Client") or c.name == 'Névtelen':
                     try:
                         client = PixinvoiceClient()
                         data = client.get_customer(str(cid))
                         if data:
                             synced = sync_company_to_local_db(data)
                             if synced:
                                 c = synced
                     except Exception:
                         pass
                resolved_companies.append(c)
                continue
                
            # 3. Not found locally?
            # Attempt fetch from PixInvoice
            try:
                 client = PixinvoiceClient()
                 data = client.get_customer(str(cid))
                 if data:
                     new_company = sync_company_to_local_db(data)
                     if new_company:
                         resolved_companies.append(new_company)
                         continue
            except Exception:
                 pass

            # User instruction: "Just save the identifiers".
            # We treat the ERP local database as a cache/proxy. If the ID is valid (UUID-like) but missing,
            # we create a stub record. The details will be synced later or are irrelevant for the relation storage.
            
            try:
                # Basic validation: ensure it looks somewhat like a legitimate ID (not empty)
                if cid and len(str(cid)) > 1:
                     new_company = CRMCompany.objects.create(
                         external_id=str(cid),
                         name=f"External Client {str(cid)[:8]}", # Placeholder name
                         is_customer=True
                     )
                     resolved_companies.append(new_company)
                     with open("/tmp/debug_serializer.log", "a") as f:
                        f.write(f"Created stub company for external_id: {cid}\n")
            except Exception as e:
                with open("/tmp/debug_serializer.log", "a") as f:
                     f.write(f"Error creating stub for {cid}: {e}\n")
            
        with open("/tmp/debug_serializer.log", "a") as f:
            f.write(f"Resolved count: {len(resolved_companies)}\n")
            
        return resolved_companies

    def _resolve_contacts(self, contact_ids):
        resolved_contacts = []
        for cid in contact_ids:
            # 1. Try as Integer ID
            if isinstance(cid, int) or (isinstance(cid, str) and cid.isdigit()):
                try:
                    c = Contact.objects.get(id=int(cid))
                    resolved_contacts.append(c)
                    continue
                except Contact.DoesNotExist:
                    pass
            
            # 2. Try as External ID (UUID)
            c = Contact.objects.filter(external_id=str(cid)).first()
            if c:
                resolved_contacts.append(c)
                continue
            
            # 3. Not found locally? Try sync from PixInvoice?
            # For now, we skip auto-sync for contacts here unless we want to implement `sync_contact_to_local_db`.
            # There is no `sync_contact_to_local_db` yet.
            # However, if the frontend supplies UUIDs from `crm/contacts` API, they might be in PixInvoice but not local.
            # Implementing stub creation or fetch would be robust.
            
            try:
                # Basic stub creation if looks like UUID
                if cid and len(str(cid)) > 10:
                     new_contact = Contact.objects.create(
                         external_id=str(cid),
                         name=f"External Contact {str(cid)[:8]}",
                         last_name="External",
                         first_name=str(cid)[:8]
                     )
                     resolved_contacts.append(new_contact)
            except Exception:
                pass
        return resolved_contacts

    def create(self, validated_data):
        cost_items_data = validated_data.pop('cost_items', [])
        allowed_companies_ids = validated_data.pop('allowed_companies', [])
        allowed_contacts_ids = validated_data.pop('allowed_contacts', [])
        
        product = ManufacturingProduct.objects.create(**validated_data)
        
        # Generate code if missing
        if not product.code:
             import re
             name = product.name or "GY"
             base = re.sub(r'[^A-Z0-9]', '', name[:10].upper())
             if not base:
                 base = "GY"
             product.code = f"{base}-{product.id}"
             product.save()
        
        if allowed_companies_ids:
            companies = self._resolve_companies(allowed_companies_ids)
            product.allowed_companies.set(companies)
            
        if allowed_contacts_ids:
            contacts = self._resolve_contacts(allowed_contacts_ids)
            product.allowed_contacts.set(contacts)

        parent_indexes = [item.pop('parent_index', None) for item in cost_items_data]
        created = []
        for item_data in cost_items_data:
            created.append(ManufacturingCostItem.objects.create(product=product, **item_data))
        # Second pass: link parents by index
        self._link_cost_parents(created, parent_indexes)
        return product

    def update(self, instance, validated_data):
        cost_items_data = validated_data.pop('cost_items', None)
        allowed_companies_ids = validated_data.pop('allowed_companies', None)
        allowed_contacts_ids = validated_data.pop('allowed_contacts', None)
        
        # DEBUG LOGGING TO FILE
        import datetime
        with open("/tmp/debug_serializer.log", "a") as f:
            f.write(f"{datetime.datetime.now()} - Method: update\n")
            f.write(f"allowed_companies_ids: {allowed_companies_ids}\n")

        # Update standard fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if allowed_companies_ids is not None:
             companies = self._resolve_companies(allowed_companies_ids)
             instance.allowed_companies.set(companies)
             
        if allowed_contacts_ids is not None:
             contacts = self._resolve_contacts(allowed_contacts_ids)
             instance.allowed_contacts.set(contacts)

        if cost_items_data is not None:
             # Snapshot existing statuses by sort_order so a full PATCH from the
             # inline editor (which doesn't expose status) doesn't reset progress
             # already made on the customer-order subitems page.
             old_status_by_so = {
                 ci.sort_order: ci.status for ci in instance.cost_items.all()
             }
             # Full replacement strategy
             instance.cost_items.all().delete()
             parent_indexes = [item.pop('parent_index', None) for item in cost_items_data]
             created = []
             for idx, item_data in enumerate(cost_items_data):
                 if 'status' not in item_data:
                     so = item_data.get('sort_order', idx)
                     if so in old_status_by_so:
                         item_data['status'] = old_status_by_so[so]
                 created.append(ManufacturingCostItem.objects.create(product=instance, **item_data))
             self._link_cost_parents(created, parent_indexes)

        return instance
    
    def get_product_class_name(self, obj):
        return obj.product_class.name if obj.product_class else None
    
    def get_project_name(self, obj):
        return obj.project.name if obj.project else None
    
    def get_contact_name(self, obj):
        return obj.contact.name if obj.contact else None
    
    def get_contact_company_name(self, obj):
        return obj.contact.company.name if obj.contact and obj.contact.company else None
    
    def get_status_display(self, obj):
        return obj.get_status_display()
    
    def get_currency_info(self, obj):
        if obj.currency:
            return {
                'id': obj.currency.id,
                'code': obj.currency.code,
                'name': obj.currency.name,
                'symbol': obj.currency.symbol,
                'exchange_rate': obj.currency.exchange_rate
            }
        return None

class ServiceGroupSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    services_count = serializers.SerializerMethodField()
    service_ids = serializers.SerializerMethodField()

    class Meta:
        model = ServiceGroup
        fields = '__all__'

    def get_services_count(self, obj):
        annotated = getattr(obj, 'services_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.services.count()

    def get_service_ids(self, obj):
        return list(obj.services.values_list('id', flat=True))

class ServiceSerializer(serializers.ModelSerializer):
    """Szolgáltatás serializer"""
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    calculation_basis_display = serializers.CharField(source='get_calculation_basis_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    internal_production_department_name = serializers.CharField(
        source='internal_production_department.name', read_only=True
    )
    group_names = serializers.SerializerMethodField()
    cost_summary = serializers.SerializerMethodField()
    is_protected = serializers.SerializerMethodField()
    cost_items_data = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = '__all__'
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'

    def get_is_protected(self, obj):
        return obj.is_protected or obj.groups.filter(is_protected=True).exists()

    def get_group_names(self, obj):
        return [g.name for g in obj.groups.all()]

    def get_cost_summary(self, obj):
        """Aggregate fixed + per-unit selling prices from active cost items."""
        fixed_total = 0
        unit_total = 0
        for ci in obj.cost_items.filter(is_active=True):
            if ci.calculation_type in ('length', 'perimeter', 'area', 'weight', 'time'):
                continue
            if not (ci.supplier_id or ci.is_internal):
                continue
            price = float(ci.selling_price or 0)
            if ci.calculation_type == 'fixed':
                fixed_total += price
            elif ci.calculation_type in ('unit', 'click'):
                unit_total += price
        return {'fixed': fixed_total, 'unit': unit_total}

    def get_cost_items_data(self, obj):
        """Return active cost items with supplier/department info for RFQ preload."""
        result = []
        for ci in obj.cost_items.filter(is_active=True):
            result.append({
                'id': ci.id,
                'name': ci.name,
                'unit': ci.unit,
                'unit_price': float(ci.unit_price or 0),
                'price_quantity': float(ci.price_quantity or 1),
                'markup_percentage': float(ci.markup_percentage or 0),
                'selling_price': float(ci.selling_price or 0),
                'currency': ci.currency,
                'calculation_type': ci.calculation_type,
                'is_internal': ci.is_internal,
                'supplier': ci.supplier_id,
                'supplier_name': ci.supplier.name if ci.supplier else None,
                'department': ci.department_id,
                'department_name': ci.department.name if ci.department else None,
                'price_calculation_version': ci.price_calculation_version,
            })
        return result


class CalculatorTemplateSerializer(serializers.ModelSerializer):
    """Kalkulátor sablon serializer"""
    allowed_materials_details = serializers.SerializerMethodField()
    allowed_services_details = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CalculatorTemplate
        fields = '__all__'
    
    def get_allowed_materials_details(self, obj):
        materials = obj.allowed_materials.all()
        return [{
            'id': m.id,
            'name': m.name,
            'code': m.code,
            'unit': m.unit,
            'material_format': m.material_format,
            'roll_width': m.roll_width,
            'width': m.width,
            'length': m.length,
            'sheet_division': m.sheet_division,
            'yield_percentage': m.yield_percentage,
            'unit_cost_price': m.unit_cost_price,
            'markup_percentage': m.markup_percentage,
            'unit_selling_price': m.unit_selling_price,
            'currency': m.currency,
            'group_id': m.material_group.id if m.material_group else None,
            'group_name': m.material_group.name if m.material_group else None,
            'default_supplier_id': m.default_supplier.id if m.default_supplier else None,
            'default_supplier_name': m.default_supplier.name if m.default_supplier else None,
            'is_internal_production': m.is_internal_production,
            'internal_production_cost': m.internal_production_cost,  # deprecated
            'internal_fixed_cost': m.internal_fixed_cost,
            'internal_price_per_unit': m.internal_price_per_unit,
            'internal_price_per_perimeter': m.internal_price_per_perimeter,
            'internal_price_per_area': m.internal_price_per_area,
            'internal_price_per_weight': m.internal_price_per_weight,
            'internal_price_per_time': m.internal_price_per_time,
        } for m in materials]
    
    def get_allowed_services_details(self, obj):
        services = obj.allowed_services.all()
        return [{
            'id': s.id,
            'name': s.name,
            'code': s.code,
            'unit': s.unit,
            'default_supplier_id': s.default_supplier.id if s.default_supplier else None,
            'default_supplier_name': s.default_supplier.name if s.default_supplier else None,
            'unit_price': s.unit_price,
            'calculation_basis': s.calculation_basis,  # deprecated
            'category': s.category,
            'unit_cost_price': s.unit_cost_price,
            'markup_percentage': s.markup_percentage,
            'unit_selling_price': s.unit_selling_price,
            'currency': s.currency,
            'is_internal_production': s.is_internal_production,
            'internal_production_cost': s.internal_production_cost,  # deprecated
            'internal_fixed_cost': s.internal_fixed_cost,
            'internal_price_per_unit': s.internal_price_per_unit,
            'internal_price_per_perimeter': s.internal_price_per_perimeter,
            'internal_price_per_area': s.internal_price_per_area,
            'internal_price_per_weight': s.internal_price_per_weight,
            'internal_price_per_time': s.internal_price_per_time,
        } for s in services]
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


class CalculationSerializer(serializers.ModelSerializer):
    """Kalkuláció serializer"""
    template_name = serializers.CharField(source='template.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Calculation
        fields = '__all__'
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'


class ServiceSupplierPriceSerializer(serializers.ModelSerializer):
    """Szolgáltatás beszállítói ár serializer"""
    service_name = serializers.CharField(source='service.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    
    class Meta:
        model = ServiceSupplierPrice
        fields = [
            'id', 'service', 'service_name', 'supplier', 'supplier_name',
            'is_default', 'fixed_cost', 'price_per_unit', 'price_per_perimeter',
            'price_per_area', 'price_per_weight', 'price_per_time',
            'currency', 'min_order_quantity', 'lead_time_days', 'notes',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class ServiceCostItemSerializer(serializers.ModelSerializer):
    """Szolgáltatás költség elem serializer"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, allow_null=True)
    department_name = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    calculation_type_display = serializers.CharField(source='get_calculation_type_display', read_only=True)
    
    class Meta:
        model = ServiceCostItem
        fields = [
            'id', 'service', 'supplier', 'supplier_name', 'department', 'department_name',
            'is_internal', 'price_calculation_version',
            'name', 'calculation_type', 'calculation_type_display', 'unit',
            'unit_price', 'price_quantity', 'markup_percentage', 'selling_price', 'currency',
            'rounding_step',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class ProductTemplateSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTemplateSize
        fields = ['id', 'label', 'width_mm', 'width_max_mm', 'height_mm', 'height_max_mm', 'sort_order', 'unit']


class ProductTemplateQuantityDiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTemplateQuantityDiscount
        fields = ['id', 'min_amount', 'discount_type', 'discount_value']


class ProductTemplateSerializer(serializers.ModelSerializer):
    sizes = ProductTemplateSizeSerializer(many=True, required=False)
    quantity_discounts = ProductTemplateQuantityDiscountSerializer(many=True, required=False)
    category_name = serializers.CharField(source='category.name', read_only=True)
    allowed_materials_details = serializers.SerializerMethodField()
    allowed_material_groups_details = serializers.SerializerMethodField()
    allowed_services_details = serializers.SerializerMethodField()
    required_services_details = serializers.SerializerMethodField()
    finishing_services_details = serializers.SerializerMethodField()
    binding_services_details = serializers.SerializerMethodField()
    finishing_service_groups = serializers.SerializerMethodField()
    print_service_options_details = serializers.SerializerMethodField()
    service_groups_1 = serializers.SerializerMethodField()
    service_groups_2 = serializers.SerializerMethodField()
    template_categories_details = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ProductTemplate
        fields = [
            'id', 'name', 'code', 'description',
            'category', 'category_name',
            'calculator_type',
            'image', 'image_url',
            'default_material_markup_percentage',
            'default_service_markup_percentage',
            'allowed_materials', 'allowed_materials_details',
            'allowed_material_groups', 'allowed_material_groups_details',
            'allowed_services', 'allowed_services_details',
            'required_services', 'required_services_details',
            'finishing_services', 'finishing_services_details',
            'binding_services', 'binding_services_details',
            'finishing_service_groups',
            'service_groups_1', 'service_groups_2',
            'template_categories', 'template_categories_details',
            'print_sides', 'print_service',
            'print_service_options', 'print_service_options_details',
            'print_service_options_order', 'fix_cost_first_side_only',
            'multi_sheet_enabled',
            'custom_size_enabled', 'custom_size_unit',
            'custom_size_width_min', 'custom_size_width_max',
            'custom_size_height_min', 'custom_size_height_max',
            'sizes', 'quantity_discounts',
            'is_active', 'is_protected', 'created_at', 'updated_at',
            'service_group',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        try:
            url = obj.image.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url

    def get_allowed_materials_details(self, obj):
        def _dim_mm(val, unit):
            """Convert dimension to mm."""
            if val is None:
                return None
            v = float(val)
            if unit == 'cm':
                return v * 10
            if unit == 'm':
                return v * 1000
            return v  # already mm

        result = []
        for m in obj.allowed_materials.all():
            sizes = []
            for s in m.sizes.filter(is_active=True).order_by('sort_order', 'width', 'length'):
                sizes.append({
                    'id': s.id,
                    'name': s.name,
                    'width_mm': _dim_mm(s.width, s.dimension_unit),
                    'length_mm': _dim_mm(s.length, s.dimension_unit),
                    'price': float(s.effective_price or 0),
                })
            result.append({
                'id': m.id, 'name': m.name, 'code': m.code,
                'width_mm': _dim_mm(m.width, m.dimension_unit),
                'length_mm': _dim_mm(m.length, m.dimension_unit),
                'unit_selling_price': float(m.unit_selling_price or 0),
                'sizes': sizes,
            })
        return result

    def get_allowed_material_groups_details(self, obj):
        return [{'id': g.id, 'name': g.name} for g in obj.allowed_material_groups.all()]

    def get_allowed_services_details(self, obj):
        return [{'id': s.id, 'name': s.name, 'code': s.code} for s in obj.allowed_services.all()]

    def get_required_services_details(self, obj):
        return [{'id': s.id, 'name': s.name, 'code': s.code} for s in obj.required_services.all()]

    def get_finishing_services_details(self, obj):
        return [{'id': s.id, 'name': s.name, 'code': s.code} for s in obj.finishing_services.all()]

    def get_binding_services_details(self, obj):
        return [{'id': s.id, 'name': s.name, 'code': s.code} for s in obj.binding_services.all()]

    def get_finishing_service_groups(self, obj):
        groups = obj.service_groups.filter(side='F').order_by('group_index').prefetch_related('services')
        return [[s.id for s in g.services.all()] for g in groups]

    def get_print_service_options_details(self, obj):
        svcs = list(obj.print_service_options.all())
        order = obj.print_service_options_order or []
        if order:
            order_map = {sid: idx for idx, sid in enumerate(order)}
            svcs.sort(key=lambda s: order_map.get(s.id, 9999))
        return [
            {
                'id': s.id, 'name': s.name, 'code': s.code,
                'setup_cost_selling': float(s.setup_cost_selling or 0),
                'unit_cost_selling': float(s.unit_cost_selling or 0),
                'max_width_mm': float(s.max_width_mm) if s.max_width_mm is not None else None,
                'max_height_mm': float(s.max_height_mm) if s.max_height_mm is not None else None,
            }
            for s in svcs
        ]

    def get_service_groups_1(self, obj):
        groups = obj.service_groups.filter(side='1').order_by('group_index').prefetch_related('services')
        return [[s.id for s in g.services.all()] for g in groups]

    def get_service_groups_2(self, obj):
        groups = obj.service_groups.filter(side='2').order_by('group_index').prefetch_related('services')
        return [[s.id for s in g.services.all()] for g in groups]

    def get_template_categories_details(self, obj):
        return [{'id': c.id, 'name': c.name} for c in obj.template_categories.all()]

    def _save_service_groups(self, instance, sg1, sg2, sgf=None):
        """Recreate service groups and sync allowed_services / finishing_services (flat union)."""
        from .models import ProductTemplateServiceGroup
        instance.service_groups.all().delete()
        all_ids: set = set()
        finishing_ids: set = set()
        for side, groups in (('1', sg1), ('2', sg2)):
            for idx, svc_ids in enumerate(groups):
                grp = ProductTemplateServiceGroup.objects.create(
                    product=instance, side=side, group_index=idx
                )
                grp.services.set(svc_ids)
                all_ids.update(svc_ids)
        instance.allowed_services.set(list(all_ids))
        if sgf is not None:
            for idx, svc_ids in enumerate(sgf):
                grp = ProductTemplateServiceGroup.objects.create(
                    product=instance, side='F', group_index=idx
                )
                grp.services.set(svc_ids)
                finishing_ids.update(svc_ids)
            instance.finishing_services.set(list(finishing_ids))

    def create(self, validated_data):
        from .models import ProductTemplateServiceGroup  # noqa: F811
        sizes_data = validated_data.pop('sizes', [])
        discounts_data = validated_data.pop('quantity_discounts', [])
        allowed_materials = validated_data.pop('allowed_materials', [])
        allowed_material_groups = validated_data.pop('allowed_material_groups', [])
        print_service_options = validated_data.pop('print_service_options', [])
        required_services = validated_data.pop('required_services', [])
        binding_services = validated_data.pop('binding_services', [])
        template_categories = validated_data.pop('template_categories', [])
        validated_data.pop('finishing_services', None)  # derived from finishing_service_groups
        validated_data.pop('allowed_services', None)  # derived from groups
        sg1 = self.initial_data.get('service_groups_1', [])
        sg2 = self.initial_data.get('service_groups_2', [])
        sgf = self.initial_data.get('finishing_service_groups', [])
        template = ProductTemplate.objects.create(**validated_data)
        template.allowed_materials.set(allowed_materials)
        template.allowed_material_groups.set(allowed_material_groups)
        template.print_service_options.set(print_service_options)
        template.required_services.set(required_services)
        template.binding_services.set(binding_services)
        template.template_categories.set(template_categories)
        self._save_service_groups(template, sg1, sg2, sgf)
        self._save_service_groups(template, sg1, sg2)
        for size in sizes_data:
            ProductTemplateSize.objects.create(product=template, **size)
        template.quantity_discounts.all().delete()
        for d in discounts_data:
            ProductTemplateQuantityDiscount.objects.create(product=template, **d)
        return template

    def update(self, instance, validated_data):
        sizes_data = validated_data.pop('sizes', None)
        discounts_data = validated_data.pop('quantity_discounts', None)
        allowed_materials = validated_data.pop('allowed_materials', None)
        allowed_material_groups = validated_data.pop('allowed_material_groups', None)
        print_service_options = validated_data.pop('print_service_options', None)
        required_services = validated_data.pop('required_services', None)
        binding_services = validated_data.pop('binding_services', None)
        template_categories = validated_data.pop('template_categories', None)
        validated_data.pop('finishing_services', None)  # derived from finishing_service_groups
        validated_data.pop('allowed_services', None)  # derived from groups
        sg1 = self.initial_data.get('service_groups_1', None)
        sg2 = self.initial_data.get('service_groups_2', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if allowed_materials is not None:
            instance.allowed_materials.set(allowed_materials)
        if allowed_material_groups is not None:
            instance.allowed_material_groups.set(allowed_material_groups)
        if print_service_options is not None:
            instance.print_service_options.set(print_service_options)
        if required_services is not None:
            instance.required_services.set(required_services)
        if binding_services is not None:
            instance.binding_services.set(binding_services)
        if template_categories is not None:
            instance.template_categories.set(template_categories)
        sgf = self.initial_data.get('finishing_service_groups', None)
        if sg1 is not None or sg2 is not None or sgf is not None:
            self._save_service_groups(
                instance,
                sg1 if sg1 is not None else self.get_service_groups_1(instance),
                sg2 if sg2 is not None else self.get_service_groups_2(instance),
                sgf if sgf is not None else self.get_finishing_service_groups(instance),
            )
        if sizes_data is not None:
            instance.sizes.all().delete()
            for size in sizes_data:
                ProductTemplateSize.objects.create(product=instance, **size)
        if discounts_data is not None:
            instance.quantity_discounts.all().delete()
            for d in discounts_data:
                ProductTemplateQuantityDiscount.objects.create(product=instance, **d)
        return instance
