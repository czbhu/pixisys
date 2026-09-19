from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Sum, Prefetch
from django.db import transaction
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
import requests
from datetime import datetime, date
from .nav_invoice_service import NavInvoiceService
from .models import (
    MaterialType, MaterialGroup, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialCostItem, MaterialSize,
    MaterialStock, MaterialReceipt, MaterialReceiptBatch, StockMovement,
    SupplierInvoice, InvoiceItem,
    ScrapRecord, ScrapItem, MaterialGroupApiSync, MaterialBarcode,
)
from .serializers import (
    MaterialTypeSerializer, MaterialGroupSerializer, MaterialSerializer, WarehouseSerializer, 
    ShelfSerializer, MaterialSupplierSerializer, InventorySerializer, 
    MaterialCostItemSerializer, MaterialSizeSerializer,
    MaterialStockSerializer, MaterialReceiptSerializer, StockMovementSerializer,
    MaterialReceiptBatchSerializer, MaterialReceiptBatchDetailSerializer,
    SupplierInvoiceSerializer, InvoiceItemSerializer,
    ScrapRecordSerializer, ScrapItemSerializer,
    MaterialGroupApiSyncSerializer, PublicMaterialSerializer,
    MaterialBarcodeSerializer, POSProductSerializer,
)
from apps.crm.models import Company

class LargeResultsSetPagination(PageNumberPagination):
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 2000

class MaterialTypeViewSet(viewsets.ModelViewSet):
    """Alapanyag típusok kezelése"""
    queryset = MaterialType.objects.all()
    serializer_class = MaterialTypeSerializer


class MaterialGroupViewSet(viewsets.ModelViewSet):
    """Alapanyag gyűjtők kezelése"""
    queryset = MaterialGroup.objects.all()
    serializer_class = MaterialGroupSerializer
    pagination_class = LargeResultsSetPagination

    def get_queryset(self):
        queryset = MaterialGroup.objects.select_related('created_by', 'parent')
        
        # Szűrés aktív státusz szerint
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Keresés név szerint
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        return queryset.order_by('name')

    def list(self, request, *args, **kwargs):
        """Bulk-compute materials_count (and a representative image) for all groups
        in a handful of queries instead of one per group."""
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        objects = page if page is not None else list(qs)

        counts: dict = {}
        for gid, mat_id in Material.objects.exclude(material_group_id__isnull=True).values_list('material_group_id', 'id'):
            counts.setdefault(gid, set()).add(mat_id)
        M2M = Material.material_groups.through
        for gid, mat_id in M2M.objects.values_list('materialgroup_id', 'material_id'):
            counts.setdefault(gid, set()).add(mat_id)

        # First non-empty image_url found for each group (FK first, then M2M) — used
        # by the shop-style category browsers (public shop + POS) to show a tile image.
        images: dict = {}
        for gid, img in (Material.objects
                         .exclude(material_group_id__isnull=True).exclude(image_url='')
                         .order_by('material_group_id')
                         .values_list('material_group_id', 'image_url')):
            images.setdefault(gid, img)
        for gid, img in (M2M.objects
                         .exclude(material__image_url='')
                         .order_by('materialgroup_id')
                         .values_list('materialgroup_id', 'material__image_url')):
            images.setdefault(gid, img)

        for obj in objects:
            obj._materials_count = len(counts.get(obj.id, ()))
            obj._image_url = images.get(obj.id)

        serializer = self.get_serializer(objects, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)




class MaterialViewSet(viewsets.ModelViewSet):
    """Alapanyagok/Termékek kezelése"""
    queryset = Material.objects.all()
    serializer_class = MaterialSerializer
    pagination_class = LargeResultsSetPagination

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            from rest_framework.permissions import AllowAny
            return [AllowAny()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        """Override list to mark objects with _lite_mode for fast serialization."""
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        objects = page if page is not None else list(qs)
        # Mark all objects for lite mode (skip expensive N+1 computed fields)
        for obj in objects:
            obj._lite_mode = True
        serializer = self.get_serializer(objects, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
    
    def get_queryset(self):
        from apps.warehouse.models import MaterialGroup
        # select_related/prefetch_related avoid N+1 queries for the serializer's
        # material_type_name / material_group_name / material_group_names /
        # created_by_name / default_supplier_name / internal_production_department_name
        # fields (get_full_name() also walks up to 2 parent levels).
        queryset = Material.objects.select_related(
            'material_type', 'material_group', 'material_group__parent', 'material_group__parent__parent',
            'default_supplier', 'internal_production_department', 'created_by',
        ).prefetch_related(
            Prefetch('material_groups', queryset=MaterialGroup.objects.select_related('parent', 'parent__parent')),
        )
        material_type = self.request.query_params.get('material_type', None)
        filter_type = self.request.query_params.get('filter_type', None)
        search = self.request.query_params.get('search', None)
        material_group = self.request.query_params.get('material_group', None)
        material_group_ids = self.request.query_params.get('material_group_ids', None)  # vesszővel elválasztott ID lista
        supplier = self.request.query_params.get('supplier', None)
        
        if material_type:
            queryset = queryset.filter(material_type_id=material_type)
        
        # Szűrés típus szerint: materials, products, vagy mind
        if filter_type == 'materials':
            queryset = queryset.filter(is_material=True)
        elif filter_type == 'products':
            queryset = queryset.filter(is_product=True)
        # Ha 'all' vagy nincs megadva, akkor mindent mutat
        
        if material_group_ids:
            id_list = [i.strip() for i in material_group_ids.split(',') if i.strip().isdigit()]
            if id_list:
                # Filter by M2M field (includes backward-compat FK)
                queryset = queryset.filter(
                    Q(material_group_id__in=id_list) | Q(material_groups__in=id_list)
                ).distinct()
        elif material_group:
            queryset = queryset.filter(
                Q(material_group_id=material_group) | Q(material_groups=material_group)
            ).distinct()
        
        if supplier:
            queryset = queryset.filter(default_supplier_id=supplier)

        # Filter by warehouse(s): only materials that have stock in these warehouses
        warehouse_ids = self.request.query_params.get('warehouse_ids')
        if warehouse_ids:
            from apps.warehouse.models import MaterialVariant
            parts = [w.strip() for w in warehouse_ids.split(',') if w.strip()]
            has_no_wh = '0' in parts
            wid_list = [w for w in parts if w.isdigit() and w != '0']
            # Any material with variants is API-synced → always counts as having external stock,
            # regardless of current stock_quantity level (out-of-stock items are still "external").
            api_synced_mat_ids = MaterialVariant.objects.values_list('material_id', flat=True).distinct()
            if has_no_wh and wid_list:
                # Mix: truly "no warehouse" OR specific warehouses
                queryset = queryset.filter(
                    Q(stocks__warehouse_id__in=wid_list) |
                    (Q(stocks__isnull=True) & ~Q(id__in=api_synced_mat_ids))
                ).distinct()
            elif has_no_wh:
                # "No warehouse" = no MaterialStock AND not an API-synced product
                queryset = queryset.filter(stocks__isnull=True).exclude(id__in=api_synced_mat_ids)
            elif wid_list:
                queryset = queryset.filter(stocks__warehouse_id__in=wid_list).distinct()

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | 
                Q(code__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset

    @action(detail=False, methods=['get'], url_path='pos-products')
    def pos_products(self, request):
        """Minimális, gyors, lapozás nélküli terméklista a Kassza (POS) képernyőhöz.
        Csak a ténylegesen megjelenített mezőket adja vissza (nincs drága join/számítás),
        így nagy tételszám (pár ezer termék) mellett is gyorsan betöltődik egyetlen kérésben."""
        queryset = Material.objects.filter(is_product=True)

        is_active = request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        warehouse_ids = request.query_params.get('warehouse_ids')
        if warehouse_ids:
            from apps.warehouse.models import MaterialVariant
            parts = [w.strip() for w in warehouse_ids.split(',') if w.strip()]
            has_no_wh = '0' in parts
            wid_list = [w for w in parts if w.isdigit() and w != '0']
            api_synced_mat_ids = MaterialVariant.objects.values_list('material_id', flat=True).distinct()
            if has_no_wh and wid_list:
                queryset = queryset.filter(
                    Q(stocks__warehouse_id__in=wid_list) |
                    (Q(stocks__isnull=True) & ~Q(id__in=api_synced_mat_ids))
                ).distinct()
            elif has_no_wh:
                queryset = queryset.filter(stocks__isnull=True).exclude(id__in=api_synced_mat_ids)
            elif wid_list:
                queryset = queryset.filter(stocks__warehouse_id__in=wid_list).distinct()

        serializer = POSProductSerializer(queryset, many=True)
        return Response(serializer.data)

    # CSV mezők sorrendje (fejléc)
    CSV_FIELDS = [
        'code', 'name', 'description',
        'is_material', 'is_product', 'is_active',
        'unit', 'unit_cost_price', 'unit_selling_price', 'markup_percentage', 'currency',
        'vat_type',
        'material_group_name', 'material_format',
        'width', 'length', 'height', 'dimension_unit',
        'width_fixed', 'length_fixed', 'height_fixed',
        'density', 'density_unit',
        'area_weight', 'area_weight_unit',
        'specific_weight', 'specific_weight_unit',
        'weight', 'weight_unit',
        'volume_liter',
        'default_supplier_name',
        'suppliers',
        'price_calculation_versions',
        'stocks',
        'sizes',
    ]

    @action(detail=False, methods=['get'], url_path='export_csv')
    def export_csv(self, request):
        """Összes anyag exportálása CSV-be. ids=1,2,3 esetén csak azokat."""
        import csv
        import json
        from django.http import HttpResponse
        from apps.warehouse.models import MaterialSupplier, MaterialCostItem, MaterialStock, MaterialSize

        qs = self.get_queryset().select_related('material_group', 'default_supplier')
        ids_param = request.query_params.get('ids', '').strip()
        if ids_param:
            id_list = [i.strip() for i in ids_param.split(',') if i.strip().isdigit()]
            if id_list:
                qs = qs.filter(id__in=id_list)

        material_ids = list(qs.values_list('id', flat=True))

        # Kapcsolódó adatok előre betöltve
        sup_map = {}
        for s in (MaterialSupplier.objects
                  .filter(material_id__in=material_ids, is_active=True)
                  .select_related('supplier')
                  .order_by('material_id', '-is_primary', 'supplier__name')):
            sup_map.setdefault(s.material_id, []).append(s)

        ver_map = {}
        for v in (MaterialCostItem.objects
                  .filter(material_id__in=material_ids)
                  .values('material_id', 'price_calculation_version')
                  .distinct()
                  .order_by('material_id', 'price_calculation_version')):
            ver_map.setdefault(v['material_id'], []).append(v['price_calculation_version'])

        stock_map = {}
        for s in (MaterialStock.objects
                  .filter(material_id__in=material_ids)
                  .select_related('warehouse')
                  .order_by('material_id', 'warehouse__name')):
            stock_map.setdefault(s.material_id, []).append(s)

        size_map = {}
        for s in (MaterialSize.objects
                  .filter(material_id__in=material_ids, is_active=True)
                  .order_by('material_id', 'sort_order', 'width', 'length')):
            size_map.setdefault(s.material_id, []).append(s)

        # ÁFA típusok az invoice rendszerből
        vat_lookup = {}
        try:
            vat_resp = requests.get('http://localhost:4001/api/vat-types/', timeout=5)
            if vat_resp.status_code == 200:
                data = vat_resp.json()
                results = data.get('results', data) if isinstance(data, dict) else data
                for vt in results:
                    vat_lookup[str(vt.get('id', ''))] = vt.get('name') or vt.get('code') or ''
        except Exception:
            pass

        def _dec(v):
            return float(v) if v is not None else None

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="materials.csv"'
        response.write('\ufeff')  # UTF-8 BOM for Excel
        writer = csv.DictWriter(response, fieldnames=self.CSV_FIELDS, extrasaction='ignore')
        writer.writeheader()

        for m in qs:
            suppliers_json = json.dumps([
                {
                    'nev': s.supplier.name,
                    'egysegar': _dec(s.unit_price),
                    'penznem': s.currency,
                    'elsodleges': s.is_primary,
                    'kod': s.supplier_code or '',
                }
                for s in sup_map.get(m.id, [])
            ], ensure_ascii=False)

            versions_json = json.dumps(ver_map.get(m.id, []), ensure_ascii=False)

            stocks_json = json.dumps([
                {
                    'raktar': s.warehouse.name,
                    'mennyiseg': _dec(s.quantity),
                    'mertekegyseg': m.unit or '',
                    'szelesseg': _dec(s.width),
                    'hosszusag': _dec(s.length),
                    'vastagság': _dec(s.thickness),
                    'mertek_me': s.dimension_unit or '',
                }
                for s in stock_map.get(m.id, [])
            ], ensure_ascii=False)

            sizes_json = json.dumps([
                {
                    'nev': s.name or '',
                    'szelesseg': _dec(s.width),
                    'hosszusag': _dec(s.length),
                    'magassag': _dec(s.height),
                    'mertek_me': s.dimension_unit or '',
                    'ar_tipus': s.pricing_type,
                    'ar': _dec(s.effective_price),
                    'penznem': m.currency or 'HUF',
                }
                for s in size_map.get(m.id, [])
            ], ensure_ascii=False)

            writer.writerow({
                'code': m.code or '',
                'name': m.name or '',
                'description': m.description or '',
                'is_material': '1' if m.is_material else '0',
                'is_product': '1' if m.is_product else '0',
                'is_active': '1' if m.is_active else '0',
                'unit': m.unit or '',
                'unit_cost_price': _dec(m.unit_cost_price) if m.unit_cost_price is not None else '',
                'unit_selling_price': _dec(m.unit_selling_price) if m.unit_selling_price is not None else '',
                'markup_percentage': _dec(m.markup_percentage) if m.markup_percentage is not None else '',
                'currency': m.currency or 'HUF',
                'vat_type': vat_lookup.get(str(m.vat_type_id), str(m.vat_type_id) if m.vat_type_id else ''),
                'material_group_name': (m.material_group.name if m.material_group else ''),
                'material_format': m.material_format or '',
                'width': _dec(m.width) if m.width is not None else '',
                'length': _dec(m.length) if m.length is not None else '',
                'height': _dec(m.height) if m.height is not None else '',
                'dimension_unit': m.dimension_unit or '',
                'width_fixed': '1' if m.width_fixed else '0',
                'length_fixed': '1' if m.length_fixed else '0',
                'height_fixed': '1' if m.height_fixed else '0',
                'density': _dec(m.density) if m.density is not None else '',
                'density_unit': m.density_unit or '',
                'area_weight': _dec(m.area_weight) if m.area_weight is not None else '',
                'area_weight_unit': m.area_weight_unit or '',
                'specific_weight': _dec(m.specific_weight) if m.specific_weight is not None else '',
                'specific_weight_unit': m.specific_weight_unit or '',
                'weight': _dec(m.weight) if m.weight is not None else '',
                'weight_unit': m.weight_unit or '',
                'volume_liter': _dec(m.volume_liter) if m.volume_liter is not None else '',
                'default_supplier_name': (m.default_supplier.name if m.default_supplier else ''),
                'suppliers': suppliers_json,
                'price_calculation_versions': versions_json,
                'stocks': stocks_json,
                'sizes': sizes_json,
            })
        return response

    @action(detail=False, methods=['post'], url_path='import_csv',
            parser_classes=[MultiPartParser, FormParser])
    def import_csv(self, request):
        """CSV import: ha azonos a cikkszám, frissíti; egyébként létrehozza.
        skip_empty=1 esetén az üres CSV cellák nem írják felül a meglévő értékeket."""
        import csv
        import io
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'Nincs fájl csatolva.'}, status=400)

        skip_empty = request.data.get('skip_empty', '0') in ('1', 'true', 'True')

        try:
            content = file_obj.read().decode('utf-8-sig')  # strip BOM
            reader = csv.DictReader(io.StringIO(content))
        except Exception as e:
            return Response({'error': f'Fájl olvasási hiba: {e}'}, status=400)

        created = 0
        updated = 0
        errors = []

        # Előre betöltjük a csoportokat és beszállítókat névalapon
        group_map = {g.name.strip().lower(): g for g in MaterialGroup.objects.all()}
        supplier_map = {s.name.strip().lower(): s for s in Company.objects.filter(is_supplier=True)}

        def to_decimal(val):
            if val is None or str(val).strip() == '':
                return None
            try:
                return float(str(val).replace(',', '.'))
            except Exception:
                return None

        def to_bool(val):
            return str(val).strip() in ('1', 'true', 'True', 'igen', 'yes')

        for row_num, row in enumerate(reader, start=2):
            code = (row.get('code') or '').strip()
            if not code:
                errors.append(f'#{row_num}: hiányzó cikkszám — sor kihagyva')
                continue
            name = (row.get('name') or '').strip()
            if not name:
                errors.append(f'#{row_num} ({code}): hiányzó név — sor kihagyva')
                continue

            # Lookup kapcsolt objektumok
            group_name = (row.get('material_group_name') or '').strip().lower()
            group = group_map.get(group_name)

            supplier_name = (row.get('default_supplier_name') or '').strip().lower()
            supplier = supplier_map.get(supplier_name)

            defaults = {
                'name': name,
                'description': (row.get('description') or '').strip(),
                'is_material': to_bool(row.get('is_material', '1')),
                'is_product': to_bool(row.get('is_product', '0')),
                'is_active': to_bool(row.get('is_active', '1')),
                'unit': (row.get('unit') or '').strip(),
                'unit_cost_price': to_decimal(row.get('unit_cost_price')),
                'markup_percentage': to_decimal(row.get('markup_percentage')) or 0,
                'currency': (row.get('currency') or 'HUF').strip(),
                'material_group': group,
                'material_format': (row.get('material_format') or '').strip(),
                'width': to_decimal(row.get('width')),
                'length': to_decimal(row.get('length')),
                'height': to_decimal(row.get('height')),
                'dimension_unit': (row.get('dimension_unit') or 'mm').strip(),
                'width_fixed': to_bool(row.get('width_fixed', '0')),
                'length_fixed': to_bool(row.get('length_fixed', '0')),
                'height_fixed': to_bool(row.get('height_fixed', '0')),
                'density': to_decimal(row.get('density')),
                'density_unit': (row.get('density_unit') or '').strip(),
                'area_weight': to_decimal(row.get('area_weight')),
                'area_weight_unit': (row.get('area_weight_unit') or '').strip(),
                'specific_weight': to_decimal(row.get('specific_weight')),
                'specific_weight_unit': (row.get('specific_weight_unit') or '').strip(),
                'weight': to_decimal(row.get('weight')),
                'weight_unit': (row.get('weight_unit') or '').strip(),
                'volume_liter': to_decimal(row.get('volume_liter')),
                'default_supplier': supplier,
            }

            try:
                if skip_empty:
                    # Csak a nem-üres mezőket frissítjük meglévő rekordnál
                    existing = Material.objects.filter(code=code).first()
                    if existing:
                        filtered = {
                            k: v for k, v in defaults.items()
                            if v is not None and v != ''
                        }
                        for k, v in filtered.items():
                            setattr(existing, k, v)
                        existing.save()
                        obj, is_new = existing, False
                    else:
                        obj = Material.objects.create(code=code, **defaults)
                        is_new = True
                else:
                    obj, is_new = Material.objects.update_or_create(code=code, defaults=defaults)
                if is_new:
                    created += 1
                else:
                    updated += 1
            except Exception as e:
                errors.append(f'#{row_num} ({code}): {e}')

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors,
        })

class WarehouseViewSet(viewsets.ModelViewSet):
    """Raktárak kezelése"""
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer

class ShelfViewSet(viewsets.ModelViewSet):
    """Polcok kezelése"""
    queryset = Shelf.objects.all()
    serializer_class = ShelfSerializer
    
    def get_queryset(self):
        queryset = Shelf.objects.all()
        warehouse = self.request.query_params.get('warehouse', None)
        
        if warehouse:
            queryset = queryset.filter(warehouse_id=warehouse)
        
        return queryset

class MaterialSupplierViewSet(viewsets.ModelViewSet):
    """Alapanyag beszállítók kezelése"""
    queryset = MaterialSupplier.objects.all()
    serializer_class = MaterialSupplierSerializer
    
    def get_queryset(self):
        queryset = MaterialSupplier.objects.all()
        material = self.request.query_params.get('material', None)
        supplier = self.request.query_params.get('supplier', None)
        supplier_ext = self.request.query_params.get('supplier_external_id', None)
        
        if material:
            queryset = queryset.filter(material_id=material)
        
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        elif supplier_ext:
            queryset = queryset.filter(supplier_external_id=supplier_ext)
        
        return queryset

    @action(detail=False, methods=['post'])
    def learn_match(self, request):
        """
        Megjegyzi, hogy egy adott beszállító adott termékkódja/neve melyik belső anyaghoz tartozik.
        """
        supplier_id = request.data.get('supplier_id')
        material_id = request.data.get('material_id')
        supplier_code = request.data.get('supplier_code')
        # supplier_name is not currently stored in MaterialSupplier, but could be useful if we add field later
        
        if not supplier_id or not material_id:
             return Response({'error': 'Supplier ID and Material ID required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Check if exists
            ms = MaterialSupplier.objects.filter(
                supplier_id=supplier_id,
                material_id=material_id
            ).first()

            if ms:
                # Update existing
                if supplier_code:
                    ms.supplier_code = supplier_code
                ms.save()
            else:
                # Create new
                MaterialSupplier.objects.create(
                    supplier_id=supplier_id,
                    material_id=material_id,
                    supplier_code=supplier_code or '',
                    unit_price=0 # Default
                )
            
            return Response({'success': True, 'message': 'Pairing remembered'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



class InventoryViewSet(viewsets.ModelViewSet):
    """Készlet kezelése"""
    queryset = Inventory.objects.all()
    serializer_class = InventorySerializer
    
    def get_queryset(self):
        queryset = Inventory.objects.all()
        material = self.request.query_params.get('material', None)
        warehouse = self.request.query_params.get('warehouse', None)
        shelf = self.request.query_params.get('shelf', None)
        low_stock = self.request.query_params.get('low_stock', None)
        
        if material:
            queryset = queryset.filter(material_id=material)
        
        if warehouse:
            queryset = queryset.filter(warehouse_id=warehouse)

        if shelf:
            queryset = queryset.filter(shelf_id=shelf)
        
        if low_stock == 'true':
            # Készlet alacsonyabb, mint a minimum készletszint
            queryset = queryset.filter(quantity__lt=models.F('material__min_stock_level'))
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Készlet összesítés"""
        queryset = self.get_queryset()
        
        # Összesítés anyag szerint
        material_summary = queryset.values(
            'material__name', 'material__code', 'material__unit'
        ).annotate(
            total_quantity=Sum('quantity')
        ).order_by('material__name')
        
        # Összesítés raktár szerint
        warehouse_summary = queryset.values(
            'warehouse__name'
        ).annotate(
            total_quantity=Sum('quantity')
        ).order_by('warehouse__name')
        
        return Response({
            'material_summary': material_summary,
            'warehouse_summary': warehouse_summary
        })



class MaterialCostItemViewSet(viewsets.ModelViewSet):
    """Alapanyag költség elemek kezelése"""
    queryset = MaterialCostItem.objects.all()
    serializer_class = MaterialCostItemSerializer
    
    def get_queryset(self):
        queryset = MaterialCostItem.objects.select_related('material', 'supplier')
        material_id = self.request.query_params.get('material_id', None)
        supplier_id = self.request.query_params.get('supplier_id', None)
        supplier_ext = self.request.query_params.get('supplier_external_id', None)
        is_internal = self.request.query_params.get('is_internal', None)
        
        if material_id:
            queryset = queryset.filter(material_id=material_id)
        
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        elif supplier_ext:
            queryset = queryset.filter(supplier_external_id=supplier_ext)
        
        if is_internal is not None:
            queryset = queryset.filter(is_internal=is_internal.lower() == 'true')
        
        return queryset


class MaterialSizeViewSet(viewsets.ModelViewSet):
    """Rendelhető méretek kezelése"""
    queryset = MaterialSize.objects.all()
    serializer_class = MaterialSizeSerializer

    def get_queryset(self):
        queryset = MaterialSize.objects.select_related('material')
        material_id = self.request.query_params.get('material_id', None)
        if material_id:
            queryset = queryset.filter(material_id=material_id)
        return queryset


class MaterialStockViewSet(viewsets.ModelViewSet):
    """Készletek kezelése"""
    queryset = MaterialStock.objects.all()
    serializer_class = MaterialStockSerializer
    
    def get_queryset(self):
        queryset = MaterialStock.objects.select_related(
            'material', 'warehouse', 'receipt', 'created_by'
        ).all()
        
        material_id = self.request.query_params.get('material_id', None)
        warehouse_id = self.request.query_params.get('warehouse_id', None)
        stock_status = self.request.query_params.get('status', None)
        
        if material_id:
            queryset = queryset.filter(material_id=material_id)
        
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        if stock_status:
            queryset = queryset.filter(status=stock_status)
        
        return queryset
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        """Készlet mozgatása raktárak között"""
        stock = self.get_object()
        to_warehouse_id = request.data.get('to_warehouse')
        quantity = request.data.get('quantity', stock.quantity)
        notes = request.data.get('notes', '')
        
        if not to_warehouse_id:
            return Response(
                {'error': 'Cél raktár megadása kötelező'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            to_warehouse = Warehouse.objects.get(id=to_warehouse_id)
        except Warehouse.DoesNotExist:
            return Response(
                {'error': 'Nem létező raktár'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if float(quantity) > float(stock.quantity):
            return Response(
                {'error': 'Nincs elegendő mennyiség'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Mozgás rögzítése
        movement = StockMovement.objects.create(
            stock=stock,
            movement_type='transfer',
            from_warehouse=stock.warehouse,
            to_warehouse=to_warehouse,
            quantity=quantity,
            notes=notes,
            created_by=request.user
        )
        
        # Ha teljes mennyiséget mozgat
        if float(quantity) == float(stock.quantity):
            stock.warehouse = to_warehouse
            stock.save()
        else:
            # Új készlet tétel a cél raktárban
            MaterialStock.objects.create(
                material=stock.material,
                warehouse=to_warehouse,
                quantity=quantity,
                width=stock.width,
                length=stock.length,
                thickness=stock.thickness,
                dimension_unit=stock.dimension_unit,
                unit_value=stock.unit_value,
                total_value=float(quantity) * float(stock.unit_value),
                currency=stock.currency,
                status=stock.status,
                receipt=stock.receipt,
                created_by=request.user
            )
            # Eredeti készlet csökkentése
            stock.quantity = float(stock.quantity) - float(quantity)
            stock.save()
        
        return Response({
            'message': 'Készlet sikeresen mozgatva',
            'movement_id': movement.id
        })
    
    @action(detail=True, methods=['post'])
    def scrap(self, request, pk=None):
        """Készlet selejtezése"""
        stock = self.get_object()
        notes = request.data.get('notes', '')
        
        # Mozgás rögzítése
        movement = StockMovement.objects.create(
            stock=stock,
            movement_type='scrap',
            from_warehouse=stock.warehouse,
            quantity=stock.quantity,
            notes=notes,
            created_by=request.user
        )
        
        stock.status = 'scrapped'
        stock.save()
        
        return Response({
            'message': 'Készlet selejtezve',
            'movement_id': movement.id
        })
    
    @action(detail=True, methods=['post'])
    def mark_defective(self, request, pk=None):
        """Készlet hibásnak jelölése"""
        stock = self.get_object()
        notes = request.data.get('notes', '')
        
        # Mozgás rögzítése
        movement = StockMovement.objects.create(
            stock=stock,
            movement_type='mark_defective',
            from_warehouse=stock.warehouse,
            quantity=stock.quantity,
            notes=notes,
            created_by=request.user
        )
        
        stock.status = 'defective'
        stock.save()
        
        return Response({
            'message': 'Készlet hibásnak jelölve',
            'movement_id': movement.id
        })


class MaterialReceiptViewSet(viewsets.ModelViewSet):
    """Bevételezések kezelése"""
    queryset = MaterialReceipt.objects.all()
    serializer_class = MaterialReceiptSerializer
    
    def get_queryset(self):
        queryset = MaterialReceipt.objects.select_related(
            'material', 'warehouse', 'supplier', 'created_by'
        ).all()
        
        material_id = self.request.query_params.get('material_id', None)
        warehouse_id = self.request.query_params.get('warehouse_id', None)
        supplier_id = self.request.query_params.get('supplier_id', None)
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        
        if material_id:
            queryset = queryset.filter(material_id=material_id)
        
        if warehouse_id:
            queryset = queryset.filter(warehouse_id=warehouse_id)
        
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        
        if date_from:
            queryset = queryset.filter(receipt_date__gte=date_from)
        
        if date_to:
            queryset = queryset.filter(receipt_date__lte=date_to)

        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(material__name__icontains=search) |
                Q(material__description__icontains=search) |
                Q(supplier__name__icontains=search)
            )

        return queryset.order_by('-receipt_date', '-created_at')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class MaterialReceiptBatchViewSet(viewsets.ModelViewSet):
    """Bevételezések fejléce + tételei (a step-by-step bevételezés véglegesítése ide ír)."""
    queryset = MaterialReceiptBatch.objects.all()
    serializer_class = MaterialReceiptBatchSerializer

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MaterialReceiptBatchDetailSerializer
        return MaterialReceiptBatchSerializer

    def get_queryset(self):
        queryset = MaterialReceiptBatch.objects.select_related('supplier', 'warehouse').prefetch_related('lines__material')
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(supplier__name__icontains=search) |
                Q(lines__material__name__icontains=search) |
                Q(lines__material__description__icontains=search)
            ).distinct()
        return queryset

    def create(self, request, *args, **kwargs):
        data = request.data
        lines = data.get('lines') or []
        if not lines:
            return Response({'error': 'Legalább egy tétel megadása kötelező.'}, status=status.HTTP_400_BAD_REQUEST)
        if not data.get('warehouse'):
            return Response({'error': 'Raktár megadása kötelező.'}, status=status.HTTP_400_BAD_REQUEST)
        user = request.user if request.user.is_authenticated else None
        with transaction.atomic():
            batch = MaterialReceiptBatch.objects.create(
                supplier_id=data.get('supplier'),
                warehouse_id=data.get('warehouse'),
                document_type=data.get('document_type', 'delivery'),
                receipt_date=data.get('receipt_date'),
                invoice_number=data.get('invoice_number', ''),
                notes=data.get('notes', ''),
                created_by=user,
            )
            for line in lines:
                qty = float(line.get('quantity') or 0)
                price = float(line.get('unit_price') or 0)
                MaterialReceipt.objects.create(
                    batch=batch,
                    material_id=line['material'],
                    warehouse_id=batch.warehouse_id,
                    supplier_id=batch.supplier_id,
                    receipt_date=batch.receipt_date,
                    invoice_number=batch.invoice_number,
                    invoice_value=qty * price,
                    quantity=qty,
                    unit_price=price,
                    unit=line.get('unit') or '',
                    currency='HUF',
                    notes=batch.notes,
                    created_by=user,
                )
        serializer = MaterialReceiptBatchDetailSerializer(batch)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _apply_update(self, request, batch):
        data = request.data
        if 'supplier' in data:
            batch.supplier_id = data.get('supplier')
        if 'warehouse' in data:
            batch.warehouse_id = data.get('warehouse')
        if 'document_type' in data:
            batch.document_type = data.get('document_type')
        if 'receipt_date' in data:
            batch.receipt_date = data.get('receipt_date')
        if 'invoice_number' in data:
            batch.invoice_number = data.get('invoice_number', '')
        if 'notes' in data:
            batch.notes = data.get('notes', '')
        batch.save()

        lines = data.get('lines')
        if lines is not None:
            user = request.user if request.user.is_authenticated else None
            existing = {l.id: l for l in batch.lines.all()}
            submitted_ids = set()
            for line in lines:
                qty = float(line.get('quantity') or 0)
                price = float(line.get('unit_price') or 0)
                line_id = line.get('id')
                if line_id and line_id in existing:
                    obj = existing[line_id]
                    obj.material_id = line['material']
                    obj.warehouse_id = batch.warehouse_id
                    obj.supplier_id = batch.supplier_id
                    obj.receipt_date = batch.receipt_date
                    obj.invoice_number = batch.invoice_number
                    obj.quantity = qty
                    obj.unit_price = price
                    obj.unit = line.get('unit') or ''
                    obj.invoice_value = qty * price
                    obj.notes = batch.notes
                    obj.save()
                    submitted_ids.add(line_id)
                else:
                    new_obj = MaterialReceipt.objects.create(
                        batch=batch,
                        material_id=line['material'],
                        warehouse_id=batch.warehouse_id,
                        supplier_id=batch.supplier_id,
                        receipt_date=batch.receipt_date,
                        invoice_number=batch.invoice_number,
                        invoice_value=qty * price,
                        quantity=qty,
                        unit_price=price,
                        unit=line.get('unit') or '',
                        currency='HUF',
                        notes=batch.notes,
                        created_by=user,
                    )
                    submitted_ids.add(new_obj.id)
            # Remove lines that were dropped in the wizard
            for line_id, obj in existing.items():
                if line_id not in submitted_ids:
                    obj.delete()

    def update(self, request, *args, **kwargs):
        batch = self.get_object()
        with transaction.atomic():
            self._apply_update(request, batch)
        # Re-fetch: `batch` may carry a stale prefetch_related('lines') cache
        # (from get_object()) that still references now-deleted/mutated line objects.
        fresh = MaterialReceiptBatch.objects.select_related('supplier', 'warehouse').prefetch_related('lines__material').get(pk=batch.pk)
        serializer = MaterialReceiptBatchDetailSerializer(fresh)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """Készlet mozgások (csak olvasható)"""
    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer
    
    def get_queryset(self):
        queryset = StockMovement.objects.select_related(
            'stock', 'stock__material', 'from_warehouse', 'to_warehouse', 'created_by'
        ).all()
        
        stock_id = self.request.query_params.get('stock_id', None)
        material_id = self.request.query_params.get('material_id', None)
        movement_type = self.request.query_params.get('movement_type', None)
        
        if stock_id:
            queryset = queryset.filter(stock_id=stock_id)
        
        if material_id:
            queryset = queryset.filter(stock__material_id=material_id)
        
        if movement_type:
            queryset = queryset.filter(movement_type=movement_type)
        
        return queryset


class SupplierInvoiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet a beszállítói számlák kezeléséhez.
    """
    queryset = SupplierInvoice.objects.all()
    serializer_class = SupplierInvoiceSerializer
    
    def get_queryset(self):
        queryset = SupplierInvoice.objects.select_related('supplier').prefetch_related('items').all()
        
        # Szűrések
        supplier_id = self.request.query_params.get('supplier_id', None)
        status_filter = self.request.query_params.get('status', None)
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        if date_from:
            queryset = queryset.filter(invoice_date__gte=date_from)
        
        if date_to:
            queryset = queryset.filter(invoice_date__lte=date_to)
        
        return queryset.order_by('-invoice_date', '-created_at')
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Számla megerősítése (draft → confirmed)"""
        invoice = self.get_object()
        
        if invoice.status != 'draft':
            return Response(
                {'error': 'Csak piszkozat állapotú számla erősíthető meg'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice.status = 'confirmed'
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        """Számla bevételezése (confirmed → received)"""
        invoice = self.get_object()
        
        if invoice.status != 'confirmed':
            return Response(
                {'error': 'Csak megerősített számla bevételezhető'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Bevételezési dátum beállítása, ha nincs megadva
        if not invoice.receipt_date:
            from datetime import date
            invoice.receipt_date = date.today()
        
        invoice.status = 'received'
        invoice.save()
        
        # Készletek létrehozása a számlatételekből
        for item in invoice.items.all():
            MaterialStock.objects.create(
                material=item.material,
                warehouse=item.warehouse,
                quantity=item.quantity,
                width=item.width,
                length=item.length,
                thickness=item.thickness,
                dimension_unit=item.dimension_unit,
                unit_value=item.unit_price,
                total_value=item.total_price,
                currency=invoice.currency,
                status='in_stock',
                created_by=request.user
            )
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        """Számla kifizetettként jelölése (received → paid)"""
        invoice = self.get_object()
        
        if invoice.status not in ['received', 'confirmed']:
            return Response(
                {'error': 'Csak bevételezett vagy megerősített számla jelölhető kifizetettként'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Fizetés dátuma
        payment_date = request.data.get('payment_date', None)
        if payment_date:
            invoice.payment_date = payment_date
        else:
            from datetime import date
            invoice.payment_date = date.today()
        
        invoice.status = 'paid'
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Számla törlése/érvénytelenítése"""
        invoice = self.get_object()
        
        if invoice.status == 'received':
            return Response(
                {'error': 'Bevételezett számla nem törölhető'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        invoice.status = 'cancelled'
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """Számlakép feltöltése"""
        invoice = self.get_object()
        
        if 'image' not in request.FILES:
            return Response(
                {'error': 'Nincs kép csatolva'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        image = request.FILES['image']
        
        # Fájlnév generálása
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        ext = os.path.splitext(image.name)[1]
        filename = f"invoice_{invoice.id}_{timestamp}{ext}"
        
        # Kép mentése
        filepath = os.path.join('invoice_images', filename)
        saved_path = default_storage.save(filepath, ContentFile(image.read()))
        
        # invoice_images frissítése
        if invoice.invoice_images is None:
            invoice.invoice_images = []
        
        invoice.invoice_images.append(saved_path)
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def delete_image(self, request, pk=None):
        """Számlakép törlése"""
        invoice = self.get_object()
        image_path = request.data.get('image_path')
        
        if not image_path:
            return Response(
                {'error': 'Nincs képútvonal megadva'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if image_path not in (invoice.invoice_images or []):
            return Response(
                {'error': 'Kép nem található'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Kép törlése fájlrendszerből
        if default_storage.exists(image_path):
            default_storage.delete(image_path)
        
        # invoice_images frissítése
        invoice.invoice_images.remove(image_path)
        invoice.save()
        
        serializer = self.get_serializer(invoice)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def search_nav_invoices(self, request):
        """NAV számlák keresése számlaszám vagy beszállító alapján"""
        try:
            nav_service = NavInvoiceService()
            
            # Keresési paraméterek
            invoice_number = request.data.get('invoice_number')
            supplier_name = request.data.get('supplier_name')
            supplier_tax_number = request.data.get('supplier_tax_number')
            amount_min = request.data.get('amount_min')
            amount_max = request.data.get('amount_max')
            date_from_str = request.data.get('date_from')
            date_to_str = request.data.get('date_to')
            
            # Dátumok konvertálása
            date_from = datetime.fromisoformat(date_from_str).date() if date_from_str else None
            date_to = datetime.fromisoformat(date_to_str).date() if date_to_str else None
            
            # Keresés
            results = nav_service.search_invoices(
                invoice_number=invoice_number,
                supplier_name=supplier_name,
                supplier_tax_number=supplier_tax_number,
                amount_min=amount_min,
                amount_max=amount_max,
                date_from=date_from,
                date_to=date_to,
                limit=50
            )
            
            return Response({
                'success': True,
                'count': len(results),
                'invoices': results
            })
            
        except ValueError as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'success': False, 'error': f'NAV keresési hiba: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def import_nav_invoice(self, request):
        """NAV számla importálása és feldolgozása"""
        try:
            nav_service = NavInvoiceService()
            
            invoice_number = request.data.get('invoice_number')
            supplier_tax_number = request.data.get('supplier_tax_number')
            
            if not invoice_number or not supplier_tax_number:
                return Response(
                    {'error': 'Számlaszám és beszállító adószám kötelező'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Számla részletek lekérése
            nav_invoice = nav_service.get_invoice_details(invoice_number, supplier_tax_number)
            
            if not nav_invoice:
                return Response(
                    {'error': 'Számla nem található a NAV rendszerben'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Konvertálás ERP formátumra
            erp_data = nav_service.parse_invoice_to_erp_format(nav_invoice)

            # Beszállító keresése vagy létrehozása
            supp_tax = erp_data.get('supplier_tax_number')
            supp_name = erp_data.get('supplier_name')

            if supp_tax:
                # Keresés adószám első 8 számjegye alapján
                tax_8 = supp_tax[:8] if len(supp_tax) >= 8 else supp_tax
                supplier = Company.objects.filter(
                    Q(tax_number__startswith=tax_8) | 
                    Q(full_tax_number__startswith=tax_8)
                ).first()

                if not supplier and supp_name:
                    # Ha nincs, létrehozzuk
                    supplier = Company.objects.create(
                        name=supp_name,
                        tax_number=supp_tax,
                        full_tax_number=supp_tax,
                        is_supplier=True,
                        is_customer=False
                    )
                elif supplier and not supplier.is_supplier:
                    # Ha létezik, de nem beszállítóként, bejelöljük
                    supplier.is_supplier = True
                    supplier.save()
                
                if supplier:
                    erp_data['supplier'] = supplier.id
                    erp_data['supplier_name'] = supplier.name

            # --- PRE-MATCHING LOGIC ---
            # Attempt to find matching materials for items
            if erp_data.get('items'):
                for item in erp_data['items']:
                    prod_code = item.get('product_code')
                    supplier_id = erp_data.get('supplier')
                    
                    matched_mat = None
                    
                    # 1. Look in MaterialSupplier (Remembered bindings)
                    if supplier_id and prod_code:
                         ms = MaterialSupplier.objects.filter(
                             supplier_id=supplier_id,
                             supplier_code=prod_code
                         ).select_related('material').first()
                         if ms:
                             matched_mat = ms.material

                    # 2. Look for Internal Code == Product Code
                    if not matched_mat and prod_code:
                        matched_mat = Material.objects.filter(code=prod_code).first()

                    # 3. Fuzzy Name (skipped here, done in frontend, or could be added)

                    if matched_mat:
                        item['match_material_id'] = matched_mat.id
                        item['unit'] = item.get('unit') or matched_mat.unit # prefer nav unit if exists, else mat unit

            return Response({
                'success': True,
                'invoice_data': erp_data,
                'message': 'Számla sikeresen importálva, ellenőrizd az adatokat'
            })
            
        except ValueError as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'success': False, 'error': f'NAV import hiba: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InvoiceItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet a számlatételek kezeléséhez.
    """
    queryset = InvoiceItem.objects.all()
    serializer_class = InvoiceItemSerializer
    
    def get_queryset(self):
        queryset = InvoiceItem.objects.select_related(
            'invoice', 'material', 'warehouse'
        ).all()
        
        # Szűrések
        invoice_id = self.request.query_params.get('invoice_id', None)
        material_id = self.request.query_params.get('material_id', None)
        
        if invoice_id:
            queryset = queryset.filter(invoice_id=invoice_id)
        
        if material_id:
            queryset = queryset.filter(material_id=material_id)
        
        return queryset.order_by('id')


class ScrapRecordViewSet(viewsets.ModelViewSet):
    """Selejtezési jegyzőkönyvek kezelése"""
    queryset = ScrapRecord.objects.all()
    serializer_class = ScrapRecordSerializer
    parser_classes = [MultiPartParser, FormParser]
    
    def get_queryset(self):
        queryset = ScrapRecord.objects.select_related(
            'created_by', 'approved_by'
        ).prefetch_related('items__material', 'items__warehouse').all()
        
        # Szűrés dátum szerint
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(scrap_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(scrap_date__lte=date_to)
        
        # Szűrés jóváhagyott szerint
        is_approved = self.request.query_params.get('is_approved')
        if is_approved is not None:
            queryset = queryset.filter(is_approved=is_approved.lower() == 'true')
        
        # Keresés
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(scrap_number__icontains=search) |
                Q(reason__icontains=search)
            )
        
        return queryset.order_by('-scrap_date', '-created_at')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Selejtezés jóváhagyása"""
        scrap_record = self.get_object()
        scrap_record.is_approved = True
        scrap_record.approved_by = request.user
        scrap_record.approved_at = datetime.now()
        scrap_record.save()
        
        serializer = self.get_serializer(scrap_record)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """Fotó feltöltése selejtezéshez"""
        scrap_record = self.get_object()
        file = request.FILES.get('file')
        
        if not file:
            return Response({'error': 'Nincs fájl'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Fájlnév generálás
        ext = os.path.splitext(file.name)[1]
        filename = f"scrap_{scrap_record.scrap_number}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
        filepath = f"scrap_images/{filename}"
        
        # Mentés
        path = default_storage.save(filepath, ContentFile(file.read()))
        
        # Hozzáadás a jegyzőkönyvhöz
        images = scrap_record.images if scrap_record.images else []
        images.append(filename)
        scrap_record.images = images
        scrap_record.save()
        
        return Response({'filename': filename, 'path': path})
    
    @action(detail=True, methods=['delete'])
    def delete_image(self, request, pk=None):
        """Fotó törlése selejtezésről"""
        scrap_record = self.get_object()
        filename = request.data.get('filename')
        
        if not filename or filename not in scrap_record.images:
            return Response({'error': 'Érvénytelen fájlnév'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Törlés a tárolóból
        filepath = f"scrap_images/{filename}"
        if default_storage.exists(filepath):
            default_storage.delete(filepath)
        
        # Törlés a jegyzőkönyvből
        images = scrap_record.images
        images.remove(filename)
        scrap_record.images = images
        scrap_record.save()
        
        return Response({'message': 'Kép törölve'})


class ScrapItemViewSet(viewsets.ModelViewSet):
    """Selejtezett tételek kezelése"""
    queryset = ScrapItem.objects.all()
    serializer_class = ScrapItemSerializer
    
    def get_queryset(self):
        queryset = ScrapItem.objects.select_related(
            'scrap_record', 'stock', 'material', 'warehouse'
        ).all()
        
        # Szűrés jegyzőkönyv szerint
        scrap_record_id = self.request.query_params.get('scrap_record_id')
        if scrap_record_id:
            queryset = queryset.filter(scrap_record_id=scrap_record_id)
        
        return queryset.order_by('id')
    
    def perform_create(self, serializer):
        """Selejtezett tétel létrehozása és készlet csökkentése"""
        scrap_item = serializer.save()
        
        # Készlet csökkentése
        stock = scrap_item.stock
        stock.quantity -= scrap_item.quantity
        if stock.quantity <= 0:
            stock.status = 'scrapped'
            stock.quantity = 0
        stock.save()


class VATTypeProxyViewSet(viewsets.ViewSet):
    """
    Proxy ViewSet to fetch VAT types from the invoice system.
    This avoids CORS issues when calling from the frontend.
    """
    permission_classes = []
    
    def list(self, request):
        """Fetch VAT types from invoice system"""
        try:
            # Call the invoice API
            response = requests.get(
                'http://localhost:4001/api/vat-types/',
                params={'active': 'true'},
                timeout=10
            )
            
            if response.status_code == 200:
                return Response(response.json())
            else:
                return Response(
                    {'error': 'Failed to fetch VAT types from invoice system'},
                    status=response.status_code
                )
        except requests.RequestException as e:
            return Response(
                {'error': f'Error connecting to invoice system: {str(e)}'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


from .serializers import MaterialRemnantSerializer
from .models import MaterialRemnant
from rest_framework.permissions import IsAuthenticated


class MaterialRemnantViewSet(viewsets.ModelViewSet):
    """Alapanyag maradék (hulló) nyilvántartás."""
    permission_classes = [IsAuthenticated]
    serializer_class = MaterialRemnantSerializer

    def get_queryset(self):
        qs = MaterialRemnant.objects.select_related(
            'material', 'warehouse', 'created_by', 'source_stock'
        ).all()
        material_id = self.request.query_params.get('material')
        if material_id:
            qs = qs.filter(material_id=material_id)
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        available = self.request.query_params.get('available')
        if available == '1':
            qs = qs.filter(is_available=True)
        elif available == '0':
            qs = qs.filter(is_available=False)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='mark-used')
    def mark_used(self, request, pk=None):
        """Maradék felhasználtnak jelöl (is_available=False)."""
        remnant = self.get_object()
        remnant.is_available = False
        remnant.save()
        return Response({'status': 'ok', 'id': remnant.id})

    @action(detail=True, methods=['post'], url_path='mark-available')
    def mark_available(self, request, pk=None):
        """Maradék visszaáll elérhetőre (pl. tévedésből jelölték felhasználtnak)."""
        remnant = self.get_object()
        remnant.is_available = True
        remnant.save()
        return Response({'status': 'ok', 'id': remnant.id})


def _do_sync(sync):
    """Execute one MaterialGroupApiSync — fetch external API, create/update Materials."""
    from django.utils import timezone
    import urllib.request as _req
    import urllib.parse as _parse
    import json as _json

    # Ensure JSON fields are dicts/lists even if stored as strings
    def _parse_json(val, default):
        if isinstance(val, (dict, list)):
            return val
        try:
            return _json.loads(val or '{}') if val else default
        except Exception:
            return default

    NUMERIC_FIELDS = {'unit_selling_price', 'unit_cost_price', 'markup_percentage',
                      'width', 'length', 'height', 'weight', 'area_weight', 'density', 'volume_liter'}
    MATERIAL_FIELDS = {f.name for f in Material._meta.get_fields() if hasattr(f, 'column')}

    try:
        hdrs = dict(_parse_json(sync.api_headers, {}))
        body_params = _parse_json(sync.api_body, {})
        if sync.api_method == 'POST':
            hdrs.setdefault('Content-Type', 'application/json')
            raw_body = _json.dumps(body_params).encode('utf-8')
            req = _req.Request(sync.api_url, data=raw_body, headers=hdrs, method='POST')
        else:
            qs = _parse.urlencode(body_params)
            url = f"{sync.api_url}?{qs}" if qs else sync.api_url
            req = _req.Request(url, headers=hdrs, method='GET')

        with _req.urlopen(req, timeout=120) as resp:
            raw = resp.read()
        data = _json.loads(raw)

        # Navigate to items array via items_path
        if sync.items_path:
            for key in (k for k in sync.items_path.split('.') if k):
                data = data[key]

        # Auto-detect array in common response wrappers
        if isinstance(data, dict):
            for key in ('data', 'results', 'items', 'products', 'records', 'styles'):
                if key in data and isinstance(data[key], list):
                    data = data[key]
                    break
            else:
                for v in data.values():
                    if isinstance(v, list):
                        data = v
                        break

        if not isinstance(data, list):
            raise ValueError(f"Expected list, got {type(data).__name__}: {str(data)[:200]}")

        mapping = _parse_json(sync.field_mapping, {})
        # Cache subcategory groups to avoid repeated DB lookups per item
        subcategory_cache: dict = {}
        created = updated = skipped = 0

        def _get_nested(item: dict, key: str):
            """Access nested fields using dot-notation: 'color.name', 'img.0'"""
            val = item
            for part in key.split('.'):
                if isinstance(val, dict):
                    val = val.get(part)
                elif isinstance(val, list):
                    try:
                        val = val[int(part)]
                    except (IndexError, ValueError, TypeError):
                        return None
                else:
                    return None
                if val is None:
                    return None
            return val

        for item in data:
            if not isinstance(item, dict):
                continue
            row = {}
            extra_groups: list = []  # subcategories to assign this item to
            variant_data: dict = {}  # fields for MaterialVariant
            lookup_sku = None  # if set, resolve Material via existing MaterialVariant instead of by code

            for ext_key, int_key in mapping.items():
                val = _get_nested(item, ext_key)
                if val is None or val == '':
                    continue

                # Special __lookup_variant_sku directive: resolve parent Material via an existing
                # MaterialVariant SKU instead of creating a new Material keyed by this value.
                # Needed when the external API's row-level ID is variant-specific (color/size),
                # not the base product code (e.g. MACMA price/stock feeds).
                if int_key == '__lookup_variant_sku':
                    lookup_sku = str(val).strip()
                    continue

                # Special __category directive: create/find subcategory
                if int_key in ('__category', '__category_first'):
                    raw_cat = str(val).strip()
                    # __category_first: use only the first pipe-separated part
                    cat_name = (raw_cat.split('|')[0].strip() if int_key == '__category_first' else raw_cat)[:100]
                    if cat_name:
                        if cat_name not in subcategory_cache:
                            cat_group, _ = MaterialGroup.objects.get_or_create(
                                name=cat_name,
                                defaults={'is_active': True, 'parent': sync.material_group,
                                          'description': f'Auto: {sync.material_group.name}'},
                            )
                            if not cat_group.parent_id:
                                cat_group.parent = sync.material_group
                                cat_group.save(update_fields=['parent'])
                            subcategory_cache[cat_name] = cat_group
                        extra_groups.append(subcategory_cache[cat_name])
                    continue

                # Special __variant_* directive: store fields for MaterialVariant
                if isinstance(int_key, str) and int_key.startswith('__variant_'):
                    variant_data[int_key[len('__variant_'):]] = str(val).strip()
                    continue

                # Support list targets: {"price": ["unit_cost_price", "__variant_price"]}
                targets = int_key if isinstance(int_key, list) else ([int_key] if int_key in MATERIAL_FIELDS else None)
                if not targets:
                    continue
                for target in targets:
                    # __variant_* inside a list target
                    if isinstance(target, str) and target.startswith('__variant_'):
                        variant_data[target[len('__variant_'):]] = str(val).strip()
                        continue
                    if target not in MATERIAL_FIELDS:
                        continue
                    v = val
                    if target in NUMERIC_FIELDS:
                        try:
                            v = float(str(v).replace(',', '.').strip())
                        except (ValueError, TypeError):
                            continue
                    else:
                        v = str(v).strip()[:200] if isinstance(v, str) else v
                    row[target] = v

            if not row.get('name') and not row.get('code') and not lookup_sku:
                skipped += 1
                continue

            # Truncate code to 50 chars (CharField max_length)
            code = str(row.get('code', '')).strip()[:50]
            defaults = {k: v for k, v in row.items() if k != 'code'}
            defaults.setdefault('unit', 'db')
            defaults.setdefault('currency', 'HUF')

            # Apply markup: selling price = cost price × (1 + markup / 100)
            markup = float(sync.default_markup_percentage or 0)
            if markup > 0 and 'unit_cost_price' in defaults:
                defaults['unit_selling_price'] = round(float(defaults['unit_cost_price']) * (1 + markup / 100), 2)

            # Link default supplier
            if sync.default_supplier_id:
                defaults['default_supplier_id'] = sync.default_supplier_id

            if lookup_sku:
                # Row identifier is variant-level (e.g. MACMA price/stock feed) — resolve the
                # correct base Material via an existing MaterialVariant SKU instead of creating
                # a duplicate Material keyed by the variant id.
                from apps.warehouse.models import MaterialVariant
                existing_variant = MaterialVariant.objects.filter(sku=lookup_sku[:100]).select_related('material').first()
                if not existing_variant:
                    skipped += 1
                    continue
                mat = existing_variant.material
                if defaults:
                    for k, v in defaults.items():
                        setattr(mat, k, v)
                    mat.is_product = True
                    mat.save()
                updated += 1
                variant_data.setdefault('sku', lookup_sku)
            elif code:
                mat, is_new = Material.objects.get_or_create(
                    code=code,
                    defaults={**defaults, 'is_material': False, 'is_product': True},
                )
                if not is_new:
                    for k, v in defaults.items():
                        setattr(mat, k, v)
                    mat.is_product = True
                    mat.save()
                    updated += 1
                else:
                    created += 1
            else:
                # No code — create without uniqueness check
                row.pop('code', None)
                mat = Material.objects.create(
                    **defaults, is_material=False, is_product=True,
                    code=f"EXT-{sync.id}-{created + updated}"
                )
                created += 1

            # Create MaterialVariant if __variant_* fields were mapped
            if variant_data.get('sku') and mat:
                from apps.warehouse.models import MaterialVariant
                MaterialVariant.objects.update_or_create(
                    material=mat,
                    sku=variant_data['sku'][:100],
                    defaults={
                        'color': variant_data.get('color', '')[:100],
                        'color_hex': variant_data.get('color_hex', '')[:20],
                        'size': variant_data.get('size', '')[:50],
                        'stock_quantity': int(variant_data.get('stock_quantity', 0) or 0),
                        'stock_supplier': int(variant_data.get('stock_supplier', 0) or 0),
                        'price': float(variant_data['price']) if variant_data.get('price') else None,
                        'currency': variant_data.get('currency', 'HUF')[:3],
                    }
                )

            mat.material_groups.add(sync.material_group)
            # Also add to any subcategories derived from __category mapping
            for grp in extra_groups:
                mat.material_groups.add(grp)
            # Sync primary FK to the most-specific group (subcategory if available)
            primary = extra_groups[0] if extra_groups else sync.material_group
            if not mat.material_group_id:
                mat.material_group = primary
                mat.save(update_fields=['material_group'])

            # Create/update MaterialSupplier and MaterialCostItem when supplier + cost price are set
            if sync.default_supplier_id and mat.unit_cost_price:
                cost_price = float(mat.unit_cost_price)
                currency = mat.currency or 'HUF'
                markup = float(sync.default_markup_percentage or 0)
                selling = round(cost_price * (1 + markup / 100), 2)
                VERSION = 'API szinkron'

                MaterialSupplier.objects.update_or_create(
                    material=mat,
                    supplier_id=sync.default_supplier_id,
                    defaults={
                        'unit_price': cost_price,
                        'currency': currency,
                        'is_primary': True,
                        'is_active': True,
                    }
                )
                MaterialCostItem.objects.update_or_create(
                    material=mat,
                    supplier_id=sync.default_supplier_id,
                    price_calculation_version=VERSION,
                    defaults={
                        'name': 'Anyagköltség',
                        'calculation_type': 'unit',
                        'unit': mat.unit or 'db',
                        'unit_price': cost_price,
                        'price_quantity': 1,
                        'markup_percentage': markup,
                        'selling_price': selling,
                        'currency': currency,
                        'is_internal': False,
                    }
                )
                # Set selling price and point to the calculation version
                mat.unit_selling_price = selling
                mat.price_source_mode = 'default_version'
                mat.default_price_calculation_version = VERSION
                mat.save(update_fields=['unit_selling_price', 'price_source_mode', 'default_price_calculation_version'])

        # Aggregate variant stock → MaterialStock in the external warehouse
        # Always create/update an EXT entry for API-synced materials (even qty=0),
        # so they are consistently tracked as "external warehouse" products.
        if subcategory_cache is not None:  # always true, used as flag that variant loop ran
            from apps.warehouse.models import MaterialStock, MaterialVariant
            from django.db.models import Sum as _Sum
            ext_wh = Warehouse.objects.filter(code='EXT').first()
            if ext_wh:
                agg = (MaterialVariant.objects
                       .filter(material__material_groups=sync.material_group)
                       .values('material_id')
                       .annotate(total=_Sum('stock_quantity')))
                for row in agg:
                    mat_id = row['material_id']
                    qty = row['total'] or 0
                    mat_obj = Material.objects.filter(id=mat_id).first()
                    if not mat_obj:
                        continue
                    MaterialStock.objects.update_or_create(
                        material=mat_obj, warehouse=ext_wh,
                        defaults={
                            'quantity': qty, 'currency': mat_obj.currency or 'HUF',
                            'unit_value': float(mat_obj.unit_cost_price or 0),
                            'total_value': float(mat_obj.unit_cost_price or 0) * qty,
                        }
                    )

        sync.last_synced_at = timezone.now()
        sync.last_sync_status = 'ok'
        sync.last_sync_count = created + updated
        sync.last_sync_message = (
            f"Létrehozva: {created}, Frissítve: {updated}, Kihagyva: {skipped}"
            + (f", Alkategóriák: {len(subcategory_cache)}" if subcategory_cache else "")
        )
        sync.save()

    except Exception as e:
        from django.utils import timezone as _tz
        sync.last_synced_at = _tz.now()
        sync.last_sync_status = 'error'
        sync.last_sync_message = str(e)[:500]
        sync.save()
        raise


class MaterialVariantViewSet(viewsets.ReadOnlyModelViewSet):
    """Termék variánsok (szín/méret/készlet) — csak olvasás."""
    from rest_framework.permissions import IsAuthenticated as _IA
    permission_classes = [_IA]
    serializer_class = MaterialGroupApiSyncSerializer  # placeholder — overridden below

    def get_serializer_class(self):
        from rest_framework import serializers as rs
        from apps.warehouse.models import MaterialVariant as MV

        class VariantSer(rs.ModelSerializer):
            class Meta:
                model = MV
                fields = ['sku', 'color', 'color_hex', 'size', 'stock_quantity',
                          'stock_supplier', 'price', 'currency', 'updated_at']
        return VariantSer

    def get_queryset(self):
        from apps.warehouse.models import MaterialVariant
        qs = MaterialVariant.objects.all()
        mat = self.request.query_params.get('material')
        if mat:
            qs = qs.filter(material_id=mat)
        color = self.request.query_params.get('color')
        if color:
            qs = qs.filter(color=color)
        return qs.order_by('color', 'size')


class MaterialBarcodeViewSet(viewsets.ModelViewSet):
    """Termékekhez rendelt vonalkódok/QR kódok kezelése.

    A create() kezeli az ütközést: ha a kód már más termékhez van rendelve,
    409-et ad vissza a másik termék adataival, kivéve ha a kliens `transfer=true`
    paramétert küld, ekkor a kódot átveszi az új termékhez.
    """
    from rest_framework.permissions import IsAuthenticated as _IA
    permission_classes = [_IA]
    queryset = MaterialBarcode.objects.select_related('material').all()
    serializer_class = MaterialBarcodeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        material_id = self.request.query_params.get('material')
        if material_id:
            qs = qs.filter(material_id=material_id)
        code = self.request.query_params.get('code')
        if code:
            qs = qs.filter(code=code.strip())
        return qs

    def create(self, request, *args, **kwargs):
        material_id = request.data.get('material')
        code = str(request.data.get('code') or '').strip()
        transfer = str(request.data.get('transfer', '')).lower() in ('1', 'true', 'yes')

        if not material_id or not code:
            return Response({'error': 'A termék és a kód megadása kötelező.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            material = Material.objects.get(pk=material_id)
        except Material.DoesNotExist:
            return Response({'error': 'Termék nem található.'}, status=status.HTTP_404_NOT_FOUND)

        existing = MaterialBarcode.objects.select_related('material').filter(code=code).first()
        if existing:
            if existing.material_id == material.id:
                return Response({'error': 'Ez a kód már fel van véve ehhez a termékhez.'}, status=status.HTTP_400_BAD_REQUEST)
            if not transfer:
                return Response({
                    'conflict': True,
                    'code': code,
                    'existing_material_id': existing.material_id,
                    'existing_material_name': existing.material.name,
                    'existing_material_code': existing.material.code,
                }, status=status.HTTP_409_CONFLICT)
            existing.material = material
            existing.save(update_fields=['material'])
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

        barcode = MaterialBarcode.objects.create(
            material=material, code=code,
            created_by=request.user if request.user.is_authenticated else None,
        )
        return Response(self.get_serializer(barcode).data, status=status.HTTP_201_CREATED)


class MaterialGroupApiSyncViewSet(viewsets.ModelViewSet):
    """API szinkron konfigurációk kezelése."""
    from rest_framework.permissions import IsAuthenticated as _IA
    permission_classes = [_IA]
    serializer_class = MaterialGroupApiSyncSerializer

    def get_queryset(self):
        qs = MaterialGroupApiSync.objects.all()
        group = self.request.query_params.get('material_group')
        if group:
            qs = qs.filter(material_group_id=group)
        return qs.order_by('material_group', 'name')

    @action(detail=True, methods=['post'], url_path='run')
    def run_sync(self, request, pk=None):
        """Azonnali szinkronizáció futtatása."""
        sync = self.get_object()
        _do_sync(sync)
        sync.refresh_from_db()
        if sync.last_sync_status == 'ok':
            return Response({'ok': True, 'message': sync.last_sync_message, 'count': sync.last_sync_count})
        return Response({'ok': False, 'error': sync.last_sync_message}, status=400)


class PublicProductVariantsView(generics.GenericAPIView):
    """Publikus variáns lekérés — szín/méret/készlet kombinációk."""
    from rest_framework.permissions import AllowAny as _AA
    permission_classes = [_AA]

    def get(self, request, slug, material_id):
        from apps.warehouse.models import MaterialVariant, MaterialStock
        from django.db.models import Sum
        group = MaterialGroup.objects.filter(public_slug=slug, is_active=True).first()
        if not group:
            return Response({'error': 'Nem található'}, status=404)
        variants = list(MaterialVariant.objects.filter(
            material_id=material_id,
            material__material_groups=group,
        ).values('sku', 'color', 'color_hex', 'size', 'stock_quantity', 'stock_supplier', 'price', 'currency'))
        # Internal stock: sum from non-external warehouses
        internal = (MaterialStock.objects
                    .filter(material_id=material_id)
                    .exclude(warehouse__code='EXT')
                    .aggregate(total=Sum('quantity'))['total'] or 0)
        return Response({'variants': variants, 'internal_stock': float(internal)})


class PublicProductCatalogView(generics.ListAPIView):
    from rest_framework.permissions import AllowAny as _AA
    permission_classes = [_AA]
    serializer_class = PublicMaterialSerializer

    def get_queryset(self):
        slug = self.kwargs.get('slug')
        group = MaterialGroup.objects.filter(public_slug=slug, is_active=True).first()
        if not group:
            return Material.objects.none()
        # All materials in this group or its M2M
        return Material.objects.filter(
            Q(material_group=group) | Q(material_groups=group),
            is_active=True, is_product=True,
        ).distinct().prefetch_related('material_groups', 'variants')

    def list(self, request, *args, **kwargs):
        slug = self.kwargs.get('slug')
        group = MaterialGroup.objects.filter(public_slug=slug, is_active=True).first()
        if not group:
            return Response({'error': 'Nem található'}, status=404)
        qs = self.get_queryset()
        # Single product lookup by ID
        product_id = request.query_params.get('id')
        if product_id:
            try:
                mat = Material.objects.filter(
                    Q(material_group=group) | Q(material_groups=group),
                    id=int(product_id),
                    is_active=True
                ).prefetch_related('material_groups', 'variants').first()
                if not mat:
                    return Response({'error': 'Termék nem található'}, status=404)
                serializer = self.get_serializer(mat, context={'request': request})
                return Response({'product': serializer.data})
            except (ValueError, TypeError):
                pass

        # Optional subcategory filter
        cat_id = request.query_params.get('cat')
        if cat_id:
            try:
                sub = MaterialGroup.objects.get(id=int(cat_id))
                qs = qs.filter(Q(material_group=sub) | Q(material_groups=sub)).distinct()
            except (ValueError, MaterialGroup.DoesNotExist):
                pass
        # Search
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search) | Q(description__icontains=search))
        # Ordering
        ordering = request.query_params.get('ordering', 'name')
        ALLOWED_ORDERINGS = {'name', '-name', 'unit_selling_price', '-unit_selling_price'}
        if ordering not in ALLOWED_ORDERINGS:
            ordering = 'name'
        qs = qs.order_by(ordering)
        # Pagination
        page_size = min(int(request.query_params.get('page_size', 48)), 200)
        page = max(int(request.query_params.get('page', 1)), 1)
        total = qs.count()
        qs_page = qs[(page - 1) * page_size: page * page_size]
        serializer = self.get_serializer(qs_page, many=True, context={'request': request})
        # Subcategories for filter UI — include a representative product image
        subcats_raw = MaterialGroup.objects.filter(parent=group, is_active=True).order_by('name')
        subcats = []
        for sc in subcats_raw:
            img = (
                Material.objects.filter(
                    Q(material_group=sc) | Q(material_groups=sc),
                    image_url__gt='', is_active=True
                ).values_list('image_url', flat=True).first()
            )
            # Build full URL for relative image paths (UTTEAM CDN)
            if img and not img.startswith('http'):
                img = f"https://utteam.com/utt_img/product_images/640/{img.lstrip('/')}"
            subcats.append({'id': sc.id, 'name': sc.name, 'image_url': img or None})
        return Response({
            'id': group.id,
            'name': group.name,
            'title': group.public_title or group.name,
            'description': group.public_description or '',
            'show_prices': group.show_prices,
            'slug': group.public_slug,
            'total': total,
            'page': page,
            'page_size': page_size,
            'subcategories': subcats,
            'products': serializer.data,
        })


class PublicShopIndexView(generics.GenericAPIView):
    """Lists all top-level public shop categories (e.g. 'ruha', 'reklámajándék') for the /shop/ landing page."""
    from rest_framework.permissions import AllowAny as _AA
    permission_classes = [_AA]

    def get(self, request, *args, **kwargs):
        groups = (MaterialGroup.objects
                  .filter(is_active=True, parent__isnull=True)
                  .exclude(public_slug__isnull=True).exclude(public_slug='')
                  .order_by('name'))
        results = []
        for g in groups:
            img = (
                Material.objects.filter(
                    Q(material_group=g) | Q(material_groups=g),
                    image_url__gt='', is_active=True
                ).values_list('image_url', flat=True).first()
            )
            if img and not img.startswith('http'):
                img = f"https://utteam.com/utt_img/product_images/640/{img.lstrip('/')}"
            count = Material.objects.filter(
                Q(material_group=g) | Q(material_groups=g),
                is_active=True, is_product=True,
            ).distinct().count()
            results.append({
                'slug': g.public_slug,
                'title': g.public_title or g.name,
                'description': g.public_description or '',
                'image_url': img or None,
                'product_count': count,
            })
        return Response({'categories': results})
