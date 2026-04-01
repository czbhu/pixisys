from decimal import Decimal, ROUND_HALF_UP
import os
import re
import subprocess
import tempfile
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from .models import PrintSizePreset, PrintPricingConfig, PrintOrder, PrintOrderItem, PrintMaterial
from .serializers import (
    PrintSizePresetSerializer, PrintPricingConfigSerializer,
    PrintOrderSerializer, PrintOrderListSerializer, PrintOrderItemSerializer,
    PrintMaterialSerializer,
)


def _calculate_price(width_mm, height_mm, quantity, sides, side1_mode, side2_mode,
                     binding, folding_count, config, selected_service_ids=None):
    """Árkalkuláció — visszaad egy részletes breakdown dict-et."""
    from apps.manufacturing.models import Service
    w = Decimal(str(width_mm))
    h = Decimal(str(height_mm))
    qty = Decimal(str(max(quantity, 1)))

    # Papírköltség
    area_m2 = (w / 1000) * (h / 1000)
    paper_cost = area_m2 * config.paper_cost_per_m2 * qty

    # Nyomtatási költség
    mode_costs = {
        'color': config.print_color_cost,
        'bw': config.print_bw_cost,
        'color_white': config.print_color_white_cost,
        'white': config.print_color_white_cost,  # fehér festék = color_white-tal azonos
        'none': Decimal('0'),
    }
    print_cost_s1 = mode_costs.get(side1_mode, Decimal('0')) * qty
    print_cost_s2 = (mode_costs.get(side2_mode, Decimal('0')) * qty
                     if sides == '2' else Decimal('0'))
    print_cost = print_cost_s1 + print_cost_s2

    # Kötészeti költség
    if binding == 'fold':
        finishing_cost = (config.cutting_cost
                          + config.folding_cost_per_fold * Decimal(str(max(folding_count, 0))))
    else:
        finishing_cost = config.cutting_cost

    # Szolgáltatás költség
    service_cost = Decimal('0')
    service_breakdown = []
    if selected_service_ids:
        from apps.manufacturing.models import ServiceCostItem
        services = Service.objects.filter(id__in=selected_service_ids).prefetch_related(
            'cost_items'
        )
        for svc in services:
            ptype = svc.pricing_type or 'per_sheet'
            cap = Decimal(str(svc.capacity or 1)) if svc.capacity else Decimal('1')
            svc_total = Decimal('0')
            standalone_items = [ci for ci in svc.cost_items.all()
                                 if not ci.supplier_id and not ci.is_internal and ci.is_active]
            if standalone_items:
                # New cost-item based calculation
                for ci in standalone_items:
                    price = Decimal(str(ci.selling_price or 0))
                    if ci.calculation_type == 'fixed':
                        svc_total += price
                    else:  # 'unit' or anything else → per-unit
                        if ptype == 'per_job':
                            svc_total += price
                        elif ptype == 'per_cut':
                            cuts = (qty / cap).to_integral_value(rounding='ROUND_CEILING') if cap > 0 else qty
                            svc_total += price * cuts
                        else:  # per_sheet
                            svc_total += price * qty
            else:
                # Fallback: legacy flat fields
                setup = Decimal(str(svc.setup_cost_selling or 0))
                unit_c = Decimal(str(svc.unit_cost_selling or 0))
                if ptype == 'per_job':
                    svc_total = setup + unit_c
                elif ptype == 'per_cut':
                    cuts = (qty / cap).to_integral_value(rounding='ROUND_CEILING') if cap > 0 else qty
                    svc_total = setup + unit_c * cuts
                else:  # per_sheet
                    svc_total = setup + unit_c * qty
            service_cost += svc_total
            service_breakdown.append({
                'id': svc.id,
                'name': svc.name,
                'pricing_type': ptype,
                'total': float(svc_total.quantize(Decimal('0.01'))),
            })

    subtotal = paper_cost + print_cost + finishing_cost + service_cost
    margin_mult = Decimal('1') + config.margin_pct / 100
    total = (subtotal * margin_mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    unit_price = (total / qty).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

    return {
        'paper_cost': float(paper_cost.quantize(Decimal('0.01'))),
        'print_cost_side1': float(print_cost_s1.quantize(Decimal('0.01'))),
        'print_cost_side2': float(print_cost_s2.quantize(Decimal('0.01'))),
        'finishing_cost': float(finishing_cost.quantize(Decimal('0.01'))),
        'service_cost': float(service_cost.quantize(Decimal('0.01'))),
        'service_breakdown': service_breakdown,
        'subtotal': float(subtotal.quantize(Decimal('0.01'))),
        'margin_pct': float(config.margin_pct),
        'total': float(total),
        'unit_price': float(unit_price),
        'quantity': int(qty),
    }


class PrintSizePresetViewSet(viewsets.ModelViewSet):
    serializer_class = PrintSizePresetSerializer
    pagination_class = None

    def get_queryset(self):
        return PrintSizePreset.objects.filter(is_active=True).order_by('sort_order', 'name')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        from rest_framework.permissions import IsAdminUser
        return [IsAdminUser()]


class PrintMaterialViewSet(viewsets.ModelViewSet):
    serializer_class = PrintMaterialSerializer
    pagination_class = None

    def get_queryset(self):
        return PrintMaterial.objects.filter(is_active=True).order_by('sort_order', 'name')

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        from rest_framework.permissions import IsAdminUser
        return [IsAdminUser()]


class PrintPricingConfigViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        config = PrintPricingConfig.get_config()
        return Response(PrintPricingConfigSerializer(config).data)

    def create(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        config = PrintPricingConfig.get_config()
        serializer = PrintPricingConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PrintOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = PrintOrder.objects.select_related(
            'company', 'contact', 'created_by'
        ).prefetch_related('items')
        if user.is_staff:
            return qs.all()
        return qs.filter(created_by=user)

    def get_serializer_class(self):
        if self.action == 'list':
            return PrintOrderListSerializer
        return PrintOrderSerializer

    def perform_create(self, serializer):
        if not self.request.user.is_staff:
            serializer.save(created_by=self.request.user, company=None, contact=None)
        else:
            serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='calculate-price')
    def calculate_price(self, request):
        """Valós idejű árkalkuláció."""
        d = request.data
        try:
            config = PrintPricingConfig.get_config()
            breakdown = _calculate_price(
                width_mm=float(d.get('width_mm', 85)),
                height_mm=float(d.get('height_mm', 54)),
                quantity=int(d.get('quantity', 100)),
                sides=str(d.get('sides', '1')),
                side1_mode=str(d.get('side1_mode', 'color')),
                side2_mode=str(d.get('side2_mode', 'none')),
                binding=str(d.get('binding', 'cut')),
                folding_count=int(d.get('folding_count', 0)),
                config=config,
                selected_service_ids=d.get('selected_service_ids') or [],
            )
            return Response(breakdown)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'], url_path='calculate-price-click')
    def calculate_price_click(self, request):
        """Klikkdíjas íves nyomtatás árkalkuláció – részletes breakdown."""
        import math as _math
        from decimal import Decimal, ROUND_HALF_UP
        from apps.manufacturing.models import Service

        d = request.data
        try:
            width_mm       = float(d.get('width_mm', 85))
            height_mm      = float(d.get('height_mm', 54))
            quantity       = max(1, int(d.get('quantity', 100)))
            sheet_count    = max(1, int(d.get('sheet_count', 1)))  # lapok száma (multi-page product)
            print_sides    = max(0, min(2, int(d.get('print_sides', 1))))
            print_service_id_1 = d.get('print_service_id_1') or d.get('print_service_id')
            print_service_id_2 = d.get('print_service_id_2') if print_sides == 2 else None
            sheet_w_mm     = float(d.get('sheet_w_mm', 330))
            sheet_h_mm     = float(d.get('sheet_h_mm', 487))
            bleed_mm       = float(d.get('bleed_mm', 3))
            margin_pct     = Decimal(str(d.get('margin_pct', 0)))
            extra_svc_ids  = d.get('selected_service_ids') or []
            material_id    = d.get('material_id')
            force_rotate   = d.get('force_rotate')   # None=auto, True=force rotated, False=force normal
            fix_cost_first_side_only = bool(d.get('fix_cost_first_side_only', False))
            cutting_mode   = d.get('cutting_mode', 'auto')  # auto | material | print

            # ── Material dimensions (for cutting) ────────────────────────────
            mat_w_mm = None
            mat_h_mm = None
            if material_id:
                try:
                    from apps.warehouse.models import Material as WarehouseMaterial
                    _mat = WarehouseMaterial.objects.get(id=material_id)
                    _dim_unit = _mat.dimension_unit or 'mm'
                    _mult = {'mm': 1, 'cm': 10, 'm': 1000}.get(_dim_unit, 1)
                    if _mat.width:
                        mat_w_mm = float(_mat.width) * _mult
                    if _mat.length:
                        mat_h_mm = float(_mat.length) * _mult
                except Exception:
                    pass

            # ── Service max dimensions ────────────────────────────────────────
            svc_max_w = None
            svc_max_h = None
            if print_service_id_1:
                try:
                    _svc = Service.objects.get(id=print_service_id_1)
                    if _svc.max_width_mm:
                        svc_max_w = float(_svc.max_width_mm)
                    if _svc.max_height_mm:
                        svc_max_h = float(_svc.max_height_mm)
                except Service.DoesNotExist:
                    pass

            # ── Cutting optimization ──────────────────────────────────────────
            # When material is larger than the printer max, determines:
            #   - print sheet size (always ≤ printer max)
            #   - how many print sheets fit per raw material
            #   - how many raw material sheets needed
            needs_cutting = False
            effective_cutting_mode = cutting_mode  # actual mode used (for auto)

            if mat_w_mm and mat_h_mm and svc_max_w and svc_max_h:
                material_exceeds = mat_w_mm > svc_max_w or mat_h_mm > svc_max_h

                if material_exceeds:
                    needs_cutting = True
                    # Print sheet is always capped at printer maximum
                    sheet_w_mm = min(mat_w_mm, svc_max_w)
                    sheet_h_mm = min(mat_h_mm, svc_max_h)

                    if cutting_mode == 'material':
                        effective_cutting_mode = 'material'
                    elif cutting_mode == 'print':
                        effective_cutting_mode = 'print'
                    else:
                        # AUTO: heuristic — 'print' mode wastes less when cuts divide evenly
                        effective_cutting_mode = 'print'

            # How many print sheets fit from one raw material sheet
            mat_sheets_per_raw = 1
            if needs_cutting and mat_w_mm and mat_h_mm:
                # Normal orientation
                sx_n = max(1, int(mat_w_mm / sheet_w_mm))
                sy_n = max(1, int(mat_h_mm / sheet_h_mm))
                # Rotated cut
                sx_r = max(1, int(mat_w_mm / sheet_h_mm))
                sy_r = max(1, int(mat_h_mm / sheet_w_mm))
                mat_sheets_per_raw = max(sx_n * sy_n, sx_r * sy_r)

            # ── Impozíció ────────────────────────────────────────────────────
            prod_w = width_mm + 2 * bleed_mm
            prod_h = height_mm + 2 * bleed_mm
            fit_w_normal  = max(1, int(sheet_w_mm / prod_w))
            fit_h_normal  = max(1, int(sheet_h_mm / prod_h))
            fit_w_rotated = max(1, int(sheet_w_mm / prod_h))
            fit_h_rotated = max(1, int(sheet_h_mm / prod_w))
            auto_rotated = fit_w_rotated * fit_h_rotated > fit_w_normal * fit_h_normal
            if force_rotate is None:
                rotated = auto_rotated
            else:
                rotated = bool(force_rotate)
            if rotated:
                fit_w, fit_h = fit_w_rotated, fit_h_rotated
            else:
                fit_w, fit_h = fit_w_normal, fit_h_normal
            items_per_sheet = fit_w * fit_h
            # Ha több lapból áll a termék, az összes lapot ki kell nyomtatni:
            # pl. 100 db × 2 lap = 200 nyomtatandó elem
            total_pieces    = quantity * sheet_count
            sheets_needed   = _math.ceil(total_pieces / items_per_sheet)
            if print_sides == 2 and sheets_needed % 2 != 0:
                sheets_needed += 1
            clicks_total = sheets_needed * print_sides

            # ── Production layout: full sheets vs partial sheet ───────────────
            total_slots = sheets_needed * items_per_sheet
            remaining_on_last = total_pieces % items_per_sheet  # 0 means full
            if remaining_on_last == 0:
                full_sheets = sheets_needed
                partial_sheet_items = 0
            else:
                full_sheets = sheets_needed - 1
                partial_sheet_items = remaining_on_last
            partial_coverage_pct = round(partial_sheet_items / items_per_sheet * 100, 1) if partial_sheet_items > 0 else 0
            waste_items = total_slots - total_pieces  # unused slots

            # ── Cutting info ──────────────────────────────────────────────────
            if needs_cutting and mat_w_mm and mat_h_mm:
                raw_sheets_needed = _math.ceil(sheets_needed / mat_sheets_per_raw)
                cutting_info = {
                    'needs_cutting': True,
                    'cutting_mode': effective_cutting_mode,
                    'material_size_mm': [round(mat_w_mm, 1), round(mat_h_mm, 1)],
                    'cut_sheet_size_mm': [round(sheet_w_mm, 1), round(sheet_h_mm, 1)],
                    'cut_sheets_per_material': mat_sheets_per_raw,
                    'raw_material_sheets_needed': raw_sheets_needed,
                    'total_cut_sheets': sheets_needed,
                }
            else:
                cutting_info = {
                    'needs_cutting': False,
                    'cutting_mode': cutting_mode,
                    'material_size_mm': [round(mat_w_mm, 1), round(mat_h_mm, 1)] if mat_w_mm and mat_h_mm else None,
                    'cut_sheet_size_mm': [round(sheet_w_mm, 1), round(sheet_h_mm, 1)],
                    'cut_sheets_per_material': 1,
                    'raw_material_sheets_needed': sheets_needed,
                    'total_cut_sheets': sheets_needed,
                }

            # ── Helper: build detailed cost breakdown for one Service ─────────
            def _build_service_cost(svc, unit_count, sheet_count):
                """
                Returns (total: Decimal, items: list[dict]).
                Uses ServiceCostItem records linked to a supplier or internal production.
                If svc.calculation_unit is 'click' or 'sheet' → 'unit' items are per-sheet (Ív alapú).
                """
                is_sheet_based = svc.calculation_unit in ('click', 'sheet')
                cap = Decimal(str(svc.capacity or 1)) if svc.capacity else Decimal('1')
                ptype = svc.pricing_type or 'per_sheet'

                # Use supplier-linked or internal cost items (not standalone)
                cost_items = [
                    ci for ci in svc.cost_items.all()
                    if ci.is_active
                    and ci.calculation_type not in ('length', 'perimeter', 'area', 'weight', 'time')
                    and (ci.supplier_id or ci.is_internal)
                ]

                total = Decimal('0')
                items = []

                if cost_items:
                    for ci in cost_items:
                        price = Decimal(str(ci.selling_price or 0))
                        cost_unit = Decimal(str(ci.unit_price or 0))
                        ctype = ci.calculation_type
                        sup = {
                            'supplier_id': ci.supplier_id,
                            'supplier_name': ci.supplier.name if ci.supplier_id else None,
                            'is_internal': ci.is_internal,
                            'cost_price_per': float(cost_unit),
                            'markup_percentage': float(ci.markup_percentage or 0),
                            'department_id': svc.internal_production_department_id if ci.is_internal else None,
                        }
                        if ctype == 'fixed':
                            amt = price
                            items.append({
                                'name': ci.name,
                                'type': 'fixed',
                                'price_per': float(price),
                                'units': 1,
                                'total': float(amt.quantize(Decimal('0.01'))),
                                **sup,
                            })
                        elif ctype == 'click':
                            # always per sheet
                            amt = price * Decimal(str(sheet_count))
                            items.append({
                                'name': ci.name,
                                'type': 'click',
                                'price_per': float(price),
                                'units': sheet_count,
                                'total': float(amt.quantize(Decimal('0.01'))),
                                **sup,
                            })
                        elif ctype == 'unit':
                            if is_sheet_based:
                                # Ív alapú: darab alapú elemek ívszám alapján számolnak
                                units = sheet_count
                                item_type = 'click'
                            elif ptype == 'per_job':
                                units = 1
                                item_type = 'unit'
                            elif ptype == 'per_cut':
                                units = int(_math.ceil(unit_count / float(cap))) if float(cap) > 0 else unit_count
                                item_type = 'unit'
                            else:
                                units = unit_count
                                item_type = 'unit'
                            amt = price * Decimal(str(units))
                            items.append({
                                'name': ci.name,
                                'type': item_type,
                                'price_per': float(price),
                                'units': units,
                                'total': float(amt.quantize(Decimal('0.01'))),
                                **sup,
                            })
                        total += amt
                else:
                    # Fallback to service-level setup/unit fields
                    s_setup = Decimal(str(svc.setup_cost_selling or 0))
                    unit_c  = Decimal(str(svc.unit_cost_selling or 0))
                    if s_setup:
                        items.append({'name': 'Beállítási díj', 'type': 'fixed', 'price_per': float(s_setup), 'units': 1, 'total': float(s_setup.quantize(Decimal('0.01')))})
                        total += s_setup
                    if unit_c:
                        if is_sheet_based:
                            units = sheet_count
                            fallback_type = 'click'
                        elif ptype == 'per_job':
                            units = 1
                            fallback_type = 'unit'
                        elif ptype == 'per_cut':
                            units = int(_math.ceil(unit_count / float(cap))) if float(cap) > 0 else unit_count
                            fallback_type = 'unit'
                        else:
                            units = unit_count
                            fallback_type = 'unit'
                        amt = unit_c * Decimal(str(units))
                        items.append({'name': 'Egységköltség', 'type': fallback_type, 'price_per': float(unit_c), 'units': units, 'total': float(amt.quantize(Decimal('0.01')))})
                        total += amt
                return total, items

            # ── Nyomtatási szolgáltatás (print_sides > 0) ────────────────────
            print_service_name_1 = None
            print_service_name_2 = None
            print_service_items_1 = []
            print_service_items_2 = []
            print_cost_side1 = Decimal('0')
            print_cost_side2 = Decimal('0')

            if print_sides > 0:
                if print_service_id_1:
                    try:
                        svc1 = Service.objects.prefetch_related('cost_items').get(id=print_service_id_1)
                        print_service_name_1 = svc1.name
                        c, items = _build_service_cost(svc1, quantity, sheets_needed)
                        print_cost_side1 = c
                        print_service_items_1 = items
                    except Service.DoesNotExist:
                        pass

                if print_sides == 2:
                    if print_service_id_2 and str(print_service_id_2) != str(print_service_id_1):
                        try:
                            svc2 = Service.objects.prefetch_related('cost_items').get(id=print_service_id_2)
                            print_service_name_2 = svc2.name
                            c, items = _build_service_cost(svc2, quantity, sheets_needed)
                            if fix_cost_first_side_only:
                                # Remove fixed cost items from side 2
                                items = [i for i in items if i['type'] != 'fixed']
                                c = sum(Decimal(str(i['total'])) for i in items)
                            print_cost_side2 = c
                            print_service_items_2 = items
                        except Service.DoesNotExist:
                            pass
                    elif print_service_id_1:
                        # Same service for both sides
                        print_service_name_2 = print_service_name_1
                        for ci_item in print_service_items_1:
                            if ci_item['type'] == 'click':
                                amt = Decimal(str(ci_item['price_per'])) * Decimal(str(sheets_needed))
                                print_cost_side2 += amt
                                print_service_items_2.append({**ci_item, 'total': float(amt.quantize(Decimal('0.01')))})
                            elif ci_item['type'] == 'fixed' and not fix_cost_first_side_only:
                                amt = Decimal(str(ci_item['total']))
                                print_cost_side2 += amt
                                print_service_items_2.append({**ci_item})

            print_cost = print_cost_side1 + print_cost_side2

            # ── Alapanyag költség ─────────────────────────────────────────────
            material_cost = Decimal('0')
            material_name = None
            material_items = []
            size_comparison = []
            if material_id:
                try:
                    from apps.warehouse.models import Material as WarehouseMaterial
                    mat = WarehouseMaterial.objects.get(id=material_id)
                    material_name = mat.name
                    # Use material's own selling price per unit (ív)
                    price_per_sheet = Decimal(str(mat.unit_selling_price or 0))
                    if price_per_sheet <= 0:
                        # Fallback: estimate from area_weight or global config
                        from .models import PrintPricingConfig
                        config = PrintPricingConfig.get_config()
                        sheet_area_m2 = (sheet_w_mm / 1000) * (sheet_h_mm / 1000)
                        price_per_sheet = Decimal(str(config.paper_cost_per_m2)) * Decimal(str(sheet_area_m2))
                    material_cost = (price_per_sheet * Decimal(str(sheets_needed))).quantize(Decimal('0.01'))
                    mat_sup_id = mat.default_supplier_id if hasattr(mat, 'default_supplier_id') else None
                    mat_sup_name = mat.default_supplier.name if mat_sup_id and mat.default_supplier else None
                    mat_cost_per = Decimal(str(mat.unit_cost_price or 0))
                    mat_markup = float(mat.markup_percentage or 0)
                    material_items = [{
                        'name': mat.name,
                        'type': 'click',
                        'price_per': float(price_per_sheet.quantize(Decimal('0.01'))),
                        'units': sheets_needed,
                        'total': float(material_cost),
                        'supplier_id': mat_sup_id,
                        'supplier_name': mat_sup_name,
                        'cost_price_per': float(mat_cost_per.quantize(Decimal('0.01'))),
                        'markup_percentage': mat_markup,
                        'is_internal': False,
                    }]

                    # ── Size comparison ────────────────────────────────────
                    def _calc_size_cost(sz_w_mm, sz_h_mm, sz_price, sz_label):
                        """Calculate material cost for a given size variant."""
                        _sw, _sh = sheet_w_mm, sheet_h_mm
                        _needs_cut = False
                        _mat_per_raw = 1

                        if svc_max_w and svc_max_h:
                            if sz_w_mm > svc_max_w or sz_h_mm > svc_max_h:
                                _needs_cut = True
                                _sw = min(sz_w_mm, svc_max_w)
                                _sh = min(sz_h_mm, svc_max_h)
                            else:
                                _sw = min(sz_w_mm, svc_max_w)
                                _sh = min(sz_h_mm, svc_max_h)

                        if _needs_cut:
                            sx_n = max(1, int(sz_w_mm / _sw))
                            sy_n = max(1, int(sz_h_mm / _sh))
                            sx_r = max(1, int(sz_w_mm / _sh))
                            sy_r = max(1, int(sz_h_mm / _sw))
                            _mat_per_raw = max(sx_n * sy_n, sx_r * sy_r)

                        # Imposition on this sheet
                        _fw_n = max(1, int(_sw / prod_w))
                        _fh_n = max(1, int(_sh / prod_h))
                        _fw_r = max(1, int(_sw / prod_h))
                        _fh_r = max(1, int(_sh / prod_w))
                        _ips = max(_fw_n * _fh_n, _fw_r * _fh_r)
                        if _ips == 0:
                            return None
                        _sheets = _math.ceil(quantity / _ips)
                        if print_sides == 2 and _sheets % 2 != 0:
                            _sheets += 1
                        _raw_needed = _math.ceil(_sheets / _mat_per_raw) if _needs_cut else _sheets

                        _price = Decimal(str(sz_price or 0))
                        _mat_cost = (_price * Decimal(str(_raw_needed))).quantize(Decimal('0.01'))
                        return {
                            'label': sz_label,
                            'size_mm': [round(sz_w_mm, 1), round(sz_h_mm, 1)],
                            'price_per_sheet': float(_price),
                            'sheets_needed': _raw_needed,
                            'items_per_sheet': _ips,
                            'material_cost': float(_mat_cost),
                            'needs_cutting': _needs_cut,
                        }

                    # Default size entry
                    if mat_w_mm and mat_h_mm:
                        default_entry = _calc_size_cost(mat_w_mm, mat_h_mm, price_per_sheet, 'Alapméret')
                        if default_entry:
                            default_entry['is_default'] = True
                            size_comparison.append(default_entry)

                    # Orderable sizes
                    from apps.warehouse.models import MaterialSize
                    _dim_mult = {'mm': 1, 'cm': 10, 'm': 1000}
                    for ms in MaterialSize.objects.filter(material=mat, is_active=True).order_by('sort_order'):
                        _m = _dim_mult.get(ms.dimension_unit, 1)
                        _w = float(ms.width) * _m
                        _l = float(ms.length) * _m
                        _p = float(ms.effective_price or 0)
                        _lbl = ms.name or f'{round(_w)}×{round(_l)} mm'
                        entry = _calc_size_cost(_w, _l, _p, _lbl)
                        if entry:
                            entry['is_default'] = False
                            entry['size_id'] = ms.id
                            size_comparison.append(entry)

                    # Sort by material cost, mark the best
                    if size_comparison:
                        size_comparison.sort(key=lambda x: x['material_cost'])
                        size_comparison[0]['is_best'] = True

                except Exception:
                    pass

            # ── Szolgáltatások (részletes, kategorizálva) ────────────────────
            from collections import Counter
            service_cost      = Decimal('0')
            service_breakdown = []
            all_counted_ids   = set()

            # 1) Kötelező szolgáltatások
            required_svc_ids = d.get('required_service_ids') or []
            if required_svc_ids:
                unique_required = list(dict.fromkeys(int(sid) for sid in required_svc_ids))
                req_svcs = Service.objects.filter(id__in=unique_required).prefetch_related('cost_items')
                req_map = {s.id: s for s in req_svcs}
                for sid in unique_required:
                    rsvc = req_map.get(sid)
                    if not rsvc:
                        continue
                    svc_total, svc_items = _build_service_cost(rsvc, quantity, sheets_needed)
                    service_cost += svc_total
                    all_counted_ids.add(rsvc.id)
                    service_breakdown.append({
                        'id':       rsvc.id,
                        'name':     rsvc.name,
                        'sides':    1,
                        'total':    float(svc_total.quantize(Decimal('0.01'))),
                        'items':    svc_items,
                        'category': 'required',
                    })

            # 2) Oldalankénti szolgáltatások
            if extra_svc_ids:
                svc_side_counts = Counter(extra_svc_ids)
                unique_svc_ids = list(svc_side_counts.keys())
                svcs = Service.objects.filter(id__in=unique_svc_ids).prefetch_related('cost_items')
                svc_map = {s.id: s for s in svcs}
                for sid in unique_svc_ids:
                    esvc = svc_map.get(sid)
                    if not esvc:
                        continue
                    sides_count = svc_side_counts[sid]
                    svc_total, svc_items = _build_service_cost(esvc, quantity, sheets_needed)
                    svc_total_all = svc_total * sides_count
                    if sides_count > 1:
                        for item in svc_items:
                            item['units'] = item['units'] * sides_count
                            item['total'] = round(item['total'] * sides_count, 2)
                    service_cost += svc_total_all
                    all_counted_ids.add(esvc.id)
                    service_breakdown.append({
                        'id':       esvc.id,
                        'name':     esvc.name,
                        'sides':    sides_count,
                        'total':    float(svc_total_all.quantize(Decimal('0.01'))),
                        'items':    svc_items,
                        'category': 'side',
                    })

            # 3) Kész termékre vonatkozó szolgáltatások
            finishing_svc_ids = d.get('finishing_service_ids') or []
            if finishing_svc_ids:
                unique_finishing = [int(sid) for sid in finishing_svc_ids if int(sid) not in all_counted_ids]
                if unique_finishing:
                    fin_svcs = Service.objects.filter(id__in=unique_finishing).prefetch_related('cost_items')
                    fin_map = {s.id: s for s in fin_svcs}
                    for sid in unique_finishing:
                        fsvc = fin_map.get(sid)
                        if not fsvc:
                            continue
                        svc_total, svc_items = _build_service_cost(fsvc, quantity, sheets_needed)
                        service_cost += svc_total
                        service_breakdown.append({
                            'id':       fsvc.id,
                            'name':     fsvc.name,
                            'sides':    1,
                            'total':    float(svc_total.quantize(Decimal('0.01'))),
                            'items':    svc_items,
                            'category': 'finishing',
                        })

            # ── Összesítés ───────────────────────────────────────────────────
            subtotal    = print_cost + material_cost + service_cost
            margin_mult = Decimal('1') + margin_pct / 100
            total       = (subtotal * margin_mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            unit_price  = (total / Decimal(str(quantity))).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

            return Response({
                # impozíció
                'items_per_sheet':    items_per_sheet,
                'fit_w':              fit_w,
                'fit_h':              fit_h,
                'rotated':            rotated,
                'sheets_needed':      sheets_needed,
                'clicks_total':       clicks_total,
                'print_sides':        print_sides,
                # production layout
                'full_sheets':            full_sheets,
                'partial_sheet_items':    partial_sheet_items,
                'partial_coverage_pct':   partial_coverage_pct,
                'waste_items':            waste_items,
                'sheet_w_mm':             round(sheet_w_mm, 1),
                'sheet_h_mm':             round(sheet_h_mm, 1),
                # cutting
                'cutting_info':           cutting_info,
                # nyomtatási kt.
                'print_service_name_1':   print_service_name_1,
                'print_service_name_2':   print_service_name_2,
                'print_service_items_1':  print_service_items_1,
                'print_service_items_2':  print_service_items_2,
                'print_cost_side1':   float(print_cost_side1.quantize(Decimal('0.01'))),
                'print_cost_side2':   float(print_cost_side2.quantize(Decimal('0.01'))),
                'print_cost':         float(print_cost.quantize(Decimal('0.01'))),
                # alapanyag
                'material_cost':      float(material_cost),
                'material_name':      material_name,
                'material_items':     material_items,
                'size_comparison':    size_comparison,
                # extra szolg.
                'service_cost':       float(service_cost.quantize(Decimal('0.01'))),
                'service_breakdown':  service_breakdown,
                # végösszeg
                'subtotal':           float(subtotal.quantize(Decimal('0.01'))),
                'margin_pct':         float(margin_pct),
                'total':              float(total),
                'unit_price':         float(unit_price),
                'quantity':           quantity,
                'sheet_count':        sheet_count,
                'total_pieces':       total_pieces,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'], url_path='save-design',
            parser_classes=[JSONParser])
    def save_design(self, request, pk=None):
        """Tervezés mentése (canvas JSON -> order item)."""
        order = self.get_object()
        item_id = request.data.get('item_id')
        design_side1 = request.data.get('design_json_side1')
        design_side2 = request.data.get('design_json_side2')

        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        if design_side1 is not None:
            item.design_json_side1 = design_side1
        if design_side2 is not None:
            item.design_json_side2 = design_side2
        item.save(update_fields=['design_json_side1', 'design_json_side2'])
        return Response({'ok': True})

    @action(detail=True, methods=['post'], url_path='set-lock',
            parser_classes=[JSONParser])
    def set_lock(self, request, pk=None):
        """Admin zárolja / feloldja a szerkesztőt vagy a preview-t."""
        if not request.user.is_staff:
            return Response({'error': 'Nincs jogosultság'}, status=403)
        order = self.get_object()
        item_id = request.data.get('item_id')
        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        from django.utils import timezone
        if 'editor_locked' in request.data:
            item.editor_locked = bool(request.data['editor_locked'])
        if 'preview_locked' in request.data:
            item.preview_locked = bool(request.data['preview_locked'])

        if item.editor_locked or item.preview_locked:
            item.locked_by = request.user
            item.locked_at = timezone.now()
        else:
            item.locked_by = None
            item.locked_at = None

        item.save(update_fields=['editor_locked', 'preview_locked', 'locked_by', 'locked_at'])
        return Response({
            'editor_locked': item.editor_locked,
            'preview_locked': item.preview_locked,
        })

    @action(detail=True, methods=['post'], url_path='generate-pdf',
            parser_classes=[JSONParser])
    def generate_pdf(self, request, pk=None):
        """Nyomdakész PDF generálás."""
        order = self.get_object()
        item_id = request.data.get('item_id')
        try:
            item = order.items.get(pk=item_id)
        except PrintOrderItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=404)

        try:
            from .pdf_generator import generate_print_pdf
            pdf_url = generate_print_pdf(item)
            return Response({'pdf_url': pdf_url})
        except Exception as e:
            return Response({'error': f'PDF generálási hiba: {str(e)}'}, status=500)


class PdfToSvgView(APIView):
    """
    PDF oldal → SVG konverzió pdftocairo segítségével.
    POST multipart: pdf (file), page (int, default 1)
    Visszaad: { svg: "<svg ...>...</svg>", width_mm, height_mm, page_count }
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        page = int(request.data.get('page', 1))

        # Ellenőrzés
        if pdf_file.size > 50 * 1024 * 1024:  # 50 MB limit
            return Response({'error': 'A fájl túl nagy (max 50 MB)'}, status=400)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            svg_path = os.path.join(tmpdir, 'output.svg')

            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            # Oldalszám lekérése
            try:
                info = subprocess.run(
                    ['pdfinfo', pdf_path],
                    capture_output=True, text=True, timeout=10
                )
                page_count = 1
                for line in info.stdout.splitlines():
                    if line.startswith('Pages:'):
                        page_count = int(line.split(':')[1].strip())
                        break
            except Exception:
                page_count = 1

            page = max(1, min(page, page_count))

            # PDF → SVG
            try:
                result = subprocess.run(
                    [
                        'pdftocairo', '-svg',
                        '-f', str(page), '-l', str(page),
                        pdf_path, svg_path,
                    ],
                    capture_output=True, timeout=30
                )
                if result.returncode != 0:
                    return Response(
                        {'error': 'Konverziós hiba: ' + result.stderr.decode('utf-8', errors='replace')},
                        status=500
                    )
            except FileNotFoundError:
                return Response({'error': 'pdftocairo nem elérhető a szerveren'}, status=500)
            except subprocess.TimeoutExpired:
                return Response({'error': 'Konverzió időtúllépés'}, status=500)

            # Az SVG kimenete: output-N.svg alakban (N = oldalszám)
            svg_candidate = os.path.join(tmpdir, f'output-{page}.svg')
            if not os.path.exists(svg_candidate):
                # egyoldalas esetén output.svg is lehet
                svg_candidate = svg_path if os.path.exists(svg_path) else None
            if not svg_candidate:
                return Response({'error': 'SVG kimenet nem található'}, status=500)

            with open(svg_candidate, 'r', encoding='utf-8') as f:
                svg_content = f.read()

            # Méret kinyerése az SVG-ből (width/height attribútum)
            import re
            width_pt = height_pt = None
            m = re.search(r'<svg[^>]*\bwidth=["\']([0-9.]+)["\']', svg_content)
            if m:
                width_pt = float(m.group(1))
            m = re.search(r'<svg[^>]*\bheight=["\']([0-9.]+)["\']', svg_content)
            if m:
                height_pt = float(m.group(1))

            # pt → mm (1 pt = 25.4/72 mm)
            width_mm = round(width_pt * 25.4 / 72, 1) if width_pt else None
            height_mm = round(height_pt * 25.4 / 72, 1) if height_pt else None

            return Response({
                'svg': svg_content,
                'width_mm': width_mm,
                'height_mm': height_mm,
                'page_count': page_count,
                'page': page,
            })


class PdfAnalyzeView(APIView):
    """
    PDF elemzés PyMuPDF-fel: TrimBox + színrendszerek oldalanként.
    POST multipart: pdf (file)
    Visszaad: { pages: [ { page, mediabox_mm, trimbox_mm, color_spaces } ] }
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    PT_TO_MM = 25.4 / 72

    def post(self, request):
        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        if pdf_file.size > 50 * 1024 * 1024:
            return Response({'error': 'A fájl túl nagy (max 50 MB)'}, status=400)

        try:
            import fitz  # PyMuPDF
        except ImportError:
            return Response({'error': 'PyMuPDF (fitz) nincs telepítve a szerveren'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            try:
                doc = fitz.open(pdf_path)
            except Exception as e:
                return Response({'error': f'PDF megnyitási hiba: {str(e)}'}, status=400)

            pages_info = []
            doc_colors = set()
            for page_num in range(doc.page_count):
                page = doc[page_num]
                mb = page.mediabox  # Rect(x0, y0, x1, y1)

                mediabox_mm = {
                    'width': round(mb.width * self.PT_TO_MM, 1),
                    'height': round(mb.height * self.PT_TO_MM, 1),
                }

                # TrimBox extraction
                trimbox_mm = None
                trimbox_pt = None
                try:
                    tb = page.trimbox
                    if tb and (tb.width > 0 and tb.height > 0):
                        # Only report TrimBox if it differs from MediaBox
                        if (abs(tb.width - mb.width) > 0.5 or abs(tb.height - mb.height) > 0.5
                                or abs(tb.x0 - mb.x0) > 0.5 or abs(tb.y0 - mb.y0) > 0.5):
                            trimbox_mm = {
                                'x': round((tb.x0 - mb.x0) * self.PT_TO_MM, 1),
                                'y': round((mb.y1 - tb.y1) * self.PT_TO_MM, 1),
                                'width': round(tb.width * self.PT_TO_MM, 1),
                                'height': round(tb.height * self.PT_TO_MM, 1),
                            }
                            trimbox_pt = {
                                'x': round(tb.x0 - mb.x0, 2),
                                'y': round(mb.y1 - tb.y1, 2),
                                'w': round(tb.width, 2),
                                'h': round(tb.height, 2),
                            }
                except Exception:
                    pass

                # Color space detection from page content
                color_spaces = set()
                try:
                    page_text = page.get_text("rawdict")
                    # Check images for color spaces
                    for img in page.get_images(full=True):
                        xref = img[0]
                        try:
                            pix = fitz.Pixmap(doc, xref)
                            if pix.colorspace:
                                if pix.colorspace.n == 4:
                                    color_spaces.add("CMYK")
                                elif pix.colorspace.n == 3:
                                    color_spaces.add("RGB")
                                elif pix.colorspace.n == 1:
                                    color_spaces.add("Gray")
                            pix = None
                        except Exception:
                            pass
                except Exception:
                    pass

                # Page-level color detection is done via the detailed content stream
                # tokenizer below (not crude pattern matching)

                # Check page resources for color space definitions
                # Build a map of CS resource names → resolved colorspace type
                cs_resolved = {}  # e.g. {"CS0": "RGB", "CS1": "CMYK", "CS5": "Spot"}
                try:
                    res_xref = page.xref
                    res_text = doc.xref_object(res_xref)
                    if res_text:
                        if "/DeviceCMYK" in res_text:
                            color_spaces.add("CMYK")
                        if "/DeviceRGB" in res_text:
                            color_spaces.add("RGB")
                        if "/DeviceGray" in res_text:
                            color_spaces.add("Gray")
                        if "/Separation" in res_text:
                            color_spaces.add("Spot")
                        if re.search(r'(?i)pantone', res_text):
                            color_spaces.add("PANTONE")
                except Exception:
                    pass

                # Scan page-level xrefs for Separation/Pantone (NOT global)
                # This is done per-page through the resource dict scanning below

                # ── Extract page elements (images, text blocks, drawings) ──
                elements = []
                mb_w = mb.width
                mb_h = mb.height

                # Collect page-level spot color info by scanning xref objects
                spot_cs_names = set()
                spot_color_names = {}  # cs_resource_name -> actual spot color name
                _dbg_file = open("/home/ceze/pixisys/pixierp/logs/xobj_debug.log", "a")
                _dbg_file.write(f"\n=== NEW PDF SCAN page {page.number} ===\n")
                _dbg_file.flush()

                def _pdf_name_decode(name):
                    """Decode PDF hex-encoded name: #20 -> space, etc."""
                    return re.sub(r'#([0-9A-Fa-f]{2})', lambda m: chr(int(m.group(1), 16)), name)

                def _resolve_icc(obj_text):
                    """Resolve ICCBased colorspace to RGB/CMYK/Gray by checking /N."""
                    icc_match = re.search(r'/ICCBased\s+(\d+)\s+0\s+R', obj_text)
                    if icc_match:
                        try:
                            icc_obj = doc.xref_object(int(icc_match.group(1)))
                            if icc_obj:
                                n_match = re.search(r'/N\s+(\d+)', icc_obj)
                                if n_match:
                                    n = int(n_match.group(1))
                                    if n == 4: return "CMYK"
                                    elif n == 3: return "RGB"
                                    elif n == 1: return "Gray"
                        except Exception:
                            pass
                    return None

                # Special PDF Separation names that are NOT actual spot colors
                _SPECIAL_SEPARATION_NAMES = {'All', 'None'}

                def _scan_cs_entry(cs_res_name, cs_xref):
                    """Check if a colorspace xref is Separation/DeviceN/Pantone/ICCBased."""
                    try:
                        cs_obj = doc.xref_object(cs_xref)
                        _dbg_file.write(f"_scan_cs_entry({cs_res_name}, xref={cs_xref}): obj={cs_obj[:300] if cs_obj else 'None'}\n")
                        _dbg_file.flush()
                        if not cs_obj:
                            return
                        if "/Separation" in cs_obj or "/DeviceN" in cs_obj:
                            m = re.search(r'/Separation\s*/([^/\s\[\]]+)', cs_obj)
                            sep_name = _pdf_name_decode(m.group(1)) if m else None
                            # Skip special PDF separation names (All = all inks, None = invisible)
                            if sep_name and sep_name in _SPECIAL_SEPARATION_NAMES:
                                # Resolve alternate space instead
                                icc_cs = _resolve_icc(cs_obj)
                                if icc_cs:
                                    cs_resolved[cs_res_name] = icc_cs
                                elif '/DeviceCMYK' in cs_obj:
                                    cs_resolved[cs_res_name] = 'CMYK'
                                elif '/DeviceRGB' in cs_obj:
                                    cs_resolved[cs_res_name] = 'RGB'
                                elif '/DeviceGray' in cs_obj:
                                    cs_resolved[cs_res_name] = 'Gray'
                                return
                            spot_cs_names.add(cs_res_name)
                            cs_resolved[cs_res_name] = "Spot"
                            if sep_name:
                                spot_color_names[cs_res_name] = sep_name
                        if re.search(r'(?i)pantone', cs_obj):
                            spot_cs_names.add(cs_res_name)
                            cs_resolved[cs_res_name] = "Spot"
                            m = re.search(r'(PANTONE[^/\]\)]+)', cs_obj, re.IGNORECASE)
                            if m:
                                spot_color_names[cs_res_name] = _pdf_name_decode(m.group(1).strip())
                        # Resolve ICCBased profiles
                        if cs_res_name not in cs_resolved:
                            icc_cs = _resolve_icc(cs_obj)
                            if icc_cs:
                                cs_resolved[cs_res_name] = icc_cs
                            elif "/DeviceCMYK" in cs_obj:
                                cs_resolved[cs_res_name] = "CMYK"
                            elif "/DeviceRGB" in cs_obj:
                                cs_resolved[cs_res_name] = "RGB"
                            elif "/DeviceGray" in cs_obj:
                                cs_resolved[cs_res_name] = "Gray"
                            elif "/CalRGB" in cs_obj:
                                cs_resolved[cs_res_name] = "RGB"
                            elif "/CalGray" in cs_obj:
                                cs_resolved[cs_res_name] = "Gray"
                    except Exception:
                        pass

                def _scan_cs_dict(cs_dict_text):
                    """Parse a ColorSpace dict text for spot entries."""
                    for cs_entry in re.finditer(r'/(\S+)\s+(\d+)\s+0\s+R', cs_dict_text):
                        _scan_cs_entry(cs_entry.group(1), int(cs_entry.group(2)))
                    # Also handle inline arrays: /CS0 [ /Separation ... ]
                    for cs_entry in re.finditer(r'/(\S+)\s*\[\s*/Separation', cs_dict_text):
                        cs_res_name = cs_entry.group(1)
                        spot_cs_names.add(cs_res_name)
                        m = re.search(r'/Separation\s*/([^/\s\[\]]+)', cs_dict_text[cs_entry.start():])
                        if m:
                            spot_color_names[cs_res_name] = _pdf_name_decode(m.group(1))

                try:
                    page_obj = doc.xref_object(page.xref)

                    # Strategy 1: /Resources N 0 R (external reference)
                    res_match = re.search(r'/Resources\s+(\d+)\s+0\s+R', page_obj)
                    res_text = None
                    if res_match:
                        res_xref = int(res_match.group(1))
                        res_text = doc.xref_object(res_xref)
                    else:
                        # Inline resources in page object
                        res_text = page_obj

                    if res_text:
                        # Case A: /ColorSpace << /CS0 5 0 R ... >>
                        cs_block = re.search(r'/ColorSpace\s*<<([^>]*)>>', res_text)
                        if cs_block:
                            _scan_cs_dict(cs_block.group(1))
                        else:
                            # Case B: /ColorSpace N 0 R (indirect reference)
                            cs_ref = re.search(r'/ColorSpace\s+(\d+)\s+0\s+R', res_text)
                            if cs_ref:
                                cs_dict_xref = int(cs_ref.group(1))
                                cs_dict_text = doc.xref_object(cs_dict_xref)
                                if cs_dict_text:
                                    # It could be a dict: << /CS0 7 0 R >>
                                    inner = re.search(r'<<(.*)>>', cs_dict_text, re.DOTALL)
                                    if inner:
                                        _scan_cs_dict(inner.group(1))
                                    else:
                                        _scan_cs_dict(cs_dict_text)

                    # Fallback: scan all document xrefs for Separation
                    if not spot_cs_names and "Spot" in color_spaces:
                        for x in range(1, doc.xref_length()):
                            try:
                                obj_str = doc.xref_object(x)
                                if obj_str and ("/Separation" in obj_str or re.search(r'(?i)pantone', obj_str)):
                                    m = re.search(r'/Separation\s*/([^/\s\[\]]+)', obj_str)
                                    sep_n = _pdf_name_decode(m.group(1)) if m else None
                                    if sep_n and sep_n in _SPECIAL_SEPARATION_NAMES:
                                        continue
                                    spot_cs_names.add("_global")
                                    if sep_n:
                                        spot_color_names["_global"] = sep_n
                                    m2 = re.search(r'(PANTONE[^/\]\)]+)', obj_str, re.IGNORECASE)
                                    if m2:
                                        spot_color_names["_global"] = _pdf_name_decode(m2.group(1).strip())
                            except Exception:
                                pass
                except Exception:
                    pass
                _dbg_file.write(f"AFTER CS SCAN: spot_cs_names={spot_cs_names}, spot_color_names={spot_color_names}, cs_resolved={cs_resolved}\n")
                _dbg_file.flush()
                try:
                    for img in page.get_images(full=True):
                        xref = img[0]
                        # Check if image xref uses Separation/DeviceN/Pantone colorspace
                        is_spot = False
                        spot_name = None
                        img_cs_from_obj = None
                        try:
                            img_obj = doc.xref_object(xref)
                            if img_obj:
                                if "/Separation" in img_obj or "/DeviceN" in img_obj:
                                    m = re.search(r'/Separation\s*/([^/\s\[\]]+)', img_obj)
                                    sep_name = _pdf_name_decode(m.group(1)) if m else None
                                    if sep_name and sep_name in _SPECIAL_SEPARATION_NAMES:
                                        # Not a real spot color
                                        pass
                                    else:
                                        is_spot = True
                                        spot_name = sep_name
                                elif re.search(r'(?i)pantone', img_obj):
                                    is_spot = True
                                    m = re.search(r'(PANTONE[^/\]\)]+)', img_obj, re.IGNORECASE)
                                    if m:
                                        spot_name = _pdf_name_decode(m.group(1).strip())
                                # Check for ICCBased in the image's ColorSpace
                                icc_cs = _resolve_icc(img_obj)
                                if icc_cs:
                                    img_cs_from_obj = icc_cs
                                # Check for named CS reference: /ColorSpace /CS0
                                cs_name_match = re.search(r'/ColorSpace\s*/(\S+)', img_obj)
                                if cs_name_match:
                                    cs_n = cs_name_match.group(1)
                                    if cs_n in cs_resolved:
                                        img_cs_from_obj = cs_resolved[cs_n]
                                        if cs_resolved[cs_n] == "Spot":
                                            is_spot = True
                                            spot_name = spot_color_names.get(cs_n, spot_name)
                                    elif cs_n == "DeviceCMYK":
                                        img_cs_from_obj = "CMYK"
                                    elif cs_n == "DeviceRGB":
                                        img_cs_from_obj = "RGB"
                                    elif cs_n == "DeviceGray":
                                        img_cs_from_obj = "Gray"
                        except Exception:
                            pass
                        try:
                            # Use Pixmap for colorspace detection
                            pix = fitz.Pixmap(doc, xref)
                            if img_cs_from_obj:
                                # Prefer xref-resolved CS (Pixmap converts Separation → alternate)
                                el_cs = img_cs_from_obj
                            elif pix.colorspace:
                                if pix.colorspace.n == 4:
                                    el_cs = "CMYK"
                                elif pix.colorspace.n == 3:
                                    el_cs = "RGB"
                                elif pix.colorspace.n == 1:
                                    el_cs = "Gray"
                                else:
                                    el_cs = pix.colorspace.name
                            else:
                                el_cs = "Ismeretlen"
                            w_px = pix.width
                            h_px = pix.height
                            pix = None  # free memory
                        except Exception:
                            el_cs = "Ismeretlen"
                            w_px = 0
                            h_px = 0
                        # Find image bbox on page
                        rects = page.get_image_rects(xref)
                        for r in rects:
                            el_data = {
                                'type': 'image',
                                'x': round(r.x0 / mb_w, 4),
                                'y': round(r.y0 / mb_h, 4),
                                'w': round(r.width / mb_w, 4),
                                'h': round(r.height / mb_h, 4),
                                'colorspace': el_cs,
                                'width_px': w_px,
                                'height_px': h_px,
                            }
                            if is_spot:
                                el_data['spot'] = True
                                if spot_name:
                                    el_data['spot_name'] = spot_name
                            elements.append(el_data)
                except Exception:
                    pass

                # Text blocks
                try:
                    text_dict = page.get_text("dict", flags=0)
                    for block in text_dict.get("blocks", []):
                        if block.get("type") == 0:  # text block
                            # Emit per-line elements so different-color lines are separate
                            for line in block.get("lines", []):
                                lbbox = line.get("bbox", [0, 0, 0, 0])
                                font_color = None
                                font_name = ""
                                font_size = 0
                                text_content = ""
                                for span in line.get("spans", []):
                                    if not font_name:
                                        font_name = span.get("font", "")
                                        font_size = round(span.get("size", 0), 1)
                                        raw_color = span.get("color", 0)
                                        if isinstance(raw_color, int):
                                            r = (raw_color >> 16) & 0xFF
                                            g = (raw_color >> 8) & 0xFF
                                            b = raw_color & 0xFF
                                            font_color = f"#{r:02x}{g:02x}{b:02x}"
                                    text_content += span.get("text", "")
                                bw = lbbox[2] - lbbox[0]
                                bh = lbbox[3] - lbbox[1]
                                if bw > 0 and bh > 0 and text_content.strip():
                                    elements.append({
                                        'type': 'text',
                                        'x': round(lbbox[0] / mb_w, 4),
                                        'y': round(lbbox[1] / mb_h, 4),
                                        'w': round(bw / mb_w, 4),
                                        'h': round(bh / mb_h, 4),
                                        'font': font_name,
                                        'font_size': font_size,
                                        'color': font_color,
                                        'text': text_content[:100],
                                    })
                except Exception:
                    pass

                # Vector drawings
                try:
                    drawings = page.get_drawings()
                except Exception:
                    drawings = []

                # Parse content stream to build per-rect/text colorspace maps
                # (get_drawings() converts ALL colors to RGB, losing original CS)
                rect_cs_map = {}  # "x0,y0,x1,y1" -> (cs, is_spot, spot_name)
                text_cs_regions = []  # list of (y_top_down, cs, is_spot, spot_name) for ALL text renders
                page_height = mb_h
                used_cs_in_stream = set()  # collect all CS used in this page's stream

                def _ctm_concat(m, c):
                    """Multiply affine matrices m × c. Each is (a,b,c,d,e,f)."""
                    a1,b1,c1,d1,e1,f1 = m
                    a2,b2,c2,d2,e2,f2 = c
                    return (
                        a1*a2+b1*c2, a1*b2+b1*d2,
                        c1*a2+d1*c2, c1*b2+d1*d2,
                        e1*a2+f1*c2+e2, e1*b2+f1*d2+f2,
                    )

                def _ctm_apply(x, y, ct):
                    """Transform point (x,y) by CTM ct=(a,b,c,d,e,f)."""
                    a,b,c,d,e,f = ct
                    return (a*x+c*y+e, b*x+d*y+f)

                # Collect Form XObjects from page resources for recursive parsing
                form_xobjects = {}  # name -> (stream_bytes, matrix_tuple)
                import logging as _lg
                _dbg = _lg.getLogger("printshop.xobj_debug")
                def _dbgw(msg):
                    _dbg_file.write(msg + "\n")
                    _dbg_file.flush()
                try:
                    _page_obj = doc.xref_object(page.xref)
                    _dbgw(f"PAGE XREF OBJ (first 500): %s".replace("%s","{0}").replace("%d","{1}") if False else f"PAGE XREF OBJ (first 500): %s" % (_page_obj[:500],) if "%" in "PAGE XREF OBJ (first 500): %s" else f"PAGE XREF OBJ (first 500): %s {_page_obj[:500]}")
                    _res_match = re.search(r'/Resources\s+(\d+)\s+0\s+R', _page_obj)
                    if _res_match:
                        _res_text = doc.xref_object(int(_res_match.group(1)))
                        _dbgw(f"RESOURCES (indirect %s, first 500): %s".replace("%s","{0}").replace("%d","{1}") if False else f"RESOURCES (indirect %s, first 500): %s" % (_res_match.group(1), _res_text[:500] if _res_text else "None",) if "%" in "RESOURCES (indirect %s, first 500): %s" else f"RESOURCES (indirect %s, first 500): %s {_res_match.group(1), _res_text[:500] if _res_text else 'None'}")
                    else:
                        _res_text = _page_obj
                        _dbgw("RESOURCES (inline from page obj)")
                    if _res_text:
                        _xobj_block = re.search(r'/XObject\s*<<([^>]*)>>', _res_text)
                        _xobj_text = None
                        if _xobj_block:
                            _xobj_text = _xobj_block.group(1)
                            _dbgw(f"XOBJECT BLOCK (inline <<>>): %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJECT BLOCK (inline <<>>): %s" % (_xobj_text[:300],) if "%" in "XOBJECT BLOCK (inline <<>>): %s" else f"XOBJECT BLOCK (inline <<>>): %s {_xobj_text[:300]}")
                        else:
                            _xobj_ref = re.search(r'/XObject\s+(\d+)\s+0\s+R', _res_text)
                            if _xobj_ref:
                                _xd = doc.xref_object(int(_xobj_ref.group(1)))
                                _dbgw(f"XOBJECT DICT (indirect %s): %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJECT DICT (indirect %s): %s" % (_xobj_ref.group(1), _xd[:300] if _xd else "None",) if "%" in "XOBJECT DICT (indirect %s): %s" else f"XOBJECT DICT (indirect %s): %s {_xobj_ref.group(1), _xd[:300] if _xd else 'None'}")
                                if _xd:
                                    _inner = re.search(r'<<(.*)>>', _xd, re.DOTALL)
                                    _xobj_text = _inner.group(1) if _inner else _xd
                            else:
                                _dbgw("NO /XObject found in resources text")
                        if _xobj_text:
                            _dbgw(f"XOBJ_TEXT to scan: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJ_TEXT to scan: %s" % (_xobj_text[:300],) if "%" in "XOBJ_TEXT to scan: %s" else f"XOBJ_TEXT to scan: %s {_xobj_text[:300]}")
                            for _xm in re.finditer(r'/(\S+)\s+(\d+)\s+0\s+R', _xobj_text):
                                _xo_name = _xm.group(1)
                                _xo_xref = int(_xm.group(2))
                                _dbgw(f"Found XObject ref: /%s -> xref %d".replace("%s","{0}").replace("%d","{1}") if False else f"Found XObject ref: /%s -> xref %d" % (_xo_name, _xo_xref,) if "%" in "Found XObject ref: /%s -> xref %d" else f"Found XObject ref: /%s -> xref %d {_xo_name, _xo_xref}")
                                try:
                                    _xo_obj = doc.xref_object(_xo_xref)
                                    _dbgw(f"XObj %s obj (first 200): %s".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s obj (first 200): %s" % (_xo_name, _xo_obj[:200] if _xo_obj else "None",) if "%" in "XObj %s obj (first 200): %s" else f"XObj %s obj (first 200): %s {_xo_name, _xo_obj[:200] if _xo_obj else 'None'}")
                                    if _xo_obj and '/Subtype /Form' in _xo_obj:
                                        _xo_stream = doc.xref_stream(_xo_xref)
                                        _dbgw(f"XObj %s is Form, stream len=%d".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s is Form, stream len=%d" % (_xo_name, len(_xo_stream) if _xo_stream else 0,) if "%" in "XObj %s is Form, stream len=%d" else f"XObj %s is Form, stream len=%d {_xo_name, len(_xo_stream) if _xo_stream else 0}")
                                        if _xo_stream:
                                            _xo_matrix = (1, 0, 0, 1, 0, 0)
                                            _mm = re.search(r'/Matrix\s*\[\s*([\d.\-\s]+)\]', _xo_obj)
                                            if _mm:
                                                _vals = _mm.group(1).split()
                                                if len(_vals) == 6:
                                                    _xo_matrix = tuple(float(v) for v in _vals)
                                            form_xobjects[_xo_name] = (_xo_stream, _xo_matrix)
                                            # Scan XObject resources for additional spot CS
                                            _xo_res_block = re.search(r'/Resources\s*<<', _xo_obj)
                                            if _xo_res_block:
                                                _xo_cs_block = re.search(r'/ColorSpace\s*<<([^>]*)>>', _xo_obj[_xo_res_block.start():])
                                                if _xo_cs_block:
                                                    _dbgw(f"XObj %s has CS block: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s has CS block: %s" % (_xo_name, _xo_cs_block.group(1)[:200],) if "%" in "XObj %s has CS block: %s" else f"XObj %s has CS block: %s {_xo_name, _xo_cs_block.group(1)[:200]}")
                                                    for _cs_e in re.finditer(r'/(\S+)\s+(\d+)\s+0\s+R', _xo_cs_block.group(1)):
                                                        _scan_cs_entry(_cs_e.group(1), int(_cs_e.group(2)))
                                    else:
                                        _dbgw(f"XObj %s NOT Form (no /Subtype /Form)".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s NOT Form (no /Subtype /Form)" % (_xo_name,) if "%" in "XObj %s NOT Form (no /Subtype /Form)" else f"XObj %s NOT Form (no /Subtype /Form) {_xo_name}")
                                except Exception as _xe:
                                    _dbgw(f"XObj %s exception: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XObj %s exception: %s" % (_xo_name, _xe,) if "%" in "XObj %s exception: %s" else f"XObj %s exception: %s {_xo_name, _xe}")
                        else:
                            _dbgw("xobj_text is None/empty")
                    else:
                        _dbgw("res_text is None")
                except Exception as _ex:
                    _dbgw(f"Form XObject collection EXCEPTION: %s".replace("%s","{0}").replace("%d","{1}") if False else f"Form XObject collection EXCEPTION: %s" % (_ex,) if "%" in "Form XObject collection EXCEPTION: %s" else f"Form XObject collection EXCEPTION: %s {_ex}")
                _dbgw(f"FORM_XOBJECTS collected: %s".replace("%s","{0}").replace("%d","{1}") if False else f"FORM_XOBJECTS collected: %s" % (list(form_xobjects.keys()),) if "%" in "FORM_XOBJECTS collected: %s" else f"FORM_XOBJECTS collected: %s {list(form_xobjects.keys())}")

                do_calls = []  # (xo_name, ctm_at_call)

                def _parse_stream(stream_text, initial_ctm):
                    """Parse a PDF content stream, updating rect_cs_map, text_cs_regions, used_cs_in_stream."""
                    tokens = stream_text.split()
                    cur_fill_cs = None
                    cur_stroke_cs = None
                    cur_fill_spot = False
                    cur_stroke_spot = False
                    cur_fill_spot_name = None
                    cur_stroke_spot_name = None
                    path_rects = []
                    path_points = []
                    gs_stack = []
                    ctm = initial_ctm
                    text_tm = None
                    i = 0
                    while i < len(tokens):
                        tok = tokens[i]
                        if tok == 'q':
                            gs_stack.append((cur_fill_cs, cur_stroke_cs, cur_fill_spot, cur_stroke_spot, cur_fill_spot_name, cur_stroke_spot_name, ctm))
                        elif tok == 'Q':
                            if gs_stack:
                                cur_fill_cs, cur_stroke_cs, cur_fill_spot, cur_stroke_spot, cur_fill_spot_name, cur_stroke_spot_name, ctm = gs_stack.pop()
                            path_rects = []
                            path_points = []
                        elif tok == 'cm' and i >= 6:
                            try:
                                cm_a = float(tokens[i-6])
                                cm_b = float(tokens[i-5])
                                cm_c = float(tokens[i-4])
                                cm_d = float(tokens[i-3])
                                cm_e = float(tokens[i-2])
                                cm_f = float(tokens[i-1])
                                ctm = _ctm_concat((cm_a, cm_b, cm_c, cm_d, cm_e, cm_f), ctm)
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'k' and i >= 4:
                            cur_fill_cs = "CMYK"
                            cur_fill_spot = False
                            cur_fill_spot_name = None
                            used_cs_in_stream.add("CMYK")
                        elif tok == 'rg' and i >= 3:
                            cur_fill_cs = "RGB"
                            cur_fill_spot = False
                            cur_fill_spot_name = None
                            used_cs_in_stream.add("RGB")
                        elif tok == 'g' and i >= 1:
                            cur_fill_cs = "Gray"
                            cur_fill_spot = False
                            cur_fill_spot_name = None
                            used_cs_in_stream.add("Gray")
                        elif tok == 'K' and i >= 4:
                            cur_stroke_cs = "CMYK"
                            cur_stroke_spot = False
                            used_cs_in_stream.add("CMYK")
                        elif tok == 'RG' and i >= 3:
                            cur_stroke_cs = "RGB"
                            cur_stroke_spot = False
                            used_cs_in_stream.add("RGB")
                        elif tok == 'G' and i >= 1:
                            cur_stroke_cs = "Gray"
                            cur_stroke_spot = False
                            used_cs_in_stream.add("Gray")
                        elif tok == 'cs' and i >= 1 and tokens[i-1].startswith('/'):
                            cs_name = tokens[i-1][1:]
                            _dbg_file.write(f"CS operator: /{cs_name} cs -> in spot_cs_names={cs_name in spot_cs_names}, in cs_resolved={cs_resolved.get(cs_name, 'NOT_FOUND')}\n")
                            _dbg_file.flush()
                            if cs_name in spot_cs_names:
                                cur_fill_cs = "Spot"
                                cur_fill_spot = True
                                cur_fill_spot_name = spot_color_names.get(cs_name)
                                used_cs_in_stream.add("Spot")
                            elif cs_name in ('DeviceCMYK',):
                                cur_fill_cs = "CMYK"
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                                used_cs_in_stream.add("CMYK")
                            elif cs_name in ('DeviceRGB',):
                                cur_fill_cs = "RGB"
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                                used_cs_in_stream.add("RGB")
                            elif cs_name in ('DeviceGray',):
                                cur_fill_cs = "Gray"
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                                used_cs_in_stream.add("Gray")
                            elif cs_name in cs_resolved:
                                resolved = cs_resolved[cs_name]
                                cur_fill_cs = resolved
                                cur_fill_spot = resolved == "Spot"
                                cur_fill_spot_name = spot_color_names.get(cs_name) if cur_fill_spot else None
                                used_cs_in_stream.add(resolved)
                            else:
                                cur_fill_spot = False
                                cur_fill_spot_name = None
                        elif tok == 'CS' and i >= 1 and tokens[i-1].startswith('/'):
                            cs_name = tokens[i-1][1:]
                            if cs_name in spot_cs_names:
                                cur_stroke_cs = "Spot"
                                cur_stroke_spot = True
                                cur_stroke_spot_name = spot_color_names.get(cs_name)
                                used_cs_in_stream.add("Spot")
                            elif cs_name in ('DeviceCMYK',):
                                cur_stroke_cs = "CMYK"
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                                used_cs_in_stream.add("CMYK")
                            elif cs_name in ('DeviceRGB',):
                                cur_stroke_cs = "RGB"
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                                used_cs_in_stream.add("RGB")
                            elif cs_name in ('DeviceGray',):
                                cur_stroke_cs = "Gray"
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                                used_cs_in_stream.add("Gray")
                            elif cs_name in cs_resolved:
                                resolved = cs_resolved[cs_name]
                                cur_stroke_cs = resolved
                                cur_stroke_spot = resolved == "Spot"
                                cur_stroke_spot_name = spot_color_names.get(cs_name) if cur_stroke_spot else None
                                used_cs_in_stream.add(resolved)
                            else:
                                cur_stroke_spot = False
                                cur_stroke_spot_name = None
                        elif tok == 'scn':
                            pass
                        elif tok == 'SCN':
                            pass
                        elif tok == 'BT':
                            text_tm = (1, 0, 0, 1, 0, 0)
                        elif tok == 'ET':
                            text_tm = None
                        elif tok == 'Tm' and i >= 6:
                            try:
                                text_tm = (float(tokens[i-6]), float(tokens[i-5]),
                                           float(tokens[i-4]), float(tokens[i-3]),
                                           float(tokens[i-2]), float(tokens[i-1]))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'Td' and i >= 2:
                            try:
                                tx = float(tokens[i-2])
                                ty = float(tokens[i-1])
                                if text_tm:
                                    a, b, c, d = text_tm[0], text_tm[1], text_tm[2], text_tm[3]
                                    text_tm = (a, b, c, d,
                                               tx * a + ty * c + text_tm[4],
                                               tx * b + ty * d + text_tm[5])
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'TD' and i >= 2:
                            try:
                                tx = float(tokens[i-2])
                                ty = float(tokens[i-1])
                                if text_tm:
                                    a, b, c, d = text_tm[0], text_tm[1], text_tm[2], text_tm[3]
                                    text_tm = (a, b, c, d,
                                               tx * a + ty * c + text_tm[4],
                                               tx * b + ty * d + text_tm[5])
                            except (ValueError, IndexError):
                                pass
                        elif tok in ('Tj', 'TJ', "'", '"') or tok.endswith(']TJ') or tok.endswith(']Tj') or tok.endswith(')Tj') or tok.endswith(')TJ'):
                            if text_tm and cur_fill_cs:
                                tx, ty = _ctm_apply(text_tm[4], text_tm[5], ctm)
                                td_y = page_height - ty
                                text_cs_regions.append((td_y, cur_fill_cs, cur_fill_spot, cur_fill_spot_name))
                        # Do operator — record XObject call for recursive parsing
                        elif tok == 'Do' and i >= 1 and tokens[i-1].startswith('/'):
                            xo_name = tokens[i-1][1:]
                            if xo_name in form_xobjects:
                                do_calls.append((xo_name, ctm))
                        elif tok == 'm' and i >= 2:
                            try:
                                px = float(tokens[i-2])
                                py = float(tokens[i-1])
                                path_points = [_ctm_apply(px, py, ctm)]
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'l' and i >= 2:
                            try:
                                px = float(tokens[i-2])
                                py = float(tokens[i-1])
                                path_points.append(_ctm_apply(px, py, ctm))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 'c' and i >= 6:
                            try:
                                for ci in range(3):
                                    px = float(tokens[i-6+ci*2])
                                    py = float(tokens[i-5+ci*2])
                                    path_points.append(_ctm_apply(px, py, ctm))
                            except (ValueError, IndexError):
                                pass
                        elif tok == 're' and i >= 4:
                            try:
                                rx = float(tokens[i-4])
                                ry = float(tokens[i-3])
                                rw = float(tokens[i-2])
                                rh = float(tokens[i-1])
                                corners = [
                                    _ctm_apply(rx, ry, ctm),
                                    _ctm_apply(rx+rw, ry, ctm),
                                    _ctm_apply(rx+rw, ry+rh, ctm),
                                    _ctm_apply(rx, ry+rh, ctm),
                                ]
                                cxs = [c[0] for c in corners]
                                cys = [c[1] for c in corners]
                                bx0 = min(cxs)
                                by0 = min(cys)
                                bx1 = max(cxs)
                                by1 = max(cys)
                                td_x0 = bx0
                                td_y0 = page_height - by1
                                td_x1 = bx1
                                td_y1 = page_height - by0
                                path_rects.append((td_x0, td_y0, td_x1, td_y1))
                            except (ValueError, IndexError):
                                pass
                        elif tok in ('f', 'F', 'f*', 'B', 'B*', 'b', 'b*'):
                            if path_points and not path_rects:
                                xs = [p[0] for p in path_points]
                                ys = [p[1] for p in path_points]
                                bx0 = min(xs)
                                by0 = min(ys)
                                bx1 = max(xs)
                                by1 = max(ys)
                                td_x0 = bx0
                                td_y0 = page_height - by1
                                td_x1 = bx1
                                td_y1 = page_height - by0
                                path_rects.append((td_x0, td_y0, td_x1, td_y1))
                            for pr in path_rects:
                                key = f"{pr[0]:.1f},{pr[1]:.1f},{pr[2]:.1f},{pr[3]:.1f}"
                                rect_cs_map[key] = (cur_fill_cs or "Ismeretlen", cur_fill_spot, cur_fill_spot_name)
                            path_rects = []
                            path_points = []
                        elif tok in ('S', 's'):
                            if path_points and not path_rects:
                                xs = [p[0] for p in path_points]
                                ys = [p[1] for p in path_points]
                                bx0 = min(xs)
                                by0 = min(ys)
                                bx1 = max(xs)
                                by1 = max(ys)
                                td_x0 = bx0
                                td_y0 = page_height - by1
                                td_x1 = bx1
                                td_y1 = page_height - by0
                                path_rects.append((td_x0, td_y0, td_x1, td_y1))
                            for pr in path_rects:
                                key = f"{pr[0]:.1f},{pr[1]:.1f},{pr[2]:.1f},{pr[3]:.1f}"
                                rect_cs_map[key] = (cur_stroke_cs or "Ismeretlen", cur_stroke_spot, cur_stroke_spot_name)
                            path_rects = []
                            path_points = []
                        elif tok == 'n':
                            path_rects = []
                            path_points = []
                        i += 1

                # Parse page content streams
                try:
                    for c_xref in page.get_contents():
                        stream = doc.xref_stream(c_xref)
                        if not stream:
                            continue
                        _stream_text = stream.decode("latin-1", errors="replace")
                        _dbgw(f"PAGE STREAM xref=%d len=%d first200: %s".replace("%s","{0}").replace("%d","{1}") if False else f"PAGE STREAM xref=%d len=%d first200: %s" % (c_xref, len(_stream_text), _stream_text[:200],) if "%" in "PAGE STREAM xref=%d len=%d first200: %s" else f"PAGE STREAM xref=%d len=%d first200: %s {c_xref, len(_stream_text), _stream_text[:200]}")
                        _parse_stream(_stream_text, (1, 0, 0, 1, 0, 0))
                except Exception as _pex:
                    _dbgw(f"PAGE STREAM EXCEPTION: %s".replace("%s","{0}").replace("%d","{1}") if False else f"PAGE STREAM EXCEPTION: %s" % (_pex,) if "%" in "PAGE STREAM EXCEPTION: %s" else f"PAGE STREAM EXCEPTION: %s {_pex}")

                _dbgw(f"AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d".replace("%s","{0}").replace("%d","{1}") if False else f"AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d" % (len(do_calls), len(rect_cs_map), len(text_cs_regions),) if "%" in "AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d" else f"AFTER PAGE STREAMS: do_calls=%d, rect_cs_map=%d entries, text_cs_regions=%d {len(do_calls), len(rect_cs_map), len(text_cs_regions)}")
                for _dc_name, _dc_ctm in do_calls:
                    _dbgw(f"  DO CALL: %s ctm=%s".replace("%s","{0}").replace("%d","{1}") if False else f"  DO CALL: %s ctm=%s" % (_dc_name, _dc_ctm,) if "%" in "  DO CALL: %s ctm=%s" else f"  DO CALL: %s ctm=%s {_dc_name, _dc_ctm}")

                # Parse Form XObject streams (Illustrator renders spot content via XObjects)
                for _xo_name, _call_ctm in do_calls:
                    if _xo_name in form_xobjects:
                        try:
                            _xo_bytes, _xo_matrix = form_xobjects[_xo_name]
                            _composed_ctm = _ctm_concat(_xo_matrix, _call_ctm)
                            _xo_text = _xo_bytes.decode("latin-1", errors="replace")
                            _dbgw(f"PARSING XOBJ %s: stream_len=%d first200: %s".replace("%s","{0}").replace("%d","{1}") if False else f"PARSING XOBJ %s: stream_len=%d first200: %s" % (_xo_name, len(_xo_text), _xo_text[:200],) if "%" in "PARSING XOBJ %s: stream_len=%d first200: %s" else f"PARSING XOBJ %s: stream_len=%d first200: %s {_xo_name, len(_xo_text), _xo_text[:200]}")
                            _parse_stream(_xo_text, _composed_ctm)
                        except Exception as _xex:
                            _dbgw(f"XOBJ %s parse EXCEPTION: %s".replace("%s","{0}").replace("%d","{1}") if False else f"XOBJ %s parse EXCEPTION: %s" % (_xo_name, _xex,) if "%" in "XOBJ %s parse EXCEPTION: %s" else f"XOBJ %s parse EXCEPTION: %s {_xo_name, _xex}")

                _dbgw(f"FINAL: rect_cs_map=%d entries, text_cs_regions=%d".replace("%s","{0}").replace("%d","{1}") if False else f"FINAL: rect_cs_map=%d entries, text_cs_regions=%d" % (len(rect_cs_map), len(text_cs_regions),) if "%" in "FINAL: rect_cs_map=%d entries, text_cs_regions=%d" else f"FINAL: rect_cs_map=%d entries, text_cs_regions=%d {len(rect_cs_map), len(text_cs_regions)}")
                for _rk, _rv in list(rect_cs_map.items())[:20]:
                    _dbgw(f"  rect_cs_map[%s] = %s".replace("%s","{0}").replace("%d","{1}") if False else f"  rect_cs_map[%s] = %s" % (_rk, _rv,) if "%" in "  rect_cs_map[%s] = %s" else f"  rect_cs_map[%s] = %s {_rk, _rv}")
                for _tsr in text_cs_regions[:10]:
                    _dbgw(f"  text_spot_region: %s".replace("%s","{0}").replace("%d","{1}") if False else f"  text_spot_region: %s" % (_tsr,) if "%" in "  text_spot_region: %s" else f"  text_spot_region: %s {_tsr}")

                # Enrich page-level color_spaces from content stream detections
                color_spaces.update(used_cs_in_stream)
                # Also check for PANTONE names in spot colors used
                for sn in spot_color_names.values():
                    if 'pantone' in sn.lower():
                        color_spaces.add("PANTONE")

                # Enrich text elements with colorspace info from content stream
                if text_cs_regions:
                    _dbg_file.write(f"TEXT CS ENRICHMENT: {len(text_cs_regions)} regions, {len([e for e in elements if e.get('type')=='text'])} text elements\n")
                    for tcr in text_cs_regions:
                        _dbg_file.write(f"  text_cs_region: y={tcr[0]:.1f} cs={tcr[1]} spot={tcr[2]} name={tcr[3]}\n")
                    for el in elements:
                        if el.get('type') == 'text' and not el.get('colorspace'):
                            el_y0 = el['y'] * mb_h
                            el_y1 = el_y0 + el['h'] * mb_h
                            _dbg_file.write(f"  TEXT EL '{el.get('text','')}' y0={el_y0:.1f} y1={el_y1:.1f}\n")
                            matched = False
                            for (tsr_y, tsr_cs, tsr_spot, tsr_spot_name) in text_cs_regions:
                                if el_y0 - 5 <= tsr_y <= el_y1 + 5:
                                    el['colorspace'] = tsr_cs or 'Ismeretlen'
                                    _dbg_file.write(f"    MATCHED: tsr_y={tsr_y:.1f} -> cs={tsr_cs}\n")
                                    if tsr_spot:
                                        el['spot'] = True
                                        if tsr_spot_name:
                                            el['spot_name'] = tsr_spot_name
                                    matched = True
                                    break
                            if not matched:
                                _dbg_file.write(f"    NO MATCH\n")
                    _dbg_file.flush()

                if drawings:
                    all_rects = []
                    for d in drawings:
                        r = d.get("rect")
                        if r and r.width > 0 and r.height > 0:
                            # Look up the actual colorspace from content stream
                            key = f"{r.x0:.1f},{r.y0:.1f},{r.x1:.1f},{r.y1:.1f}"
                            cs_info = rect_cs_map.get(key)
                            if cs_info:
                                vec_cs, vec_spot, vec_spot_name = cs_info
                            else:
                                # Fallback: try rounding to integers
                                key2 = f"{r.x0:.0f},{r.y0:.0f},{r.x1:.0f},{r.y1:.0f}"
                                cs_info2 = rect_cs_map.get(key2)
                                if cs_info2:
                                    vec_cs, vec_spot, vec_spot_name = cs_info2
                                else:
                                    vec_cs = "Ismeretlen"
                                    vec_spot = False
                                    vec_spot_name = None
                            all_rects.append({
                                'rect': r,
                                'cs': vec_cs,
                                'spot': vec_spot,
                                'spot_name': vec_spot_name,
                            })
                    # Merge overlapping vector rects into groups
                    merged = []
                    for vr in all_rects:
                        r = vr['rect']
                        found = False
                        for m in merged:
                            if r.intersects(m['rect']):
                                m['rect'] = m['rect'] | r  # union
                                if vr['cs'] != "Ismeretlen":
                                    m['cs'] = vr['cs']
                                if vr.get('spot'):
                                    m['spot'] = True
                                if vr.get('spot_name'):
                                    m['spot_name'] = vr['spot_name']
                                found = True
                                break
                        if not found:
                            merged.append({'rect': fitz.Rect(r), 'cs': vr['cs'], 'spot': vr.get('spot', False), 'spot_name': vr.get('spot_name')})
                    for m in merged:
                        r = m['rect']
                        vel = {
                            'type': 'vector',
                            'x': round(r.x0 / mb_w, 4),
                            'y': round(r.y0 / mb_h, 4),
                            'w': round(r.width / mb_w, 4),
                            'h': round(r.height / mb_h, 4),
                            'colorspace': m['cs'],
                        }
                        if m.get('spot'):
                            vel['spot'] = True
                            if m.get('spot_name'):
                                vel['spot_name'] = m['spot_name']
                        elements.append(vel)

                page_info = {
                    'page': page_num + 1,
                    'mediabox_mm': mediabox_mm,
                    'trimbox_mm': trimbox_mm,
                    'trimbox_pt': trimbox_pt,
                    'color_spaces': sorted(color_spaces),
                    'elements': elements,
                }
                pages_info.append(page_info)

            doc.close()

            return Response({'pages': pages_info})


class PdfDeletePageView(APIView):
    """
    PDF oldal törlése.
    POST multipart: pdf (file), page (int, 0-indexed).
    Visszaad: PDF fájl a megadott oldal nélkül.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        pdf_file = request.FILES.get('pdf')
        page_str = request.data.get('page')
        if not pdf_file or page_str is None:
            return Response({'error': 'PDF fájl és oldalszám szükséges'}, status=400)

        try:
            page_idx = int(page_str)
        except (ValueError, TypeError):
            return Response({'error': 'Érvénytelen oldalszám'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            doc = fitz.open(pdf_path)
            if page_idx < 0 or page_idx >= len(doc):
                doc.close()
                return Response({'error': f'Érvénytelen oldalindex: {page_idx}'}, status=400)

            if len(doc) <= 1:
                doc.close()
                return Response({'error': 'Az utolsó oldal nem törölhető'}, status=400)

            doc.delete_page(page_idx)

            out_path = os.path.join(tmpdir, 'result.pdf')
            doc.save(out_path)
            doc.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="result.pdf"'
                return response


class PdfReorderPagesView(APIView):
    """
    PDF oldalak átrendezése.
    POST multipart: pdf (file), order (JSON) = [2, 0, 1, ...] — az új sorrend 0-indexed.
    Visszaad: átrendezett PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json as _json
        pdf_file = request.FILES.get('pdf')
        order_json = request.data.get('order')
        if not pdf_file or not order_json:
            return Response({'error': 'PDF fájl és sorrend szükséges'}, status=400)

        try:
            order = _json.loads(order_json) if isinstance(order_json, str) else order_json
            if not isinstance(order, list):
                raise ValueError
            order = [int(x) for x in order]
        except (ValueError, TypeError):
            return Response({'error': 'Érvénytelen sorrend'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            src = fitz.open(pdf_path)
            n = len(src)
            if sorted(order) != list(range(n)):
                src.close()
                return Response({'error': f'A sorrend nem tartalmazza az összes oldalt (0..{n-1})'}, status=400)

            src.select(order)

            out_path = os.path.join(tmpdir, 'reordered.pdf')
            src.save(out_path)
            src.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="reordered.pdf"'
                return response


class PdfCropView(APIView):
    """
    PDF croppolás: a megadott CropBox/MediaBox alkalmazása oldalanként.
    POST multipart: pdf (file), crop (JSON) = { x, y, w, h } pontban (pt).
    Visszaad: croppolt PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json as _json
        pdf_file = request.FILES.get('pdf')
        crop_json = request.data.get('crop')
        if not pdf_file or not crop_json:
            return Response({'error': 'PDF fájl és crop paraméterek szükségesek'}, status=400)

        try:
            crop = _json.loads(crop_json) if isinstance(crop_json, str) else crop_json
            cx = float(crop['x'])
            cy = float(crop['y'])
            cw = float(crop['w'])
            ch = float(crop['h'])
            crop_page = int(crop.get('page', 0))  # 1-indexed, 0 = all pages
        except (KeyError, ValueError, TypeError):
            return Response({'error': 'Érvénytelen crop paraméterek (x, y, w, h pt-ban)'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            doc = fitz.open(pdf_path)
            for page in doc:
                # Only crop the specified page (1-indexed), or all if 0
                if crop_page > 0 and page.number != (crop_page - 1):
                    continue
                mb = page.mediabox  # (x0, y0, x1, y1) bottom-up
                page_h = mb.y1 - mb.y0
                page_w = mb.x1 - mb.x0
                # Clamp values to page dimensions
                cx_c = max(0, min(cx, page_w))
                cy_c = max(0, min(cy, page_h))
                cw_c = max(0, min(cw, page_w - cx_c))
                ch_c = max(0, min(ch, page_h - cy_c))
                if cw_c <= 0 or ch_c <= 0:
                    continue
                # Frontend sends top-down Y; convert to PDF bottom-up
                pdf_y0 = mb.y0 + (page_h - cy_c - ch_c)
                pdf_y1 = pdf_y0 + ch_c
                crop_rect = fitz.Rect(mb.x0 + cx_c, pdf_y0, mb.x0 + cx_c + cw_c, pdf_y1)
                # Intersect with MediaBox to handle float precision mismatches
                crop_rect = crop_rect & mb
                if crop_rect.is_empty:
                    continue
                # Use low-level xref to set both boxes — avoids PyMuPDF's
                # internal validation which caches the old MediaBox
                xref = page.xref
                arr = "[%g %g %g %g]" % (crop_rect.x0, crop_rect.y0, crop_rect.x1, crop_rect.y1)
                doc.xref_set_key(xref, "MediaBox", arr)
                doc.xref_set_key(xref, "CropBox", arr)

            out_path = os.path.join(tmpdir, 'cropped.pdf')
            doc.save(out_path)
            doc.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="cropped.pdf"'
                return response


class PdfMergeView(APIView):
    """
    Több PDF összefűzése egyetlen PDF-fé.
    POST multipart: pdfs (file[]) — több fájl.
    Visszaad: összefűzött PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist('pdfs')
        if not files or len(files) < 2:
            return Response({'error': 'Legalább 2 PDF fájl szükséges'}, status=400)

        if len(files) > 50:
            return Response({'error': 'Maximum 50 PDF fűzhető össze'}, status=400)

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            merged = fitz.open()

            for idx, pdf_file in enumerate(files):
                if pdf_file.size > 50 * 1024 * 1024:
                    merged.close()
                    return Response({'error': f'A(z) {idx+1}. fájl túl nagy (max 50 MB)'}, status=400)

                path = os.path.join(tmpdir, f'input_{idx}.pdf')
                with open(path, 'wb') as f:
                    for chunk in pdf_file.chunks():
                        f.write(chunk)
                try:
                    src = fitz.open(path)
                    merged.insert_pdf(src)
                    src.close()
                except Exception:
                    merged.close()
                    return Response({'error': f'A(z) {idx+1}. fájl nem érvényes PDF'}, status=400)

            out_path = os.path.join(tmpdir, 'merged.pdf')
            merged.save(out_path)
            merged.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="merged.pdf"'
                return response


class PdfExportView(APIView):
    """
    PDF export: croppolás + guideline-ok mentése annotációként.
    A fő cél: az eredeti PDF megmarad, a színterek nem változnak.
    POST multipart: pdf (file), options (JSON).
    options = {
      crop?: { x, y, w, h },  // pt koordináták
      pages?: number[],        // oldalszámok szűrése (1-based)
      guidelines?: [{ orientation, position, page }],
    }
    Visszaad: exportált PDF fájl.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        import json as _json
        pdf_file = request.FILES.get('pdf')
        if not pdf_file:
            return Response({'error': 'PDF fájl szükséges'}, status=400)

        options_raw = request.data.get('options', '{}')
        try:
            options = _json.loads(options_raw) if isinstance(options_raw, str) else options_raw
        except (ValueError, TypeError):
            options = {}

        try:
            import fitz
        except ImportError:
            return Response({'error': 'PyMuPDF nincs telepítve'}, status=500)

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, 'input.pdf')
            with open(pdf_path, 'wb') as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)

            doc = fitz.open(pdf_path)

            # Page selection
            selected_pages = options.get('pages')
            if selected_pages:
                # Keep only selected pages (1-based)
                keep = sorted(set(int(p) - 1 for p in selected_pages if 1 <= int(p) <= doc.page_count))
                remove = [i for i in range(doc.page_count) if i not in keep]
                for idx in reversed(remove):
                    doc.delete_page(idx)

            # Crop
            crop = options.get('crop')
            if crop:
                try:
                    cx = float(crop['x'])
                    cy = float(crop['y'])
                    cw = float(crop['w'])
                    ch = float(crop['h'])
                    crop_rect = fitz.Rect(cx, cy, cx + cw, cy + ch)
                    for page in doc:
                        page.set_cropbox(crop_rect)
                except (KeyError, ValueError):
                    pass

            # Draw guidelines as thin lines into the PDF
            guidelines = options.get('guidelines', [])
            for gl in guidelines:
                orientation = gl.get('orientation')  # 'h' or 'v'
                pos = float(gl.get('position', 0))   # pt from top/left of page
                gl_page = int(gl.get('page', 0)) - 1
                if 0 <= gl_page < doc.page_count:
                    page = doc[gl_page]
                    mb = page.mediabox
                    shape = page.new_shape()
                    if orientation == 'h':
                        shape.draw_line(fitz.Point(mb.x0, pos), fitz.Point(mb.x1, pos))
                    else:
                        shape.draw_line(fitz.Point(pos, mb.y0), fitz.Point(pos, mb.y1))
                    shape.finish(color=(0, 0.75, 1), width=0.5, dashes="[2 2]")
                    shape.commit()

            out_path = os.path.join(tmpdir, 'export.pdf')
            doc.save(out_path)
            doc.close()

            with open(out_path, 'rb') as f:
                from django.http import HttpResponse
                response = HttpResponse(f.read(), content_type='application/pdf')
                response['Content-Disposition'] = 'attachment; filename="export.pdf"'
                return response
