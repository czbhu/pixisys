from rest_framework import serializers
from .models import (
    ProductClass, Project, ManufacturingProduct, Service, ServiceGroup,
    CalculatorTemplate, Calculation, ServiceSupplierPrice, ServiceCostItem,
    ManufacturingCostItem, ProductTemplate, ProductTemplateSize
)
from apps.crm.models import Contact, Company as CRMCompany
from apps.crm.utils import sync_company_to_local_db
from apps.finance.views import PixinvoiceClient
from apps.hr.models import Department, Employee
from apps.core.models import Currency
from apps.warehouse.models import Material


class ProductClassSerializer(serializers.ModelSerializer):
    hr_department_names = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    
    class Meta:
        model = ProductClass
        fields = '__all__'
    
    def get_hr_department_names(self, obj):
        return [dept.name for dept in obj.hr_departments.all()]


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
        # Return existing allowed companies for frontend (using external_id if available)
        return [{"id": c.external_id or c.id, "name": c.name} for c in obj.allowed_companies.all()]

    def get_allowed_contacts_data(self, obj):
        # Return existing allowed contacts for frontend
        return [{"id": c.external_id or c.id, "name": c.name} for c in obj.allowed_contacts.all()]

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

        for item_data in cost_items_data:
            ManufacturingCostItem.objects.create(product=product, **item_data)
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
             # Full replacement strategy
             instance.cost_items.all().delete()
             for item_data in cost_items_data:
                 ManufacturingCostItem.objects.create(product=instance, **item_data)

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

    class Meta:
        model = ServiceGroup
        fields = '__all__'

    def get_services_count(self, obj):
        return 0

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
    
    class Meta:
        model = Service
        fields = '__all__'
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Rendszer'

    def get_group_names(self, obj):
        return [g.name for g in obj.groups.all()]


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
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    calculation_type_display = serializers.CharField(source='get_calculation_type_display', read_only=True)
    
    class Meta:
        model = ServiceCostItem
        fields = [
            'id', 'service', 'supplier', 'supplier_name', 'is_internal',
            'name', 'calculation_type', 'calculation_type_display', 'unit',
            'unit_price', 'markup_percentage', 'selling_price', 'currency',
            'rounding_step',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'selling_price']


class ProductTemplateSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductTemplateSize
        fields = ['id', 'label', 'width_mm', 'height_mm', 'sort_order']


class ProductTemplateSerializer(serializers.ModelSerializer):
    sizes = ProductTemplateSizeSerializer(many=True, required=False)
    category_name = serializers.CharField(source='category.name', read_only=True)
    calculators_details = serializers.SerializerMethodField()

    class Meta:
        model = ProductTemplate
        fields = [
            'id', 'name', 'code', 'description',
            'category', 'category_name',
            'calculators', 'calculators_details',
            'sizes',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_calculators_details(self, obj):
        return [{'id': c.id, 'name': c.name, 'code': c.code} for c in obj.calculators.all()]

    def create(self, validated_data):
        sizes_data = validated_data.pop('sizes', [])
        calculators = validated_data.pop('calculators', [])
        template = ProductTemplate.objects.create(**validated_data)
        template.calculators.set(calculators)
        for size in sizes_data:
            ProductTemplateSize.objects.create(product=template, **size)
        return template

    def update(self, instance, validated_data):
        sizes_data = validated_data.pop('sizes', None)
        calculators = validated_data.pop('calculators', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if calculators is not None:
            instance.calculators.set(calculators)
        if sizes_data is not None:
            instance.sizes.all().delete()
            for size in sizes_data:
                ProductTemplateSize.objects.create(product=instance, **size)
        return instance
