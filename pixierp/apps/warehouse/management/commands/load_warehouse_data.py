from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.warehouse.models import (
    MaterialType, Material, Warehouse, Shelf, MaterialSupplier, 
    Inventory, MaterialReceipt
)
from apps.crm.models import Company
from decimal import Decimal
from datetime import datetime, timedelta
import random

User = get_user_model()

class Command(BaseCommand):
    help = 'Load sample warehouse data'

    def handle(self, *args, **options):
        self.stdout.write('Loading warehouse sample data...')
        
        # Alapanyag típusok létrehozása
        self.create_material_types()
        
        # Alapanyagok létrehozása
        self.create_materials()
        
        # Raktárak létrehozása
        self.create_warehouses()
        
        # Polcok létrehozása
        self.create_shelves()
        
        # Beszállítók kapcsolása
        self.create_material_suppliers()
        
        # Készlet létrehozása
        self.create_inventory()
        
        # Bevételezések létrehozása
        self.create_receipts()
        
        self.stdout.write(
            self.style.SUCCESS('Successfully loaded warehouse sample data!')
        )

    def create_material_types(self):
        """Alapanyag típusok létrehozása"""
        types_data = [
            {'name': 'Fém', 'description': 'Fém alapanyagok'},
            {'name': 'Műanyag', 'description': 'Műanyag alapanyagok'},
            {'name': 'Elektronika', 'description': 'Elektronikai komponensek'},
            {'name': 'Textil', 'description': 'Textil alapanyagok'},
            {'name': 'Fa', 'description': 'Fa alapanyagok'},
            {'name': 'Üveg', 'description': 'Üveg alapanyagok'},
        ]
        
        for type_data in types_data:
            material_type, created = MaterialType.objects.get_or_create(
                name=type_data['name'],
                defaults={'description': type_data['description']}
            )
            if created:
                self.stdout.write(f'Created material type: {material_type.name}')

    def create_materials(self):
        """Alapanyagok létrehozása"""
        materials_data = [
            {'name': 'Acéllemez 2mm', 'code': 'ACEL-2MM', 'type': 'Fém', 'unit': 'm2', 'min_stock': 100, 'width': 1000, 'length': 2000, 'height': 2, 'dimension_unit': 'mm', 'density': 7850, 'density_unit': 'kg/m3'},
            {'name': 'Alumínium szalag', 'code': 'ALU-SZALAG', 'type': 'Fém', 'unit': 'm', 'min_stock': 50, 'width': 50, 'length': 1000, 'height': 1, 'dimension_unit': 'mm', 'density': 2700, 'density_unit': 'kg/m3'},
            {'name': 'PVC cső 50mm', 'code': 'PVC-50', 'type': 'Műanyag', 'unit': 'm', 'min_stock': 200, 'width': 50, 'length': 1000, 'height': 50, 'dimension_unit': 'mm', 'density': 1350, 'density_unit': 'kg/m3'},
            {'name': 'ABS granulátum', 'code': 'ABS-GRAN', 'type': 'Műanyag', 'unit': 'kg', 'min_stock': 500, 'density': 1050, 'density_unit': 'kg/m3'},
            {'name': 'LED dióda', 'code': 'LED-5MM', 'type': 'Elektronika', 'unit': 'db', 'min_stock': 1000, 'width': 5, 'length': 5, 'height': 2, 'dimension_unit': 'mm'},
            {'name': 'Ellenállás 1kΩ', 'code': 'R-1K', 'type': 'Elektronika', 'unit': 'db', 'min_stock': 2000, 'width': 2, 'length': 6, 'height': 2, 'dimension_unit': 'mm'},
            {'name': 'Pamut szövet', 'code': 'PAMUT-100', 'type': 'Textil', 'unit': 'm2', 'min_stock': 100, 'width': 1000, 'length': 1000, 'height': 1, 'dimension_unit': 'mm', 'density': 150, 'density_unit': 'g/cm3'},
            {'name': 'Tölgyfa deszka', 'code': 'TOLGY-25', 'type': 'Fa', 'unit': 'm2', 'min_stock': 20, 'width': 200, 'length': 2000, 'height': 25, 'dimension_unit': 'mm', 'density': 750, 'density_unit': 'kg/m3'},
            {'name': 'Üveglap 4mm', 'code': 'UVE-4MM', 'type': 'Üveg', 'unit': 'm2', 'min_stock': 10, 'width': 1000, 'length': 1000, 'height': 4, 'dimension_unit': 'mm', 'density': 2500, 'density_unit': 'kg/m3'},
            {'name': 'Rézdrót 1mm', 'code': 'REZ-1MM', 'type': 'Fém', 'unit': 'm', 'min_stock': 100, 'width': 1, 'length': 1000, 'height': 1, 'dimension_unit': 'mm', 'density': 8960, 'density_unit': 'kg/m3'},
        ]
        
        for material_data in materials_data:
            material_type = MaterialType.objects.get(name=material_data['type'])
            material, created = Material.objects.get_or_create(
                code=material_data['code'],
                defaults={
                    'name': material_data['name'],
                    'material_type': material_type,
                    'unit': material_data['unit'],
                    'min_stock_level': material_data['min_stock'],
                    'width': material_data.get('width'),
                    'length': material_data.get('length'),
                    'height': material_data.get('height'),
                    'dimension_unit': material_data.get('dimension_unit', 'mm'),
                    'density': material_data.get('density'),
                    'density_unit': material_data.get('density_unit', 'kg/m3'),
                    'created_by': User.objects.first()
                }
            )
            if created:
                self.stdout.write(f'Created material: {material.name}')

    def create_warehouses(self):
        """Raktárak létrehozása"""
        warehouses_data = [
            {'name': 'Főraktár', 'code': 'MAIN', 'address': '1234 Budapest, Raktár utca 1.'},
            {'name': 'Kisegítő raktár', 'code': 'AUX', 'address': '1234 Budapest, Kisegítő utca 5.'},
            {'name': 'Hűtött raktár', 'code': 'COLD', 'address': '1234 Budapest, Hűtött utca 10.'},
        ]
        
        for warehouse_data in warehouses_data:
            warehouse, created = Warehouse.objects.get_or_create(
                code=warehouse_data['code'],
                defaults={
                    'name': warehouse_data['name'],
                    'address': warehouse_data['address']
                }
            )
            if created:
                self.stdout.write(f'Created warehouse: {warehouse.name}')

    def create_shelves(self):
        """Polcok létrehozása"""
        shelves_data = [
            {'warehouse': 'MAIN', 'name': 'A-1', 'code': 'A1', 'description': 'Fém alapanyagok'},
            {'warehouse': 'MAIN', 'name': 'A-2', 'code': 'A2', 'description': 'Műanyag alapanyagok'},
            {'warehouse': 'MAIN', 'name': 'B-1', 'code': 'B1', 'description': 'Elektronikai komponensek'},
            {'warehouse': 'MAIN', 'name': 'B-2', 'code': 'B2', 'description': 'Textil alapanyagok'},
            {'warehouse': 'AUX', 'name': 'C-1', 'code': 'C1', 'description': 'Fa alapanyagok'},
            {'warehouse': 'AUX', 'name': 'C-2', 'code': 'C2', 'description': 'Üveg alapanyagok'},
            {'warehouse': 'COLD', 'name': 'D-1', 'code': 'D1', 'description': 'Hűtött tárolás'},
        ]
        
        for shelf_data in shelves_data:
            warehouse = Warehouse.objects.get(code=shelf_data['warehouse'])
            shelf, created = Shelf.objects.get_or_create(
                warehouse=warehouse,
                code=shelf_data['code'],
                defaults={
                    'name': shelf_data['name'],
                    'description': shelf_data['description']
                }
            )
            if created:
                self.stdout.write(f'Created shelf: {shelf.name} in {warehouse.name}')

    def create_material_suppliers(self):
        """Alapanyag beszállítók kapcsolása"""
        materials = Material.objects.all()
        suppliers = Company.objects.filter(company_type='supplier')
        
        if not suppliers.exists():
            # Ha nincsenek beszállítók, hozzunk létre néhányat
            suppliers_data = [
                {'name': 'Fém Kft.', 'company_type': 'supplier'},
                {'name': 'Műanyag Zrt.', 'company_type': 'supplier'},
                {'name': 'Elektronika Kft.', 'company_type': 'supplier'},
            ]
            
            for supplier_data in suppliers_data:
                supplier, created = Company.objects.get_or_create(
                    name=supplier_data['name'],
                    defaults={
                        'company_type': supplier_data['company_type'],
                        'tax_number': f"{random.randint(10000000, 99999999)}-1-41",
                        'country': 'Magyarország',
                        'postal_code': '1000',
                        'city': 'Budapest',
                        'street_name': 'Beszállító utca',
                        'street_type': 'utca',
                        'house_number': str(random.randint(1, 100))
                    }
                )
                if created:
                    self.stdout.write(f'Created supplier: {supplier.name}')
            
            suppliers = Company.objects.filter(company_type='supplier')
        
        # Beszállítók hozzárendelése az alapanyagokhoz
        for material in materials:
            # Minden alapanyaghoz 1-3 beszállítót rendelünk
            num_suppliers = random.randint(1, min(3, suppliers.count()))
            selected_suppliers = random.sample(list(suppliers), num_suppliers)
            
            for i, supplier in enumerate(selected_suppliers):
                is_primary = i == 0  # Az első beszállító az elsődleges
                unit_price = random.uniform(100, 5000)
                
                material_supplier, created = MaterialSupplier.objects.get_or_create(
                    material=material,
                    supplier=supplier,
                    defaults={
                        'supplier_code': f"{supplier.name[:3].upper()}-{material.code}",
                        'unit_price': unit_price,
                        'currency': 'HUF',
                        'is_primary': is_primary
                    }
                )
                if created:
                    self.stdout.write(f'Created supplier for {material.name}: {supplier.name}')

    def create_inventory(self):
        """Készlet létrehozása"""
        materials = Material.objects.all()
        warehouses = Warehouse.objects.all()
        shelves = Shelf.objects.all()
        
        for material in materials:
            # Minden alapanyaghoz 1-2 raktárban készletet hozunk létre
            num_warehouses = random.randint(1, min(2, warehouses.count()))
            selected_warehouses = random.sample(list(warehouses), num_warehouses)
            
            for warehouse in selected_warehouses:
                # Válasszunk egy polcot a raktárból
                warehouse_shelves = shelves.filter(warehouse=warehouse)
                if warehouse_shelves.exists():
                    shelf = random.choice(warehouse_shelves)
                    quantity = random.uniform(0, float(material.min_stock_level) * 2)
                    
                    inventory, created = Inventory.objects.get_or_create(
                        material=material,
                        warehouse=warehouse,
                        shelf=shelf,
                        defaults={'quantity': quantity}
                    )
                    if created:
                        self.stdout.write(f'Created inventory: {material.name} in {warehouse.name} - {shelf.name}')

    def create_receipts(self):
        """Bevételezések létrehozása"""
        materials = Material.objects.all()
        suppliers = Company.objects.filter(company_type='supplier')
        warehouses = Warehouse.objects.all()
        shelves = Shelf.objects.all()
        
        # 10-15 bevételezést hozunk létre
        num_receipts = random.randint(10, 15)
        
        for i in range(num_receipts):
            material = random.choice(materials)
            supplier = random.choice(suppliers)
            warehouse = random.choice(warehouses)
            warehouse_shelves = shelves.filter(warehouse=warehouse)
            shelf = random.choice(warehouse_shelves) if warehouse_shelves.exists() else None
            
            if shelf:
                # Beszállító árának meghatározása
                material_supplier = MaterialSupplier.objects.filter(
                    material=material, supplier=supplier
                ).first()
                
                if material_supplier:
                    unit_price = material_supplier.unit_price
                else:
                    unit_price = Decimal(str(random.uniform(100, 5000)))
                
                quantity = Decimal(str(random.uniform(10, 100)))
                receipt_date = datetime.now() - timedelta(days=random.randint(1, 30))
                
                receipt, created = MaterialReceipt.objects.get_or_create(
                    receipt_number=f"BR-{i+1:04d}",
                    defaults={
                        'material': material,
                        'supplier': supplier,
                        'warehouse': warehouse,
                        'shelf': shelf,
                        'quantity': quantity,
                        'unit_price': unit_price,
                        'currency': 'HUF',
                        'status': random.choice(['pending', 'received']),
                        'receipt_date': receipt_date,
                        'notes': f'Bevételezés {i+1}',
                        'created_by': User.objects.first()
                    }
                )
                if created:
                    self.stdout.write(f'Created receipt: {receipt.receipt_number}')
