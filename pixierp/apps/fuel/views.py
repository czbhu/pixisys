import random
from datetime import datetime
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import transaction as db_transaction
from django.db.models import Max, Sum
from django.http import FileResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.sales.models import POSTransaction, POSTransactionItem, POSPayment
from apps.sales.serializers import POSTransactionSerializer
from apps.warehouse.models import MaterialReceipt, MaterialStock, Warehouse

from .models import (
    FUEL_VAT_RATE,
    FuelGrade,
    FuelPump,
    FuelPumpTotalsLog,
    FuelSaleTransaction,
    FuelShift,
    FuelShiftNozzleReading,
    FuelShiftTankReading,
    FuelStationConfig,
    fuel_gross_price,
)
from .pts_client import PTSError
from .serializers import (
    FuelGradeSerializer,
    FuelPumpCreateUpdateSerializer,
    FuelPumpSerializer,
    FuelPumpTotalsLogSerializer,
    FuelSaleTransactionSerializer,
    FuelShiftSerializer,
    FuelStationConfigSerializer,
)
from .shift_pdf import build_shift_pdf
from .stock import deduct_fuel_stock

# PTS válasz típus → miáltalunk használt rövid állapot
STATUS_TYPE_MAP = {
    'PumpIdleStatus': 'idle',
    'PumpFillingStatus': 'filling',
    'PumpEndOfTransactionStatus': 'end_of_transaction',
    'PumpOfflineStatus': 'offline',
    'PumpTotals': 'totals',
    'PumpPrices': 'prices',
    'PumpTag': 'tag',
    'PumpDisplayData': 'display',
}

OPEN_FTX_STATES = ['authorized', 'filling', 'end_of_transaction']


def get_client():
    return FuelStationConfig.get_solo().get_client()


def ensure_module_enabled():
    config = FuelStationConfig.get_solo()
    if not config.enabled:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('A benzinkút modul nincs engedélyezve a Beállítások > Modulok oldalon.')
    return config


def pts_error_response(exc: PTSError, http_status=400):
    return Response(
        {'error': exc.message, 'pts_code': exc.code, 'pts_data': exc.data},
        status=http_status,
    )


def _parse_pts_datetime(value):
    if not value:
        return None
    try:
        dt = parse_datetime(str(value))
        if dt is None:
            dt = datetime.strptime(str(value)[:19], '%Y-%m-%dT%H:%M:%S')
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt)
        return dt
    except (ValueError, TypeError):
        return None


def _to_decimal(value, default=None):
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (ValueError, TypeError, ArithmeticError):
        return default


def _nozzle_fuel_grade(pump, nozzle_number):
    nozzle = pump.nozzles.filter(nozzle_number=nozzle_number).select_related('fuel_grade').first()
    return nozzle.fuel_grade if nozzle else None


def _log_totals(pump, data, source, user):
    """PumpTotals / PumpLastSavedTotals adatok naplózása kútóra naplóba."""
    nozzle_number = data.get('Nozzle') or 1
    fuel_grade = None
    grade_id = data.get('FuelGradeId')
    if grade_id:
        fuel_grade = FuelGrade.objects.filter(fuel_grade_id=grade_id).first()
    elif nozzle_number:
        fuel_grade = _nozzle_fuel_grade(pump, nozzle_number)
    log = FuelPumpTotalsLog.objects.create(
        pump=pump,
        nozzle_number=nozzle_number,
        fuel_grade=fuel_grade,
        volume_total=_to_decimal(data.get('Volume'), Decimal('0')),
        amount_total=_to_decimal(data.get('Amount'), Decimal('0')),
        source=source,
        read_by=user if (user and user.is_authenticated) else None,
    )
    return log


def _update_or_adopt_transaction(pump, resp_type, data, user=None):
    """Frissíti (esetleg létrehozza) a kút nyitott kút tranzakcióját a PTS állapotválasz alapján.

    Kezelt esetek:
    - PumpFillingStatus: élő töltési adatok frissítése
    - PumpEndOfTransactionStatus: végleges mennyiség/összeg rögzítése
    - PumpIdleStatus + LastTransaction: a vezérlő automatikusan lezárta a tranzakciót
      (AutoCloseTransaction), az utolsó adatok a Last* mezőkben érhetők el
    """
    now = timezone.now()
    updated_ftx = None

    if resp_type == 'PumpFillingStatus':
        ftx = _find_open_transaction(pump, data.get('Transaction'))
        if ftx:
            ftx.state = 'filling'
            ftx.volume = _to_decimal(data.get('Volume'), ftx.volume)
            ftx.amount = _to_decimal(data.get('Amount'), ftx.amount)
            ftx.unit_price = _to_decimal(data.get('Price'), ftx.unit_price)
            ftx.is_test = bool(data.get('IsTest', ftx.is_test))
            if data.get('Transaction') and not ftx.pts_transaction_number:
                ftx.pts_transaction_number = data.get('Transaction')
            if not ftx.started_at:
                ftx.started_at = _parse_pts_datetime(data.get('DateTimeStart')) or now
            ftx.raw = data
            ftx.save()
            updated_ftx = ftx

    elif resp_type == 'PumpEndOfTransactionStatus':
        ftx = _find_open_transaction(pump, data.get('Transaction'))
        if ftx is None:
            ftx = FuelSaleTransaction.objects.create(
                pump=pump,
                source='auto',
                state='end_of_transaction',
                cashier=user if (user and user.is_authenticated) else None,
            )
        ftx.state = 'end_of_transaction'
        ftx.nozzle_number = data.get('Nozzle') or ftx.nozzle_number
        if data.get('Transaction'):
            ftx.pts_transaction_number = data.get('Transaction')
        if not ftx.fuel_grade:
            ftx.fuel_grade = _nozzle_fuel_grade(pump, ftx.nozzle_number) or _grade_by_pts_id(data.get('FuelGradeId'))
        ftx.volume = _to_decimal(data.get('Volume'), ftx.volume)
        ftx.amount = _to_decimal(data.get('Amount'), ftx.amount)
        ftx.unit_price = _to_decimal(data.get('Price'), ftx.unit_price)
        ftx.is_test = bool(data.get('IsTest', ftx.is_test))
        if not ftx.started_at:
            ftx.started_at = _parse_pts_datetime(data.get('DateTimeStart'))
        ftx.ended_at = _parse_pts_datetime(data.get('DateTime')) or now
        ftx.raw = data
        ftx.save()
        updated_ftx = ftx

    elif resp_type == 'PumpIdleStatus':
        ftx = _find_open_transaction(pump, data.get('Transaction') or data.get('LastTransaction'))
        if ftx and data.get('LastTransaction') and (
            ftx.pts_transaction_number == data.get('LastTransaction') or ftx.state == 'filling'
        ):
            last_volume = _to_decimal(data.get('LastVolume'))
            if last_volume and last_volume > 0:
                ftx.state = 'end_of_transaction'
                ftx.volume = last_volume
                ftx.amount = _to_decimal(data.get('LastAmount'), ftx.amount)
                ftx.unit_price = _to_decimal(data.get('LastPrice'), ftx.unit_price)
                ftx.pts_transaction_number = data.get('LastTransaction')
                ftx.nozzle_number = data.get('LastNozzle') or ftx.nozzle_number
                if not ftx.fuel_grade:
                    ftx.fuel_grade = _nozzle_fuel_grade(pump, ftx.nozzle_number) or _grade_by_pts_id(data.get('LastFuelGradeId'))
                ftx.ended_at = _parse_pts_datetime(data.get('LastDateTime'))
                ftx.closed_at = ftx.closed_at or now
                ftx.raw = data
                ftx.save()
                updated_ftx = ftx

    return updated_ftx


def _find_open_transaction(pump, pts_transaction_number=None):
    qs = FuelSaleTransaction.objects.filter(pump=pump, state__in=OPEN_FTX_STATES)
    if pts_transaction_number:
        exact = qs.filter(pts_transaction_number=pts_transaction_number).first()
        if exact:
            return exact
        # Nyitott, de más számú tranzakció: nem írjuk felül
        if qs.filter(pts_transaction_number__isnull=False).exists():
            return None
    return qs.filter(pts_transaction_number__isnull=True).first()


def _grade_by_pts_id(fuel_grade_id):
    if not fuel_grade_id:
        return None
    return FuelGrade.objects.filter(fuel_grade_id=fuel_grade_id).first()


def _serialize_status(pump, resp_type, data, ftx=None):
    state = STATUS_TYPE_MAP.get(resp_type, 'unknown')
    fuel_grade = None
    if ftx and ftx.fuel_grade:
        fuel_grade = ftx.fuel_grade
    elif data.get('FuelGradeId'):
        fuel_grade = _grade_by_pts_id(data.get('FuelGradeId'))
    if fuel_grade is None and data.get('Nozzle'):
        fuel_grade = _nozzle_fuel_grade(pump, data.get('Nozzle'))

    return {
        'pump': pump.id,
        'pump_id': pump.pump_id,
        'pump_name': pump.name or f'{pump.pump_id}. kút',
        'state': state,
        'response_type': resp_type,
        'nozzle': data.get('Nozzle') or data.get('NozzleUp') or 0,
        'fuel_grade': fuel_grade.id if fuel_grade else None,
        'fuel_grade_name': fuel_grade.name if fuel_grade else (data.get('FuelGradeName') or ''),
        'volume': float(_to_decimal(data.get('Volume'), 0) or 0),
        'amount': float(_to_decimal(data.get('Amount'), 0) or 0),
        'price': float(_to_decimal(data.get('Price'), 0) or 0),
        'transaction': data.get('Transaction'),
        'flow_rate': data.get('FlowRate'),
        'is_suspended': bool(data.get('IsSuspended', False)),
        'ordered_type': data.get('OrderedType'),
        'ordered_dose': data.get('OrderedDose'),
        'fuel_transaction': FuelSaleTransactionSerializer(ftx).data if ftx else None,
        'raw': data,
    }


class FuelStationConfigViewSet(viewsets.ModelViewSet):
    """Benzinkút modul globális beállításai (singleton)."""
    queryset = FuelStationConfig.objects.all()
    serializer_class = FuelStationConfigSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        config = FuelStationConfig.get_solo()
        serializer = self.get_serializer(config)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def test_connection(self, request):
        config = FuelStationConfig.get_solo()
        try:
            client = config.get_client()
            info = client.get_controller_info()
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'controller': info})

    @action(detail=False, methods=['post'])
    def create_fuel_warehouse(self, request):
        config = FuelStationConfig.get_solo()
        name = request.data.get('name') or 'Üzemanyag raktár'
        address = request.data.get('address') or ''
        code = (request.data.get('code') or 'UZEMANYAG').upper()
        base = code
        index = 2
        while Warehouse.objects.filter(code=code).exists():
            code = f'{base}{index}'
            index += 1
        warehouse = Warehouse.objects.create(name=name, code=code, address=address)
        config.fuel_warehouse = warehouse
        config.save(update_fields=['fuel_warehouse', 'updated_at'])
        return Response({
            'success': True,
            'message': f'Üzemanyag raktár létrehozva: {warehouse.name} ({warehouse.code})',
            'warehouse': {'id': warehouse.id, 'name': warehouse.name, 'code': warehouse.code},
        })

    @action(detail=False, methods=['post'])
    def sync_prices(self, request):
        ensure_module_enabled()
        try:
            pushed = _sync_prices_to_pts()
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'message': 'Árak szinkronizálva a PTS-2 vezérlőre.', 'prices': pushed})

    @action(detail=False, methods=['get'])
    def controller_configuration(self, request):
        ensure_module_enabled()
        client = get_client()
        try:
            return Response({
                'pumps': client.get_pumps_configuration(),
                'fuel_grades': client.get_fuel_grades_configuration(),
                'nozzles': client.get_pump_nozzles_configuration(),
                'prices': client.get_fuel_grades_prices(),
            })
        except PTSError as exc:
            return pts_error_response(exc)


def _sync_prices_to_pts():
    config = FuelStationConfig.get_solo()
    client = config.get_client()
    prices = []
    for grade in FuelGrade.objects.filter(is_active=True, material__isnull=False):
        price = grade.gross_price
        if price is None:
            continue
        prices.append({'FuelGradeId': grade.fuel_grade_id, 'Price': float(price)})
    if prices:
        client.set_fuel_grades_prices(prices)
    return prices


class FuelGradeViewSet(viewsets.ModelViewSet):
    queryset = FuelGrade.objects.select_related('material')
    serializer_class = FuelGradeSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['is_active']

    def _maybe_sync_prices(self):
        config = FuelStationConfig.get_solo()
        if not (config.enabled and config.auto_sync_prices):
            return None
        try:
            _sync_prices_to_pts()
            return 'ok'
        except PTSError:
            return 'failed'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        price_sync = self._maybe_sync_prices()
        headers = self.get_success_headers(serializer.data)
        data = dict(serializer.data)
        if price_sync:
            data['price_sync'] = price_sync
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        price_sync = self._maybe_sync_prices()
        data = dict(serializer.data)
        if price_sync:
            data['price_sync'] = price_sync
        return Response(data)


class FuelPumpViewSet(viewsets.ModelViewSet):
    queryset = FuelPump.objects.prefetch_related('nozzles__fuel_grade')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return FuelPumpCreateUpdateSerializer
        return FuelPumpSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=str(is_active).lower() == 'true')
        return qs

    @action(detail=False, methods=['get'], url_path='status_all')
    def station_status(self, request):
        """Összes (vagy a ?terminal= POS-hoz rendelt) aktív kút állapota egy lekérésben."""
        ensure_module_enabled()
        config = FuelStationConfig.get_solo()

        pumps = self.get_queryset().filter(is_active=True)
        terminal_id = request.query_params.get('terminal')
        if terminal_id:
            from apps.pos.models import POSTerminal
            terminal = POSTerminal.objects.filter(pk=terminal_id).first()
            if terminal and terminal.fuel_pumps.exists():
                pumps = pumps.filter(pk__in=[p.pk for p in terminal.fuel_pumps.all()])

        pumps = list(pumps)
        result = {
            'poll_interval': config.poll_interval or 2,
            'controller_error': None,
            'fuel_warehouse': (
                {'id': config.fuel_warehouse.id, 'name': config.fuel_warehouse.name}
                if config.fuel_warehouse else None
            ),
            'pumps': [],
        }

        try:
            client = get_client()
            statuses = client.get_statuses([p.pump_id for p in pumps])
            by_pump_number = {s.get('RequestedPump'): s for s in statuses}
        except PTSError as exc:
            result['controller_error'] = exc.message
            by_pump_number = {}

        for pump in pumps:
            resp = by_pump_number.get(pump.pump_id)
            if resp is None:
                result['pumps'].append({
                    'pump': pump.id,
                    'pump_id': pump.pump_id,
                    'pump_name': pump.name or f'{pump.pump_id}. kút',
                    'state': 'offline',
                    'response_type': 'NoResponse',
                    'nozzle': 0,
                    'fuel_grade': None,
                    'fuel_grade_name': '',
                    'volume': 0,
                    'amount': 0,
                    'price': 0,
                    'transaction': None,
                    'fuel_transaction': None,
                    'raw': {},
                })
                continue

            resp_type = resp.get('Type')
            data = resp.get('Data') or {}
            ftx = None
            if resp_type == 'PumpTotals':
                _log_totals(pump, data, 'pump_totals', request.user)
            elif resp_type in ('PumpFillingStatus', 'PumpEndOfTransactionStatus', 'PumpIdleStatus'):
                ftx = _update_or_adopt_transaction(pump, resp_type, data, request.user)
            result['pumps'].append(_serialize_status(pump, resp_type, data, ftx))

        # Üzemanyag raktár készletszintek a fajtánkénti termékre
        stock_levels = []
        if config.fuel_warehouse:
            for grade in FuelGrade.objects.filter(is_active=True, material__isnull=False):
                total = MaterialStock.objects.filter(
                    material=grade.material, warehouse=config.fuel_warehouse
                ).aggregate(total=Sum('quantity'))['total']
                stock_levels.append({
                    'fuel_grade': grade.id,
                    'fuel_grade_name': grade.name,
                    'material': grade.material_id,
                    'stock': float(total or 0),
                    'unit': grade.material.unit or 'liter',
                })
        result['stock_levels'] = stock_levels
        return Response(result)

    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        ensure_module_enabled()
        pump = self.get_object()
        try:
            client = get_client()
            resp = client.get_status(pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        resp_type = resp['Type']
        data = resp['Data']
        ftx = None
        if resp_type == 'PumpTotals':
            _log_totals(pump, data, 'pump_totals', request.user)
        elif resp_type in ('PumpFillingStatus', 'PumpEndOfTransactionStatus', 'PumpIdleStatus'):
            ftx = _update_or_adopt_transaction(pump, resp_type, data, request.user)
        return Response(_serialize_status(pump, resp_type, data, ftx))

    @action(detail=True, methods=['post'])
    def authorize(self, request, pk=None):
        """Töltés engedélyezése preset-tel (mennyiség / összeg / tele tank)."""
        ensure_module_enabled()
        pump = self.get_object()

        nozzle_number = request.data.get('nozzle')
        fuel_grade_id = request.data.get('fuel_grade')  # FuelGrade (ERP) rekord id
        preset_type = request.data.get('type') or 'FullTank'
        dose = request.data.get('dose')
        if preset_type not in ('Volume', 'Amount', 'FullTank'):
            return Response({'error': 'Érvénytelen preset típus (Volume | Amount | FullTank).'}, status=400)
        if preset_type != 'FullTank' and not dose:
            return Response({'error': 'Mennyiség vagy összeg megadása kötelező.'}, status=400)

        fuel_grade = None
        if nozzle_number:
            nozzle_number = int(nozzle_number)
            nozzle = pump.nozzles.filter(nozzle_number=nozzle_number).select_related('fuel_grade').first()
            if nozzle is None:
                return Response({'error': f'A kúton nincs {nozzle_number}. pisztoly konfigurálva.'}, status=400)
            fuel_grade = nozzle.fuel_grade
        if fuel_grade is None and fuel_grade_id:
            fuel_grade = FuelGrade.objects.filter(pk=fuel_grade_id).first()

        price = None
        if fuel_grade and fuel_grade.material:
            price = fuel_gross_price(fuel_grade.material)
        if price is None:
            return Response({
                'error': 'A kiválasztott pisztolyhoz/fajtához nincs ár relációval rendelkező termék rendelve.',
            }, status=400)

        ftx = FuelSaleTransaction.objects.create(
            pump=pump,
            nozzle_number=nozzle_number,
            fuel_grade=fuel_grade,
            unit_price=price,
            state='authorized',
            source='pos',
            terminal_id=request.data.get('terminal') or None,
            cashier=request.user if request.user.is_authenticated else None,
        )

        try:
            client = get_client()
            data = client.authorize(
                pump.pump_id,
                nozzle=nozzle_number,
                fuel_grade_id=(fuel_grade.fuel_grade_id if (nozzle_number is None and fuel_grade) else None),
                preset_type=preset_type,
                dose=float(dose) if dose is not None else None,
                price=float(price),
            )
        except PTSError as exc:
            ftx.delete()
            return pts_error_response(exc)

        ftx.pts_transaction_number = data.get('Transaction')
        ftx.save(update_fields=['pts_transaction_number'])
        return Response({
            'success': True,
            'message': 'Kút engedélyezve.',
            'pts_transaction_number': data.get('Transaction'),
            'fuel_transaction': FuelSaleTransactionSerializer(ftx).data,
        })

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        ensure_module_enabled()
        pump = self.get_object()
        try:
            get_client().stop(pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'message': 'Töltés leállítva.'})

    @action(detail=True, methods=['post'])
    def emergency_stop(self, request, pk=None):
        ensure_module_enabled()
        pump = self.get_object()
        try:
            get_client().emergency_stop(pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'message': 'Vészhelyzet leállítás végrehajtva.'})

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        ensure_module_enabled()
        pump = self.get_object()
        try:
            get_client().suspend(pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'message': 'Töltés felfüggesztve.'})

    @action(detail=True, methods=['post'])
    def resume(self, request, pk=None):
        ensure_module_enabled()
        pump = self.get_object()
        try:
            get_client().resume(pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'message': 'Töltés folytatva.'})

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Kút tranzakció lezárása (nullázás) a PTS-2 vezérlőben."""
        ensure_module_enabled()
        pump = self.get_object()
        ftx_id = request.data.get('fuel_transaction')
        ftx = None
        if ftx_id:
            ftx = FuelSaleTransaction.objects.filter(pk=ftx_id, pump=pump).first()
        if ftx is None:
            ftx = FuelSaleTransaction.objects.filter(
                pump=pump, state__in=OPEN_FTX_STATES
            ).order_by('-created_at').first()
        if ftx is None or not ftx.pts_transaction_number:
            return Response({'error': 'Nincs lezárható nyitott kút tranzakció a kúton.'}, status=400)
        try:
            get_client().close_transaction(pump.pump_id, ftx.pts_transaction_number)
        except PTSError as exc:
            return pts_error_response(exc)
        ftx.closed_at = timezone.now()
        if ftx.state == 'end_of_transaction':
            # Lezárás után fizetetlenül is "kész" állapotban marad nyilvántartásban
            pass
        ftx.save(update_fields=['closed_at'])
        return Response({'success': True, 'message': 'Kút tranzakció lezárva (nullázva).'})

    @action(detail=True, methods=['post'])
    def read_totals(self, request, pk=None):
        """Kútóra (regiszter) kiolvasás kérése a kútból.

        A vezérlőnek idő kell az óraértékek kiolvasására: a kérésre visszaigazolás
        érkezik, az érték a kútállapot lekérdezése (status) válaszában jelenik meg
        PumpTotals válaszként, ahol automatikusan naplózásra kerül.
        """
        ensure_module_enabled()
        pump = self.get_object()
        nozzle_number = request.data.get('nozzle') or request.data.get('nozzle_number')
        if nozzle_number is None:
            first = pump.nozzles.order_by('nozzle_number').first()
            nozzle_number = first.nozzle_number if first else 1
        try:
            get_client().request_totals(pump.pump_id, int(nozzle_number))
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({
            'success': True,
            'message': (
                'Kútóra kiolvasás elindítva. Az érték a következő állapotlekérdezéskor '
                '(PumpTotals válasz) érkezik meg és naplózásra kerül.'
            ),
        })

    @action(detail=True, methods=['get'], url_path='last_saved_totals')
    def last_saved_totals(self, request, pk=None):
        """A vezérlő memóriájában tárolt utolsó kútóra-állások azonnali kiolvasása."""
        ensure_module_enabled()
        pump = self.get_object()
        try:
            data = get_client().get_last_saved_totals(pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        logs = []
        for nozzle_data in data.get('Nozzles') or []:
            log = _log_totals(pump, nozzle_data, 'last_saved', request.user)
            logs.append(FuelPumpTotalsLogSerializer(log).data)
        return Response({'success': True, 'pump': pump.pump_id, 'nozzles': logs})


def _finalize_fuel_sale(ftx, pos_transaction, request, config=None):
    """Kifizetett kút tranzakció közös lezárása: POS bizonylat csatolása,
    készletlevonás és kútzárás (nullázás). Visszaadja a figyelmeztetések listáját."""
    config = config or FuelStationConfig.get_solo()
    warnings = []

    ftx.state = 'paid'
    ftx.paid_at = timezone.now()
    ftx.pos_transaction = pos_transaction
    if request.data.get('terminal'):
        ftx.terminal_id = request.data.get('terminal')
    if request.user.is_authenticated:
        ftx.cashier = request.user
    ftx.save()

    uncovered = deduct_fuel_stock(ftx, request.user)
    if uncovered and uncovered > 0:
        warnings.append(
            f'Figyelem: {uncovered} liter nem volt fedezetben az üzemanyag raktárban '
            '(hiányzó bevételezés?).'
        )

    if config.auto_close_transaction and ftx.pts_transaction_number and not ftx.closed_at:
        try:
            get_client().close_transaction(ftx.pump.pump_id, ftx.pts_transaction_number)
            ftx.closed_at = timezone.now()
            ftx.save(update_fields=['closed_at'])
        except PTSError as exc:
            warnings.append(f'A kútzárás (nullázás) nem sikerült: {exc.message}')

    return warnings


class FuelTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FuelSaleTransaction.objects.select_related(
        'pump', 'fuel_grade', 'fuel_grade__material', 'pos_transaction', 'cashier'
    )
    serializer_class = FuelSaleTransactionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['pump', 'state', 'fuel_grade']
    search_fields = ['pos_transaction__transaction_number']

    def get_queryset(self):
        qs = super().get_queryset()
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    @action(detail=True, methods=['post'])
    def refresh(self, request, pk=None):
        """Újra lekérdezi a kút állapotát és frissíti a tranzakció adatait."""
        ensure_module_enabled()
        ftx = self.get_object()
        try:
            resp = get_client().get_status(ftx.pump.pump_id)
        except PTSError as exc:
            return pts_error_response(exc)
        resp_type = resp['Type']
        data = resp['Data']
        updated = None
        if resp_type in ('PumpFillingStatus', 'PumpEndOfTransactionStatus', 'PumpIdleStatus'):
            updated = _update_or_adopt_transaction(ftx.pump, resp_type, data, request.user)
        ftx.refresh_from_db()
        return Response({
            'success': True,
            'status': _serialize_status(ftx.pump, resp_type, data, updated or ftx),
            'fuel_transaction': FuelSaleTransactionSerializer(ftx).data,
        })

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Kifizeti a kút tranzakciót: POS bizonylat + fizetés + készletlevonás + kútzárás."""
        ensure_module_enabled()
        config = FuelStationConfig.get_solo()
        ftx = self.get_object()

        if ftx.state not in ('end_of_transaction', 'filling', 'authorized'):
            return Response({'error': 'A kút tranzakció nem fizethető ki ebben az állapotban.'}, status=400)
        if ftx.state != 'end_of_transaction':
            # Élő/engedélyezett töltés végső adatainak frissítése
            try:
                resp = get_client().get_status(ftx.pump.pump_id)
                if resp['Type'] in ('PumpFillingStatus', 'PumpEndOfTransactionStatus', 'PumpIdleStatus'):
                    _update_or_adopt_transaction(ftx.pump, resp['Type'], resp['Data'], request.user)
                ftx.refresh_from_db()
            except PTSError:
                pass
        if ftx.state != 'end_of_transaction':
            return Response({'error': 'A töltés még nincs befejezve.'}, status=400)
        if not ftx.fuel_grade or not ftx.fuel_grade.material:
            return Response({'error': 'A tranzakció üzemanyag fajtájához nincs termék rendelve.'}, status=400)
        if ftx.pos_transaction_id:
            return Response({'error': 'A tranzakció már ki van fizetve.'}, status=400)

        payment_method = request.data.get('payment_method') or 'cash'
        if payment_method not in ('cash', 'card'):
            return Response({'error': 'Érvénytelen fizetési mód (cash | card).'}, status=400)
        amount_received = _to_decimal(request.data.get('amount_received'))

        # ---------------------------------------------------------- POS bizonylat
        material = ftx.fuel_grade.material
        gross_unit = ftx.unit_price or (fuel_gross_price(material) or Decimal('0'))
        net_unit = (gross_unit / (Decimal(1) + Decimal(FUEL_VAT_RATE) / Decimal(100))).quantize(Decimal('0.01'))
        pump_label = ftx.pump.name or '{}. kút'.format(ftx.pump.pump_id)
        nozzle_label = ' {}. pisztoly'.format(ftx.nozzle_number) if ftx.nozzle_number else ''
        today = timezone.now().strftime('%Y%m%d')
        transaction_number = f'POS-{today}-{random.randint(1000, 9999)}'
        while POSTransaction.objects.filter(transaction_number=transaction_number).exists():
            transaction_number = f'POS-{today}-{random.randint(1000, 9999)}'

        pos_transaction = POSTransaction.objects.create(
            transaction_number=transaction_number,
            transaction_type='receipt',
            payment_method=payment_method,
            status='draft',
            cashier=request.user if request.user.is_authenticated else None,
        )
        POSTransactionItem.objects.create(
            transaction=pos_transaction,
            material=material,
            product_code=material.code,
            product_name='{grade} – {pump}{nozzle}'.format(
                grade=ftx.fuel_grade.name, pump=pump_label, nozzle=nozzle_label
            ).strip(),
            quantity=ftx.volume,
            unit=material.unit or 'liter',
            gross_unit_price=gross_unit.quantize(Decimal('0.01')),
            net_unit_price=net_unit,
            vat_rate=Decimal(str(FUEL_VAT_RATE)),
        )
        if amount_received is not None:
            pos_transaction.amount_received = amount_received
        pos_transaction.calculate_totals()
        pos_transaction.refresh_from_db()

        # -------------------------------------------------------------- fizetés
        payment = POSPayment.objects.create(
            transaction=pos_transaction, amount=pos_transaction.total_gross
        )
        if payment_method == 'cash':
            payment.status = 'success'
            payment.completed_at = timezone.now()
            payment.save()
            pos_transaction.status = 'completed'
            pos_transaction.completed_at = timezone.now()
            pos_transaction.drawer_opened_at = timezone.now()
            pos_transaction.save()
        else:
            # Kártyás fizetés: bankterminál integráció még nincs, azonnal sikerként
            # kerül rögzítésre (a POS kártyás folyamathoz hasonlóan).
            payment.status = 'success'
            payment.terminal_id = request.data.get('terminal_id', 'FUEL')
            payment.terminal_response_code = 'APPROVED'
            payment.terminal_response_message = 'Kártyás fizetés rögzítve (bankterminál integráció nélkül)'
            payment.completed_at = timezone.now()
            payment.save()
            pos_transaction.status = 'completed'
            pos_transaction.completed_at = timezone.now()
            pos_transaction.terminal_transaction_id = f'FUEL-{ftx.pk}'
            pos_transaction.save()

        # ------------------------------------------------- kút tranzakció lezárás
        warnings = _finalize_fuel_sale(ftx, pos_transaction, request, config)

        return Response({
            'success': True,
            'message': 'Fizetés rögzítve.',
            'transaction': POSTransactionSerializer(pos_transaction).data,
            'fuel_transaction': FuelSaleTransactionSerializer(ftx).data,
            'change': float(pos_transaction.amount_change or 0),
            'warnings': warnings,
        })

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """A kasszakosárból kifizetett kút tranzakció utólagos lezárása.

        A kassza a kész tankolást termékként a kosárba teszi; a szokásos
        pénzfelvétel (CheckoutSummary) után ez a végpont köti össze a kút
        tranzakciót a POS bizonylattal, vonja le a készletet és zárja a kutat.
        """
        ensure_module_enabled()
        ftx = self.get_object()

        if ftx.state == 'paid':
            return Response({
                'success': True,
                'message': 'A kút tranzakció már le van zárva.',
                'fuel_transaction': FuelSaleTransactionSerializer(ftx).data,
                'warnings': [],
            })
        if ftx.state not in ('end_of_transaction', 'rebill'):
            return Response({'error': 'A kút tranzakció nincs kész tankolási állapotban.'}, status=400)

        pos_id = request.data.get('pos_transaction')
        pos_transaction = POSTransaction.objects.filter(pk=pos_id).first() if pos_id else None
        if pos_transaction is None:
            return Response({'error': 'Érvénytelen vagy hiányzó POS bizonylat (pos_transaction).'}, status=400)

        warnings = _finalize_fuel_sale(ftx, pos_transaction, request)
        return Response({
            'success': True,
            'message': 'Kút tranzakció lezárva.',
            'fuel_transaction': FuelSaleTransactionSerializer(ftx).data,
            'warnings': warnings,
        })

    @action(detail=False, methods=['get'], url_path='pending_rebills')
    def pending_rebills(self, request):
        """Sztornózott bizonylathoz tartozó, újrakibizonylatolandó üzemanyag tételek."""
        ensure_module_enabled()
        qs = self.get_queryset().filter(state='rebill').order_by('-updated_at')[:50]
        return Response(FuelSaleTransactionSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Kút tranzakció törlése a nyilvántartásból; nyitott kútzárás kísérletével."""
        ensure_module_enabled()
        ftx = self.get_object()
        if ftx.state == 'paid':
            return Response({'error': 'Kifizetett tranzakció nem törölhető, sztornóznia kell a POS bizonylatot.'}, status=400)

        warnings = []
        if ftx.pts_transaction_number and not ftx.closed_at:
            try:
                get_client().close_transaction(ftx.pump.pump_id, ftx.pts_transaction_number)
                ftx.closed_at = timezone.now()
            except PTSError as exc:
                warnings.append(f'A kútzárás (nullázás) nem sikerült: {exc.message}')

        ftx.state = 'cancelled'
        ftx.save()

        return Response({
            'success': True,
            'message': 'Kút tranzakció törölve a nyilvántartásból.',
            'warnings': warnings,
            'fuel_transaction': FuelSaleTransactionSerializer(ftx).data,
        })

    @action(detail=False, methods=['post'], url_path='pts_report')
    def pts_report(self, request):
        """Kút tranzakciós napló kiolvasása a PTS-2 vezérlőből időintervallumra."""
        ensure_module_enabled()
        date_from = request.data.get('date_from')
        date_to = request.data.get('date_to')
        pump = request.data.get('pump') or 0
        if not (date_from or date_to):
            return Response({'error': 'date_from vagy date_to megadása kötelező.'}, status=400)
        try:
            data = get_client().report_pump_transactions(
                date_from=date_from, date_to=date_to, pump=pump
            )
        except PTSError as exc:
            return pts_error_response(exc)
        return Response({'success': True, 'transactions': data})


class FuelPumpTotalsLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FuelPumpTotalsLog.objects.select_related('pump', 'fuel_grade')
    serializer_class = FuelPumpTotalsLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['pump', 'nozzle_number', 'source']

    def get_queryset(self):
        qs = super().get_queryset()
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(read_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(read_at__date__lte=date_to)
        return qs


# ============================================================ műszak átadás

def _collect_pts_totals(user, warnings):
    """Kiolvassa az összes aktív kút óráit a vezérlő memóriájából (PumpGetLastSavedTotals),
    naplózza őket, és visszaadja {(pump_id, nozzle_number): volume_total} térképet.
    A vezérlő elérése sikertelen esetén a legutóbbi kiolvasott óraállásot használja."""
    result = {}
    client = get_client()
    for pump in FuelPump.objects.filter(is_active=True):
        try:
            data = client.get_last_saved_totals(pump.pump_id)
        except PTSError as exc:
            warnings.append(
                f'{pump.name or str(pump.pump_id) + ". kút"} óráinak kiolvasása nem sikerült '
                f'({exc.message}); a legutóbbi rögzített óraállás lesz használva.'
            )
            for log in FuelPumpTotalsLog.objects.filter(pump=pump).order_by('-read_at'):
                result.setdefault((pump.pump_id, log.nozzle_number), log.volume_total)
            continue
        except Exception as exc:  # vezérlő nem elérhető
            warnings.append(
                f'{pump.name or str(pump.pump_id) + ". kút"} óráinak kiolvasása nem sikerült '
                f'({exc}); a legutóbbi rögzített óraállás lesz használva.'
            )
            for log in FuelPumpTotalsLog.objects.filter(pump=pump).order_by('-read_at'):
                result.setdefault((pump.pump_id, log.nozzle_number), log.volume_total)
            continue
        for nozzle_data in data.get('Nozzles') or []:
            log = _log_totals(pump, nozzle_data, 'last_saved', user)
            result[(pump.pump_id, log.nozzle_number)] = log.volume_total
    return result


def _fuel_material_ids():
    return set(FuelGrade.objects.exclude(material=None).values_list('material_id', flat=True))


def _shift_received_by_grade(opened_at, until, config):
    """A műszak alatt az üzemanyag raktárba bevételezett mennyiség üzemanyag fajtánként."""
    received = {}
    if not config.fuel_warehouse:
        return received
    grade_materials = {g.pk: g.material_id for g in FuelGrade.objects.exclude(material=None)}
    qs = MaterialReceipt.objects.filter(
        warehouse=config.fuel_warehouse,
        material_id__in=grade_materials.values(),
        created_at__gte=opened_at, created_at__lte=until,
    ).values('material_id').annotate(qty=Sum('quantity'))
    by_material = {row['material_id']: row['qty'] or Decimal('0') for row in qs}
    for grade_pk, material_id in grade_materials.items():
        received[grade_pk] = by_material.get(material_id, Decimal('0'))
    return received


def _shift_sales_summary(opened_at, until):
    """Értékesítési összesítés a műszak időablakában, fizetési mód és kategória bontásban.
    Kategóriák: Üzemanyag (a FuelGrade-hez rendelt termékek) és Egyéb (bolti) tételek."""
    txs = POSTransaction.objects.filter(created_at__gte=opened_at, created_at__lte=until)
    sales_txs = txs.filter(status='completed', stornoed_at__isnull=True)
    storno_txs = txs.filter(status='cancelled', stornoed_at__gte=opened_at, stornoed_at__lte=until)
    fuel_material_ids = _fuel_material_ids()

    cats = {
        'fuel': {'label': 'Üzemanyag', 'volume': Decimal('0'), 'by_pay': {}},
        'shop': {'label': 'Egyéb (bolt)', 'volume': Decimal('0'), 'by_pay': {}},
    }
    items = POSTransactionItem.objects.filter(transaction__in=sales_txs)
    for item in items.select_related(None).only('material_id', 'quantity', 'gross_total', 'transaction__payment_method'):
        key = 'fuel' if item.material_id in fuel_material_ids else 'shop'
        pay = item.transaction.payment_method
        agg = cats[key]['by_pay'].setdefault(pay, {'volume': Decimal('0'), 'amount': Decimal('0')})
        agg['amount'] += item.gross_total or Decimal('0')
        if key == 'fuel':
            agg['volume'] += item.quantity or Decimal('0')
            cats[key]['volume'] += item.quantity or Decimal('0')

    storno_by_pay = {}
    for tx in storno_txs:
        agg = storno_by_pay.setdefault(tx.payment_method, {'amount': Decimal('0'), 'count': 0})
        agg['amount'] += tx.total_gross or Decimal('0')
        agg['count'] += 1

    payment_methods = [p for p in ('cash', 'card', 'customer_card')]
    seen = set(cats['fuel']['by_pay']) | set(cats['shop']['by_pay']) | set(storno_by_pay)
    payment_methods += sorted(seen - set(payment_methods))

    def pay_block(pay):
        sales_f = cats['fuel']['by_pay'].get(pay, {'volume': Decimal('0'), 'amount': Decimal('0')})
        sales_s = cats['shop']['by_pay'].get(pay, {'volume': Decimal('0'), 'amount': Decimal('0')})
        sto = storno_by_pay.get(pay, {'amount': Decimal('0'), 'count': 0})
        return {
            'sales': float(sales_f['amount'] + sales_s['amount']),
            'storno': float(sto['amount']),
            'net': float(sales_f['amount'] + sales_s['amount'] - sto['amount']),
        }

    categories = []
    for key in ('fuel', 'shop'):
        cat = cats[key]
        if not cat['by_pay']:
            continue
        by_payment = {
            pay: {'volume': float(cat['by_pay'][pay]['volume']), 'amount': float(cat['by_pay'][pay]['amount'])}
            for pay in cat['by_pay']
        }
        categories.append({
            'category': cat['label'],
            'volume': float(cat['volume']) if cat['volume'] else None,
            'by_payment': by_payment,
            'total_amount': float(sum(v['amount'] for v in cat['by_pay'].values())),
        })

    gross_total = float(sum(
        (v['amount'] for c in cats.values() for v in c['by_pay'].values()), Decimal('0')
    ))
    storno_total = float(sum((v['amount'] for v in storno_by_pay.values()), Decimal('0')))
    return {
        'payment_methods': payment_methods,
        'categories': categories,
        'by_payment': {pay: pay_block(pay) for pay in payment_methods if pay in seen or pay in ('cash',)},
        'storno': {pay: {'amount': float(v['amount']), 'count': v['count']} for pay, v in storno_by_pay.items()},
        'gross_total': gross_total,
        'storno_total': storno_total,
        'net_total': float(gross_total - storno_total),
        'transaction_count': sales_txs.count(),
        'storno_count': storno_txs.count(),
    }


def _shift_cash_summary(opened_at, until, cash_register_id, opening_balance, counted_cash):
    """Pénzforgalom a műszakban. A fiók tartalma = nyitó készpénz + készpénzes értékesítés
    – sztornó visszafizetés + betétek – kivétek (a POS értékesítés nem ír kassza tranzakciót)."""
    from apps.finance.models import CashRegister, CashRegisterTransaction

    register = None
    if cash_register_id:
        register = CashRegister.objects.filter(pk=cash_register_id).first()
    if register is None:
        register = CashRegister.objects.filter(is_pos_default=True).first() or \
            CashRegister.objects.filter(is_active=True).first()

    deposits = Decimal('0')
    withdrawals = Decimal('0')
    movements = []
    if register:
        qs = CashRegisterTransaction.objects.filter(
            cash_register=register, timestamp__gte=opened_at, timestamp__lte=until,
        ).order_by('timestamp').select_related('employee')
        for t in qs:
            is_deposit = t.amount >= 0
            if is_deposit:
                deposits += t.amount
            else:
                withdrawals += -t.amount
            movements.append({
                'at': t.timestamp.isoformat(),
                'employee': str(t.employee) if t.employee else None,
                'amount': float(t.amount),
                'note': t.note or '',
                'reason': str(t.reason) if t.reason else '',
                'is_deposit': is_deposit,
            })
    return {
        'cash_register': {'id': register.pk, 'name': register.name} if register else None,
        'opening_balance': float(opening_balance or 0),
        'deposits_total': float(deposits),
        'withdrawals_total': float(withdrawals),
        'movements': movements,
        'counted_cash': float(counted_cash) if counted_cash is not None else None,
    }


class FuelShiftViewSet(viewsets.ModelViewSet):
    """Műszak átadás: műszak nyitás/zárás, üzemanyag leltár, értékesítési és pénzforgalmi
    összesítés, PDF jegyzőkönyv."""
    permission_classes = [IsAuthenticated]
    queryset = FuelShift.objects.all()
    serializer_class = FuelShiftSerializer

    def list(self, request, *args, **kwargs):
        status_filter = request.query_params.get('status')
        qs = self.get_queryset()
        if status_filter:
            qs = qs.filter(status=status_filter)
        qs = qs.prefetch_related('nozzle_readings__pump', 'nozzle_readings__fuel_grade',
                                 'tank_readings__fuel_grade')
        page = self.paginate_queryset(qs)
        data = self.get_serializer(page if page is not None else qs, many=True).data
        return self.get_paginated_response(data) if page is not None else Response(data)

    @action(detail=False, methods=['get'])
    def current(self, request):
        """Az aktuálisan nyitott műszak (vagy null)."""
        shift = FuelShift.objects.filter(status='open').order_by('-opened_at').first()
        return Response({'shift': FuelShiftSerializer(shift).data if shift else None})

    @action(detail=False, methods=['post'], url_path='open_shift')
    def open_shift(self, request):
        """Új műszak nyitása: kútóra nyitó állás és tartály nyitó készlet sznapshot."""
        ensure_module_enabled()
        if FuelShift.objects.filter(status='open').exists():
            return Response({'error': 'Már van nyitott műszak; előbb azt kell lezárni.'}, status=400)

        config = FuelStationConfig.get_solo()
        warnings = []
        totals = _collect_pts_totals(request.user, warnings)

        terminal = None
        terminal_id = request.data.get('terminal')
        if terminal_id:
            from apps.pos.models import POSTerminal
            terminal = POSTerminal.objects.filter(pk=terminal_id).first()

        with db_transaction.atomic():
            number = (FuelShift.objects.aggregate(max_no=Max('number'))['max_no'] or 0) + 1
            shift = FuelShift.objects.create(
                number=number,
                terminal=terminal,
                opened_by=request.user if request.user.is_authenticated else None,
            )
            for pump in FuelPump.objects.filter(is_active=True).prefetch_related('nozzles__fuel_grade'):
                for nozzle in pump.nozzles.select_related('fuel_grade'):
                    if not nozzle.fuel_grade:
                        continue
                    FuelShiftNozzleReading.objects.create(
                        shift=shift,
                        pump=pump,
                        nozzle_number=nozzle.nozzle_number,
                        fuel_grade=nozzle.fuel_grade,
                        opening_total=totals.get((pump.pump_id, nozzle.nozzle_number), Decimal('0')),
                    )
            prev = FuelShift.objects.filter(status='closed').order_by('-closed_at').first()
            grades = FuelGrade.objects.filter(is_active=True, material__isnull=False).select_related('material')
            for grade in grades:
                opening_stock = None
                if prev:
                    prev_tank = prev.tank_readings.filter(fuel_grade=grade).first()
                    if prev_tank and prev_tank.measured_closing is not None:
                        opening_stock = prev_tank.measured_closing
                if opening_stock is None and config.fuel_warehouse:
                    agg = MaterialStock.objects.filter(
                        material=grade.material, warehouse=config.fuel_warehouse
                    ).aggregate(q=Sum('quantity'))
                    opening_stock = agg['q'] or Decimal('0')
                FuelShiftTankReading.objects.create(
                    shift=shift,
                    fuel_grade=grade,
                    material=grade.material,
                    opening_stock=opening_stock or Decimal('0'),
                )
        if not config.fuel_warehouse:
            warnings.append('Nincs üzemanyag raktár beállítva – a tartály nyitó készlet 0.')
        return Response({
            'success': True,
            'shift': FuelShiftSerializer(shift).data,
            'warnings': warnings,
        })

    @action(detail=True, methods=['get'])
    def close_preview(self, request, pk=None):
        """Zárás előtti előnézet: javasolt záró óraállások, bevételezések,
        eddigi értékesítések és pénzforgalom."""
        ensure_module_enabled()
        shift = self.get_object()
        if shift.status != 'open':
            return Response({'error': 'A műszak nincs nyitva.'}, status=400)
        config = FuelStationConfig.get_solo()
        now = timezone.now()

        warnings = []
        totals = _collect_pts_totals(request.user, warnings)
        nozzle_rows = []
        for nr in shift.nozzle_readings.select_related('pump', 'fuel_grade').order_by('pump__pump_id', 'nozzle_number'):
            suggested = totals.get((nr.pump.pump_id, nr.nozzle_number))
            nozzle_rows.append({
                'id': nr.pk,
                'pump_name': nr.pump.name or f'{nr.pump.pump_id}. kút',
                'pump_number': nr.pump.pump_id,
                'nozzle_number': nr.nozzle_number,
                'fuel_grade': nr.fuel_grade_id,
                'fuel_grade_name': nr.fuel_grade.name,
                'opening_total': float(nr.opening_total),
                'suggested_closing': float(suggested) if suggested is not None else None,
            })

        received = _shift_received_by_grade(shift.opened_at, now, config)
        tank_rows = []
        for tr in shift.tank_readings.select_related('fuel_grade'):
            current_stock = None
            if config.fuel_warehouse and tr.material:
                agg = MaterialStock.objects.filter(
                    material=tr.material, warehouse=config.fuel_warehouse
                ).aggregate(q=Sum('quantity'))
                current_stock = float(agg['q'] or 0)
            tank_rows.append({
                'id': tr.pk,
                'fuel_grade': tr.fuel_grade_id,
                'fuel_grade_name': tr.fuel_grade.name,
                'opening_stock': float(tr.opening_stock),
                'received': float(received.get(tr.fuel_grade_id, Decimal('0'))),
                'current_stock': current_stock,
            })

        sales = _shift_sales_summary(shift.opened_at, now)
        prev_shift = FuelShift.objects.filter(
            status='closed', closed_at__lt=shift.opened_at
        ).order_by('-closed_at').first()
        if prev_shift and prev_shift.counted_cash is not None:
            opening_cash = prev_shift.counted_cash
            opening_source = 'previous_shift'
        else:
            from apps.finance.models import CashRegister
            register = CashRegister.objects.filter(is_pos_default=True).first() or \
                CashRegister.objects.filter(is_active=True).first()
            opening_cash = (register.current_balance if register else Decimal('0'))
            opening_source = 'register_balance'
        cash = _shift_cash_summary(
            shift.opened_at, now, request.query_params.get('cash_register'), opening_cash, None
        )
        cash['opening_source'] = opening_source
        cash['cash_sales'] = (sales.get('by_payment') or {}).get('cash', {}).get('sales', 0)
        cash['cash_storno'] = (sales.get('storno') or {}).get('cash', {}).get('amount', 0)
        cash['calculated_closing'] = float(
            Decimal(str(cash['opening_balance'])) + Decimal(str(cash['cash_sales']))
            - Decimal(str(cash['cash_storno'])) + Decimal(str(cash['deposits_total']))
            - Decimal(str(cash['withdrawals_total']))
        )

        return Response({
            'nozzles': nozzle_rows,
            'tanks': tank_rows,
            'sales': sales,
            'cash': cash,
            'warnings': warnings,
        })

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Műszak lezárása: záró óraállások és mért tartálykészletek rögzítése,
        elszámolás, összesítés és PDF jegyzőkönyv készítése."""
        ensure_module_enabled()
        shift = self.get_object()
        if shift.status != 'open':
            return Response({'error': 'A műszak nincs nyitva (talán már le van zárva).'}, status=400)
        config = FuelStationConfig.get_solo()
        now = timezone.now()

        readings = {nr.pk: nr for nr in shift.nozzle_readings.select_related('pump', 'fuel_grade')}
        for item in request.data.get('nozzles') or []:
            nr = readings.get(item.get('id'))
            if nr is None:
                return Response({'error': f'Ismeretlen kútóra bejegyzés: {item.get("id")}'}, status=400)
            closing = _to_decimal(item.get('closing_total'))
            if closing is None:
                return Response({
                    'error': f'{nr.pump.name or str(nr.pump.pump_id) + ". kút"} / {nr.nozzle_number}. '
                             'pisztoly: hiányzó záró óraállás.',
                }, status=400)
            if closing < nr.opening_total:
                return Response({
                    'error': f'{nr.pump.name or str(nr.pump.pump_id) + ". kút"} / {nr.nozzle_number}. '
                             'pisztoly: a záró óraállás nem lehet kisebb a nyitó állásnál.',
                }, status=400)
            nr.closing_total = closing
            nr.closing_source = 'auto' if item.get('source') == 'auto' else 'manual'

        tanks = {tr.pk: tr for tr in shift.tank_readings.select_related('fuel_grade', 'material')}
        for item in request.data.get('tanks') or []:
            tr = tanks.get(item.get('id'))
            if tr is None:
                return Response({'error': f'Ismeretlen tartály bejegyzés: {item.get("id")}'}, status=400)
            measured = _to_decimal(item.get('measured_closing'))
            if measured is None or measured < 0:
                return Response({
                    'error': f'{tr.fuel_grade.name}: hiányzó vagy érvénytelen mért tartálykészlet.',
                }, status=400)
            tr.measured_closing = measured

        with db_transaction.atomic():
            for nr in readings.values():
                nr.save()
            received = _shift_received_by_grade(shift.opened_at, now, config)
            dispensed_by_grade = {}
            for nr in readings.values():
                if nr.movement is not None:
                    dispensed_by_grade[nr.fuel_grade_id] = dispensed_by_grade.get(
                        nr.fuel_grade_id, Decimal('0')) + nr.movement
            for tr in tanks.values():
                tr.received = received.get(tr.fuel_grade_id, Decimal('0'))
                tr.dispensed = dispensed_by_grade.get(tr.fuel_grade_id, Decimal('0'))
                tr.calculated_closing = (tr.opening_stock + tr.received - tr.dispensed).quantize(Decimal('0.001'))
                if tr.measured_closing is not None:
                    tr.difference = (tr.measured_closing - tr.calculated_closing).quantize(Decimal('0.001'))
                tr.save()

            sales = _shift_sales_summary(shift.opened_at, now)
            prev_shift = FuelShift.objects.filter(
                status='closed', closed_at__lt=shift.opened_at
            ).order_by('-closed_at').first()
            if prev_shift and prev_shift.counted_cash is not None:
                opening_cash, opening_source = prev_shift.counted_cash, 'previous_shift'
            else:
                from apps.finance.models import CashRegister
                register = CashRegister.objects.filter(is_pos_default=True).first() or \
                    CashRegister.objects.filter(is_active=True).first()
                opening_cash = (register.current_balance if register else Decimal('0'))
                opening_source = 'register_balance'

            counted_cash = _to_decimal(request.data.get('counted_cash'))
            cash = _shift_cash_summary(
                shift.opened_at, now, request.data.get('cash_register'), opening_cash, counted_cash
            )
            cash['opening_source'] = opening_source
            cash['cash_sales'] = (sales.get('by_payment') or {}).get('cash', {}).get('sales', 0)
            cash['cash_storno'] = (sales.get('storno') or {}).get('cash', {}).get('amount', 0)
            cash['calculated_closing'] = float(
                Decimal(str(cash['opening_balance'])) + Decimal(str(cash['cash_sales']))
                - Decimal(str(cash['cash_storno'])) + Decimal(str(cash['deposits_total']))
                - Decimal(str(cash['withdrawals_total']))
            )
            if counted_cash is not None:
                cash['cash_difference'] = float(counted_cash - Decimal(str(cash['calculated_closing'])))

            shift.counted_cash = counted_cash
            shift.notes = (request.data.get('notes') or '').strip() or shift.notes
            shift.summary = {'sales': sales, 'cash': cash}
            shift.status = 'closed'
            shift.closed_at = now
            shift.closed_by = request.user if request.user.is_authenticated else None
            shift.save()

        # ------------------------------------------------------- PDF jegyzőkönyv
        try:
            pdf_bytes = build_shift_pdf(shift)
            fname = f'muszak_{shift.number}_{now:%Y%m%d_%H%M}.pdf'
            shift.pdf_file.save(fname, ContentFile(pdf_bytes), save=True)
        except Exception as exc:
            return Response({
                'success': True,
                'warning': f'A PDF jegyzőkönyv generálása nem sikerült: {exc}',
                'shift': FuelShiftSerializer(shift).data,
            })

        return Response({
            'success': True,
            'shift': FuelShiftSerializer(shift).data,
            'pdf_url': request.build_absolute_uri(shift.pdf_file.url),
        })

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """A műszakátadási jegyzőkönyv PDF letöltése (szükség esetén újragenerálva)."""
        shift = self.get_object()
        if shift.status != 'closed':
            return Response({'error': 'Csak lezárt műszakról van jegyzőkönyv.'}, status=400)
        if not shift.pdf_file:
            shift.pdf_file.save(
                f'muszak_{shift.number}.pdf', ContentFile(build_shift_pdf(shift)), save=True
            )
        response = FileResponse(shift.pdf_file.open('rb'), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="muszak_{shift.number}.pdf"'
        return response

    def create(self, request, *args, **kwargs):
        return Response({'error': 'Műszak a /fuel/shifts/open_shift/ actionnel nyitható.'}, status=405)

    def update(self, request, *args, **kwargs):
        return Response({'error': 'Műszak csak a záró actionnel módosítható.'}, status=405)

    def destroy(self, request, *args, **kwargs):
        return Response({'error': 'Műszak nem törölhető.'}, status=405)
