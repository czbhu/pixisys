"""
Data Export / Import views for PixiERP Settings.
Handles: ServiceGroup, Service, ProductClass, ProductTemplate,
         MaterialGroup, Material, Warehouse, Inventory, Employee
"""
from __future__ import annotations

import json
import decimal
import datetime
import logging

from django.http import JsonResponse, HttpResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.db import transaction

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

class _Encoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        return super().default(obj)


def _ok(data):
    return JsonResponse(data, encoder=_Encoder, safe=False)


def _err(msg, status=400):
    return JsonResponse({'error': msg}, status=status)


# ─────────────────────────────────────────────────────────────────────────────
# Serializers (export helpers)
# ─────────────────────────────────────────────────────────────────────────────

def _ser_service_group(sg):
    return {
        'name': sg.name,
        'description': sg.description,
        'is_active': sg.is_active,
        'is_protected': sg.is_protected,
        'parent_name': sg.parent.name if sg.parent else None,
    }


def _ser_service(svc):
    return {
        'code': svc.code,
        'name': svc.name,
        'description': svc.description,
        'unit': svc.unit,
        'calculation_unit': svc.calculation_unit,
        'calculation_basis': svc.calculation_basis,
        'unit_cost_price': svc.unit_cost_price,
        'markup_percentage': svc.markup_percentage,
        'unit_selling_price': svc.unit_selling_price,
        'unit_price': svc.unit_price,
        'currency': svc.currency,
        'category': svc.category,
        'is_active': svc.is_active,
        'is_protected': svc.is_protected,
        'groups': list(svc.groups.values_list('name', flat=True)),
    }


def _ser_product_class(pc):
    return {
        'name': pc.name,
        'description': pc.description,
        'is_default': pc.is_default,
        'calculators': pc.calculators,
        'parent_name': pc.parent.name if pc.parent else None,
    }


def _ser_product_template(pt):
    return {
        'code': pt.code,
        'name': pt.name,
        'description': pt.description,
        'calculator_type': pt.calculator_type,
        'default_material_markup_percentage': pt.default_material_markup_percentage,
        'default_service_markup_percentage': pt.default_service_markup_percentage,
        'custom_size_enabled': pt.custom_size_enabled,
        'custom_size_unit': pt.custom_size_unit,
        'custom_size_width_min': pt.custom_size_width_min,
        'custom_size_width_max': pt.custom_size_width_max,
        'custom_size_height_min': pt.custom_size_height_min,
        'custom_size_height_max': pt.custom_size_height_max,
        'print_sides': pt.print_sides,
        'multi_sheet_enabled': pt.multi_sheet_enabled,
        'is_active': pt.is_active,
        'is_protected': pt.is_protected,
        'category_name': pt.category.name if pt.category else None,
        'allowed_material_codes': list(pt.allowed_materials.values_list('code', flat=True)),
        'allowed_service_codes': list(pt.allowed_services.values_list('code', flat=True)),
        'allowed_material_group_names': list(pt.allowed_material_groups.values_list('name', flat=True)),
        'required_service_codes': list(pt.required_services.values_list('code', flat=True)),
        'finishing_service_codes': list(pt.finishing_services.values_list('code', flat=True)),
    }


def _ser_material_group(mg):
    return {
        'name': mg.name,
        'description': mg.description,
        'is_active': mg.is_active,
        'parent_name': mg.parent.name if mg.parent else None,
    }


def _ser_material(m):
    return {
        'code': m.code,
        'name': m.name,
        'description': m.description,
        'is_material': m.is_material,
        'is_product': m.is_product,
        'unit': m.unit,
        'material_format': m.material_format,
        'width': m.width,
        'length': m.length,
        'height': m.height,
        'dimension_unit': m.dimension_unit,
        'width_fixed': m.width_fixed,
        'length_fixed': m.length_fixed,
        'height_fixed': m.height_fixed,
        'min_stock_level': m.min_stock_level,
        'is_active': getattr(m, 'is_active', True),
        'material_group_name': m.material_group.name if m.material_group else None,
    }


def _ser_warehouse(wh):
    return {
        'code': wh.code,
        'name': wh.name,
        'address': wh.address,
        'is_active': wh.is_active,
    }


def _ser_inventory(inv):
    return {
        'material_code': inv.material.code,
        'warehouse_code': inv.warehouse.code,
        'shelf_name': inv.shelf.name if inv.shelf else None,
        'quantity': inv.quantity,
    }


def _ser_employee(emp):
    return {
        'employee_id': emp.employee_id,
        'first_name': emp.user.first_name,
        'last_name': emp.user.last_name,
        'email': emp.user.email,
        'is_active': emp.is_active,
        'phone': emp.phone,
        'hire_date': emp.hire_date,
        'termination_date': emp.termination_date,
        'permission_level': emp.permission_level,
        'gross_salary': emp.gross_salary,
        'net_salary': emp.net_salary,
        'net_hourly_rate': emp.net_hourly_rate,
        'overhead_hourly_rate': emp.overhead_hourly_rate,
        'daily_work_hours': emp.daily_work_hours,
        'address_country': emp.address_country,
        'address_postal_code': emp.address_postal_code,
        'address_city': emp.address_city,
        'address_street_name': emp.address_street_name,
        'address_street_type': emp.address_street_type,
        'address_house_number': emp.address_house_number,
        'address_generic': emp.address_generic,
        'tb_number': emp.tb_number,
        'tax_number': emp.tax_number,
        'birth_place': emp.birth_place,
        'birth_date': emp.birth_date,
        'gender': emp.gender,
    }


# ─────────────────────────────────────────────────────────────────────────────
# List endpoint (for picker UI)
# ─────────────────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['GET'])
def data_export_list(request):
    """Return list of available records per type for the export picker UI."""
    from apps.manufacturing.models import ServiceGroup, Service, ProductClass, ProductTemplate
    from apps.warehouse.models import MaterialGroup, Material, Warehouse, Inventory
    from apps.hr.models import Employee

    types = request.GET.get('types', '').split(',')
    result = {}

    if 'service_group' in types:
        result['service_group'] = [
            {'id': sg.id, 'label': sg.name, 'code': sg.name}
            for sg in ServiceGroup.objects.all().order_by('name')
        ]

    if 'service' in types:
        result['service'] = [
            {'id': s.id, 'label': f"{s.name} ({s.code})", 'code': s.code}
            for s in Service.objects.all().order_by('name')
        ]

    if 'product_class' in types:
        result['product_class'] = [
            {'id': pc.id, 'label': pc.get_full_name(), 'code': pc.name}
            for pc in ProductClass.objects.all().order_by('name')
        ]

    if 'product_template' in types:
        result['product_template'] = [
            {'id': pt.id, 'label': f"{pt.name} ({pt.code or '—'})", 'code': pt.code or str(pt.id)}
            for pt in ProductTemplate.objects.all().order_by('name')
        ]

    if 'material_group' in types:
        result['material_group'] = [
            {'id': mg.id, 'label': mg.get_full_name(), 'code': mg.name}
            for mg in MaterialGroup.objects.all().order_by('name')
        ]

    if 'material' in types:
        result['material'] = [
            {'id': m.id, 'label': f"{m.name} ({m.code})", 'code': m.code}
            for m in Material.objects.all().order_by('name')
        ]

    if 'warehouse' in types:
        result['warehouse'] = [
            {'id': wh.id, 'label': f"{wh.name} ({wh.code})", 'code': wh.code}
            for wh in Warehouse.objects.all().order_by('name')
        ]

    if 'inventory' in types:
        result['inventory'] = [
            {
                'id': inv.id,
                'label': f"{inv.material.name} — {inv.warehouse.name} / {inv.shelf.name if inv.shelf else '—'}: {inv.quantity} {inv.material.unit}",
                'code': f"{inv.material.code}__{inv.warehouse.code}",
            }
            for inv in Inventory.objects.select_related('material', 'warehouse', 'shelf').all()
        ]

    if 'employee' in types:
        result['employee'] = [
            {
                'id': emp.id,
                'label': f"{emp.user.get_full_name()} ({emp.employee_id})",
                'code': emp.employee_id,
            }
            for emp in Employee.objects.select_related('user').all().order_by('user__last_name')
        ]

    return _ok(result)


# ─────────────────────────────────────────────────────────────────────────────
# Export endpoint
# ─────────────────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def data_export(request):
    """
    POST body: { "selections": { "service": [1,2,3], "product_template": [4,5], ... } }
    Returns a JSON file download.
    """
    from apps.manufacturing.models import ServiceGroup, Service, ProductClass, ProductTemplate
    from apps.warehouse.models import MaterialGroup, Material, Warehouse, Inventory
    from apps.hr.models import Employee

    try:
        body = json.loads(request.body)
    except Exception:
        return _err('Érvénytelen JSON')

    selections = body.get('selections', {})
    export = {'_version': 1, '_exported_at': datetime.datetime.now().isoformat()}

    def _ids(key):
        ids = selections.get(key, [])
        return ids if ids != '__all__' else None  # None = all

    def _qs(model, key, **extra_filters):
        ids = _ids(key)
        qs = model.objects.all()
        if extra_filters:
            qs = qs.filter(**extra_filters)
        if ids is not None:
            qs = qs.filter(id__in=ids)
        return qs

    if 'service_group' in selections:
        export['service_group'] = [_ser_service_group(sg) for sg in _qs(ServiceGroup, 'service_group')]

    if 'service' in selections:
        export['service'] = [_ser_service(s) for s in _qs(Service, 'service').prefetch_related('groups')]

    if 'product_class' in selections:
        export['product_class'] = [_ser_product_class(pc) for pc in _qs(ProductClass, 'product_class')]

    if 'product_template' in selections:
        export['product_template'] = [
            _ser_product_template(pt)
            for pt in _qs(ProductTemplate, 'product_template').select_related('category').prefetch_related(
                'allowed_materials', 'allowed_services', 'allowed_material_groups',
                'required_services', 'finishing_services',
            )
        ]

    if 'material_group' in selections:
        export['material_group'] = [_ser_material_group(mg) for mg in _qs(MaterialGroup, 'material_group')]

    if 'material' in selections:
        export['material'] = [_ser_material(m) for m in _qs(Material, 'material').select_related('material_group')]

    if 'warehouse' in selections:
        export['warehouse'] = [_ser_warehouse(wh) for wh in _qs(Warehouse, 'warehouse')]

    if 'inventory' in selections:
        export['inventory'] = [
            _ser_inventory(inv)
            for inv in _qs(Inventory, 'inventory').select_related('material', 'warehouse', 'shelf')
        ]

    if 'employee' in selections:
        export['employee'] = [
            _ser_employee(emp)
            for emp in _qs(Employee, 'employee').select_related('user')
        ]

    json_bytes = json.dumps(export, cls=_Encoder, ensure_ascii=False, indent=2).encode('utf-8')
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    response = HttpResponse(json_bytes, content_type='application/json')
    response['Content-Disposition'] = f'attachment; filename="pixierp_export_{ts}.json"'
    return response


# ─────────────────────────────────────────────────────────────────────────────
# Analyze endpoint (pre-import conflict check)
# ─────────────────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def data_import_analyze(request):
    """
    Accepts the JSON export file + list of types to import.
    Returns: { conflicts: {...}, missing_refs: {...}, counts: {...} }
    """
    from apps.manufacturing.models import ServiceGroup, Service, ProductClass, ProductTemplate
    from apps.warehouse.models import MaterialGroup, Material, Warehouse, Inventory
    from apps.hr.models import Employee

    try:
        body = json.loads(request.body)
    except Exception:
        return _err('Érvénytelen JSON')

    data = body.get('data', {})
    types = body.get('types', list(data.keys()))

    conflicts = {}   # code → existing record label
    missing_refs = {}  # describes what would be auto-created
    counts = {}

    def _chk_sg():
        rows = data.get('service_group', [])
        counts['service_group'] = len(rows)
        conf = []
        for row in rows:
            if ServiceGroup.objects.filter(name=row['name']).exists():
                conf.append({'code': row['name'], 'label': row['name']})
        if conf:
            conflicts['service_group'] = conf

    def _chk_service():
        rows = data.get('service', [])
        counts['service'] = len(rows)
        conf = []
        missing = []
        for row in rows:
            if Service.objects.filter(code=row['code']).exists():
                conf.append({'code': row['code'], 'label': row['name']})
            for gname in (row.get('groups') or []):
                if not ServiceGroup.objects.filter(name=gname).exists():
                    entry = {'ref_type': 'service_group', 'name': gname}
                    if entry not in missing:
                        missing.append(entry)
        if conf:
            conflicts['service'] = conf
        if missing:
            missing_refs['service'] = missing

    def _chk_product_class():
        rows = data.get('product_class', [])
        counts['product_class'] = len(rows)
        conf = []
        for row in rows:
            if ProductClass.objects.filter(name=row['name']).exists():
                conf.append({'code': row['name'], 'label': row['name']})
        if conf:
            conflicts['product_class'] = conf

    def _chk_product_template():
        rows = data.get('product_template', [])
        counts['product_template'] = len(rows)
        conf = []
        missing = []
        for row in rows:
            if row.get('code') and ProductTemplate.objects.filter(code=row['code']).exists():
                conf.append({'code': row['code'], 'label': row['name']})
            cat = row.get('category_name')
            if cat and not ProductClass.objects.filter(name=cat).exists():
                entry = {'ref_type': 'product_class', 'name': cat}
                if entry not in missing:
                    missing.append(entry)
        if conf:
            conflicts['product_template'] = conf
        if missing:
            missing_refs['product_template'] = missing

    def _chk_material_group():
        rows = data.get('material_group', [])
        counts['material_group'] = len(rows)
        conf = []
        for row in rows:
            if MaterialGroup.objects.filter(name=row['name']).exists():
                conf.append({'code': row['name'], 'label': row['name']})
        if conf:
            conflicts['material_group'] = conf

    def _chk_material():
        rows = data.get('material', [])
        counts['material'] = len(rows)
        conf = []
        missing = []
        for row in rows:
            if Material.objects.filter(code=row['code']).exists():
                conf.append({'code': row['code'], 'label': row['name']})
            mgname = row.get('material_group_name')
            if mgname and not MaterialGroup.objects.filter(name=mgname).exists():
                entry = {'ref_type': 'material_group', 'name': mgname}
                if entry not in missing:
                    missing.append(entry)
        if conf:
            conflicts['material'] = conf
        if missing:
            missing_refs['material'] = missing

    def _chk_warehouse():
        rows = data.get('warehouse', [])
        counts['warehouse'] = len(rows)
        conf = []
        for row in rows:
            if Warehouse.objects.filter(code=row['code']).exists():
                conf.append({'code': row['code'], 'label': row['name']})
        if conf:
            conflicts['warehouse'] = conf

    def _chk_inventory():
        rows = data.get('inventory', [])
        counts['inventory'] = len(rows)
        missing = []
        for row in rows:
            mc = row.get('material_code')
            wc = row.get('warehouse_code')
            if mc and not Material.objects.filter(code=mc).exists():
                entry = {'ref_type': 'material', 'name': mc}
                if entry not in missing:
                    missing.append(entry)
            if wc and not Warehouse.objects.filter(code=wc).exists():
                entry = {'ref_type': 'warehouse', 'name': wc}
                if entry not in missing:
                    missing.append(entry)
        if missing:
            missing_refs['inventory'] = missing

    def _chk_employee():
        rows = data.get('employee', [])
        counts['employee'] = len(rows)
        conf = []
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for row in rows:
            from apps.hr.models import Employee as Emp
            if Emp.objects.filter(employee_id=row['employee_id']).exists():
                conf.append({'code': row['employee_id'], 'label': f"{row.get('last_name','')} {row.get('first_name','')}"})
            if User.objects.filter(email=row.get('email', '')).exists() and not Emp.objects.filter(employee_id=row['employee_id']).exists():
                conf.append({'code': row['employee_id'], 'label': f"E-mail ütközés: {row.get('email')}"})
        if conf:
            conflicts['employee'] = conf

    fn_map = {
        'service_group': _chk_sg,
        'service': _chk_service,
        'product_class': _chk_product_class,
        'product_template': _chk_product_template,
        'material_group': _chk_material_group,
        'material': _chk_material,
        'warehouse': _chk_warehouse,
        'inventory': _chk_inventory,
        'employee': _chk_employee,
    }
    for t in types:
        if t in fn_map and t in data:
            fn_map[t]()

    return _ok({'conflicts': conflicts, 'missing_refs': missing_refs, 'counts': counts})


# ─────────────────────────────────────────────────────────────────────────────
# Execute import endpoint
# ─────────────────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(['POST'])
def data_import_execute(request):
    """
    POST body: {
      "data": { ... export JSON ... },
      "types": ["service", ...],
      "overwrite": {"service": ["CODE1", "CODE2"], ...},   // codes to overwrite
      "rename_suffix": "_import",                           // suffix for non-overwrite conflicts
      "create_missing_refs": true,
    }
    """
    from apps.manufacturing.models import ServiceGroup, Service, ProductClass, ProductTemplate
    from apps.warehouse.models import MaterialGroup, Material, Warehouse, Inventory

    try:
        body = json.loads(request.body)
    except Exception:
        return _err('Érvénytelen JSON')

    data = body.get('data', {})
    types = body.get('types', list(data.keys()))
    overwrite_map = body.get('overwrite', {})  # { type: [codes to overwrite] }
    rename_suffix = body.get('rename_suffix', '_import')
    create_missing = body.get('create_missing_refs', True)

    results = {}
    errors = []

    with transaction.atomic():
        # ── Helper: ensure ServiceGroup ──
        def _ensure_sg(name):
            sg, _ = ServiceGroup.objects.get_or_create(name=name, defaults={'is_active': True})
            return sg

        # ── Helper: ensure ProductClass ──
        def _ensure_pc(name):
            pc, _ = ProductClass.objects.get_or_create(name=name)
            return pc

        # ── Helper: ensure MaterialGroup ──
        def _ensure_mg(name):
            mg, _ = MaterialGroup.objects.get_or_create(name=name, defaults={'is_active': True})
            return mg

        # ── ServiceGroup ──
        if 'service_group' in types and 'service_group' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('service_group', [])
            for row in data['service_group']:
                name = row['name']
                existing = ServiceGroup.objects.filter(name=name).first()
                if existing:
                    if name in ow_codes:
                        existing.description = row.get('description', existing.description)
                        existing.is_active = row.get('is_active', existing.is_active)
                        existing.save()
                        updated += 1
                    else:
                        # rename
                        new_name = name + rename_suffix
                        ServiceGroup.objects.create(
                            name=new_name,
                            description=row.get('description', ''),
                            is_active=row.get('is_active', True),
                        )
                        created += 1
                else:
                    parent = None
                    if row.get('parent_name') and create_missing:
                        parent = _ensure_sg(row['parent_name'])
                    ServiceGroup.objects.create(
                        name=name,
                        description=row.get('description', ''),
                        is_active=row.get('is_active', True),
                        parent=parent,
                    )
                    created += 1
            results['service_group'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── Service ──
        if 'service' in types and 'service' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('service', [])
            for row in data['service']:
                code = row['code']
                existing = Service.objects.filter(code=code).first()
                fields = {
                    'name': row.get('name', ''),
                    'description': row.get('description', ''),
                    'unit': row.get('unit', 'db'),
                    'calculation_unit': row.get('calculation_unit', ''),
                    'calculation_basis': row.get('calculation_basis', 'quantity'),
                    'unit_cost_price': row.get('unit_cost_price') or 0,
                    'markup_percentage': row.get('markup_percentage') or 0,
                    'unit_selling_price': row.get('unit_selling_price') or 0,
                    'unit_price': row.get('unit_price') or 0,
                    'currency': row.get('currency', 'HUF'),
                    'category': row.get('category', ''),
                    'is_active': row.get('is_active', True),
                    'is_protected': row.get('is_protected', False),
                }
                if existing:
                    if code in ow_codes:
                        for k, v in fields.items():
                            setattr(existing, k, v)
                        existing.save()
                        updated += 1
                    else:
                        new_code = code + rename_suffix
                        fields['code'] = new_code
                        svc = Service.objects.create(**fields)
                        for gname in (row.get('groups') or []):
                            if create_missing:
                                sg = _ensure_sg(gname)
                            else:
                                sg = ServiceGroup.objects.filter(name=gname).first()
                            if sg:
                                svc.groups.add(sg)
                        created += 1
                        continue
                else:
                    fields['code'] = code
                    svc = Service.objects.create(**fields)
                    created += 1
                for gname in (row.get('groups') or []):
                    if create_missing:
                        sg = _ensure_sg(gname)
                    else:
                        sg = ServiceGroup.objects.filter(name=gname).first()
                    if sg:
                        (existing or svc).groups.add(sg)
            results['service'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── ProductClass ──
        if 'product_class' in types and 'product_class' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('product_class', [])
            for row in data['product_class']:
                name = row['name']
                existing = ProductClass.objects.filter(name=name).first()
                parent = None
                if row.get('parent_name') and create_missing:
                    parent, _ = ProductClass.objects.get_or_create(name=row['parent_name'])
                if existing:
                    if name in ow_codes:
                        existing.description = row.get('description', existing.description)
                        existing.is_default = row.get('is_default', existing.is_default)
                        existing.calculators = row.get('calculators', existing.calculators)
                        if parent:
                            existing.parent = parent
                        existing.save()
                        updated += 1
                    else:
                        new_name = name + rename_suffix
                        ProductClass.objects.create(
                            name=new_name,
                            description=row.get('description', ''),
                            is_default=row.get('is_default', False),
                            calculators=row.get('calculators', []),
                            parent=parent,
                        )
                        created += 1
                else:
                    ProductClass.objects.create(
                        name=name,
                        description=row.get('description', ''),
                        is_default=row.get('is_default', False),
                        calculators=row.get('calculators', []),
                        parent=parent,
                    )
                    created += 1
            results['product_class'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── ProductTemplate ──
        if 'product_template' in types and 'product_template' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('product_template', [])
            for row in data['product_template']:
                code = row.get('code')
                cat = None
                if row.get('category_name'):
                    if create_missing:
                        cat = _ensure_pc(row['category_name'])
                    else:
                        cat = ProductClass.objects.filter(name=row['category_name']).first()

                fields = {
                    'name': row.get('name', ''),
                    'description': row.get('description', ''),
                    'calculator_type': row.get('calculator_type', 'generic'),
                    'default_material_markup_percentage': row.get('default_material_markup_percentage') or 30,
                    'default_service_markup_percentage': row.get('default_service_markup_percentage') or 35,
                    'custom_size_enabled': row.get('custom_size_enabled', False),
                    'custom_size_unit': row.get('custom_size_unit', 'mm'),
                    'custom_size_width_min': row.get('custom_size_width_min'),
                    'custom_size_width_max': row.get('custom_size_width_max'),
                    'custom_size_height_min': row.get('custom_size_height_min'),
                    'custom_size_height_max': row.get('custom_size_height_max'),
                    'print_sides': row.get('print_sides', 1),
                    'multi_sheet_enabled': row.get('multi_sheet_enabled', False),
                    'is_active': row.get('is_active', True),
                    'is_protected': row.get('is_protected', False),
                    'category': cat,
                }

                existing = ProductTemplate.objects.filter(code=code).first() if code else None

                def _apply_m2m(pt, row):
                    for mc in (row.get('allowed_material_codes') or []):
                        from apps.warehouse.models import Material as Mat
                        m = Mat.objects.filter(code=mc).first()
                        if m:
                            pt.allowed_materials.add(m)
                    for sc in (row.get('allowed_service_codes') or []):
                        s = Service.objects.filter(code=sc).first()
                        if s:
                            pt.allowed_services.add(s)
                    for mgn in (row.get('allowed_material_group_names') or []):
                        from apps.warehouse.models import MaterialGroup as MG
                        mg = MG.objects.filter(name=mgn).first()
                        if mg:
                            pt.allowed_material_groups.add(mg)
                    for sc in (row.get('required_service_codes') or []):
                        s = Service.objects.filter(code=sc).first()
                        if s:
                            pt.required_services.add(s)
                    for sc in (row.get('finishing_service_codes') or []):
                        s = Service.objects.filter(code=sc).first()
                        if s:
                            pt.finishing_services.add(s)

                if existing:
                    if code in ow_codes:
                        for k, v in fields.items():
                            setattr(existing, k, v)
                        existing.save()
                        existing.allowed_materials.clear()
                        existing.allowed_services.clear()
                        existing.allowed_material_groups.clear()
                        existing.required_services.clear()
                        existing.finishing_services.clear()
                        _apply_m2m(existing, row)
                        updated += 1
                    else:
                        new_code = (code or '') + rename_suffix if code else None
                        fields['code'] = new_code
                        pt = ProductTemplate.objects.create(**fields)
                        _apply_m2m(pt, row)
                        created += 1
                else:
                    fields['code'] = code
                    pt = ProductTemplate.objects.create(**fields)
                    _apply_m2m(pt, row)
                    created += 1
            results['product_template'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── MaterialGroup ──
        if 'material_group' in types and 'material_group' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('material_group', [])
            for row in data['material_group']:
                name = row['name']
                existing = MaterialGroup.objects.filter(name=name).first()
                parent = None
                if row.get('parent_name') and create_missing:
                    parent = _ensure_mg(row['parent_name'])
                if existing:
                    if name in ow_codes:
                        existing.description = row.get('description', existing.description)
                        existing.is_active = row.get('is_active', existing.is_active)
                        if parent:
                            existing.parent = parent
                        existing.save()
                        updated += 1
                    else:
                        MaterialGroup.objects.create(
                            name=name + rename_suffix,
                            description=row.get('description', ''),
                            is_active=row.get('is_active', True),
                            parent=parent,
                        )
                        created += 1
                else:
                    MaterialGroup.objects.create(
                        name=name,
                        description=row.get('description', ''),
                        is_active=row.get('is_active', True),
                        parent=parent,
                    )
                    created += 1
            results['material_group'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── Material ──
        if 'material' in types and 'material' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('material', [])
            for row in data['material']:
                code = row['code']
                mg = None
                if row.get('material_group_name'):
                    if create_missing:
                        mg = _ensure_mg(row['material_group_name'])
                    else:
                        mg = MaterialGroup.objects.filter(name=row['material_group_name']).first()
                fields = {
                    'name': row.get('name', ''),
                    'description': row.get('description', ''),
                    'is_material': row.get('is_material', True),
                    'is_product': row.get('is_product', False),
                    'unit': row.get('unit', 'db'),
                    'material_format': row.get('material_format', 'piece'),
                    'width': row.get('width'),
                    'length': row.get('length'),
                    'height': row.get('height'),
                    'dimension_unit': row.get('dimension_unit', 'mm'),
                    'width_fixed': row.get('width_fixed', False),
                    'length_fixed': row.get('length_fixed', False),
                    'height_fixed': row.get('height_fixed', False),
                    'min_stock_level': row.get('min_stock_level') or 0,
                    'material_group': mg,
                }
                existing = Material.objects.filter(code=code).first()
                if existing:
                    if code in ow_codes:
                        for k, v in fields.items():
                            setattr(existing, k, v)
                        existing.save()
                        updated += 1
                    else:
                        fields['code'] = code + rename_suffix
                        Material.objects.create(**fields)
                        created += 1
                else:
                    fields['code'] = code
                    Material.objects.create(**fields)
                    created += 1
            results['material'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── Warehouse ──
        if 'warehouse' in types and 'warehouse' in data:
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('warehouse', [])
            for row in data['warehouse']:
                code = row['code']
                existing = Warehouse.objects.filter(code=code).first()
                if existing:
                    if code in ow_codes:
                        existing.name = row.get('name', existing.name)
                        existing.address = row.get('address', existing.address)
                        existing.is_active = row.get('is_active', existing.is_active)
                        existing.save()
                        updated += 1
                    else:
                        Warehouse.objects.create(
                            code=code + rename_suffix,
                            name=row.get('name', ''),
                            address=row.get('address', ''),
                            is_active=row.get('is_active', True),
                        )
                        created += 1
                else:
                    Warehouse.objects.create(
                        code=code,
                        name=row.get('name', ''),
                        address=row.get('address', ''),
                        is_active=row.get('is_active', True),
                    )
                    created += 1
            results['warehouse'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── Inventory ──
        if 'inventory' in types and 'inventory' in data:
            created = updated = skipped = 0
            for row in data['inventory']:
                mat = Material.objects.filter(code=row.get('material_code')).first()
                wh = Warehouse.objects.filter(code=row.get('warehouse_code')).first()
                if not mat or not wh:
                    skipped += 1
                    continue
                from apps.warehouse.models import Shelf
                shelf = None
                if row.get('shelf_name'):
                    shelf = Shelf.objects.filter(warehouse=wh, name=row['shelf_name']).first()
                if not shelf:
                    # Use first shelf of warehouse
                    shelf = Shelf.objects.filter(warehouse=wh).first()
                if not shelf:
                    skipped += 1
                    continue
                inv, inv_created = Inventory.objects.get_or_create(
                    material=mat, warehouse=wh, shelf=shelf,
                    defaults={'quantity': row.get('quantity', 0)},
                )
                if not inv_created:
                    inv.quantity = row.get('quantity', inv.quantity)
                    inv.save()
                    updated += 1
                else:
                    created += 1
            results['inventory'] = {'created': created, 'updated': updated, 'skipped': skipped}

        # ── Employee ──
        if 'employee' in types and 'employee' in data:
            from django.contrib.auth import get_user_model
            from apps.hr.models import Employee
            User = get_user_model()
            created = updated = skipped = 0
            ow_codes = overwrite_map.get('employee', [])
            for row in data['employee']:
                eid = row['employee_id']
                existing_emp = Employee.objects.filter(employee_id=eid).first()
                if existing_emp:
                    if eid in ow_codes:
                        u = existing_emp.user
                        u.first_name = row.get('first_name', u.first_name)
                        u.last_name = row.get('last_name', u.last_name)
                        u.email = row.get('email', u.email)
                        u.save()
                        for f in ['phone', 'hire_date', 'termination_date', 'permission_level',
                                  'gross_salary', 'net_salary', 'net_hourly_rate', 'overhead_hourly_rate',
                                  'daily_work_hours', 'address_country', 'address_postal_code',
                                  'address_city', 'address_street_name', 'address_street_type',
                                  'address_house_number', 'address_generic', 'tb_number', 'tax_number',
                                  'birth_place', 'birth_date', 'gender', 'is_active']:
                            if f in row:
                                setattr(existing_emp, f, row[f])
                        existing_emp.save()
                        updated += 1
                    else:
                        skipped += 1
                else:
                    email = row.get('email', '')
                    # Create user first
                    uname = email.split('@')[0] if email else eid
                    # Ensure unique username
                    base_uname = uname
                    suffix = 1
                    while User.objects.filter(username=uname).exists():
                        uname = f"{base_uname}_{suffix}"
                        suffix += 1
                    u = User.objects.create_user(
                        username=uname,
                        email=email,
                        first_name=row.get('first_name', ''),
                        last_name=row.get('last_name', ''),
                        password=None,
                        is_active=row.get('is_active', True),
                    )
                    emp = Employee(user=u, employee_id=eid)
                    for f in ['phone', 'hire_date', 'termination_date', 'permission_level',
                              'gross_salary', 'net_salary', 'net_hourly_rate', 'overhead_hourly_rate',
                              'daily_work_hours', 'address_country', 'address_postal_code',
                              'address_city', 'address_street_name', 'address_street_type',
                              'address_house_number', 'address_generic', 'tb_number', 'tax_number',
                              'birth_place', 'birth_date', 'gender', 'is_active']:
                        if row.get(f) is not None:
                            setattr(emp, f, row[f])
                    emp.save()
                    created += 1
            results['employee'] = {'created': created, 'updated': updated, 'skipped': skipped}

    return _ok({'results': results, 'errors': errors})
