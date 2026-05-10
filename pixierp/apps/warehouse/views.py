from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Sum
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
import requests
from datetime import datetime, date
from .nav_invoice_service import NavInvoiceService
from .models import (
    MaterialType, MaterialGroup, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialCostItem, MaterialSize,
    MaterialStock, MaterialReceipt, StockMovement,
    SupplierInvoice, InvoiceItem,
    ScrapRecord, ScrapItem
)
from .serializers import (
    MaterialTypeSerializer, MaterialGroupSerializer, MaterialSerializer, WarehouseSerializer, 
    ShelfSerializer, MaterialSupplierSerializer, InventorySerializer, 
    MaterialCostItemSerializer, MaterialSizeSerializer,
    MaterialStockSerializer, MaterialReceiptSerializer, StockMovementSerializer,
    SupplierInvoiceSerializer, InvoiceItemSerializer,
    ScrapRecordSerializer, ScrapItemSerializer
)
from apps.crm.models import Company

class LargeResultsSetPagination(PageNumberPagination):
    page_size = 1000
    page_size_query_param = 'page_size'
    max_page_size = 10000

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
        queryset = MaterialGroup.objects.all()
        
        # Szűrés aktív státusz szerint
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Keresés név szerint
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        return queryset.order_by('name')
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)




class MaterialViewSet(viewsets.ModelViewSet):
    """Alapanyagok/Termékek kezelése"""
    queryset = Material.objects.all()
    serializer_class = MaterialSerializer
    pagination_class = LargeResultsSetPagination
    
    def get_queryset(self):
        queryset = Material.objects.all()
        material_type = self.request.query_params.get('material_type', None)
        filter_type = self.request.query_params.get('filter_type', None)
        search = self.request.query_params.get('search', None)
        material_group = self.request.query_params.get('material_group', None)
        supplier = self.request.query_params.get('supplier', None)
        
        if material_type:
            queryset = queryset.filter(material_type_id=material_type)
        
        # Szűrés típus szerint: materials, products, vagy mind
        if filter_type == 'materials':
            queryset = queryset.filter(is_material=True)
        elif filter_type == 'products':
            queryset = queryset.filter(is_product=True)
        # Ha 'all' vagy nincs megadva, akkor mindent mutat
        
        if material_group:
            queryset = queryset.filter(material_group_id=material_group)
        
        if supplier:
            queryset = queryset.filter(default_supplier_id=supplier)
        
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | 
                Q(code__icontains=search) |
                Q(description__icontains=search)
            )
        
        return queryset

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
        
        return queryset
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


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
                'https://inv.pixisys.eu/api/vat-types/',
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
