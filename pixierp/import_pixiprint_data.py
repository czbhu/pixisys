#!/usr/bin/env python
"""
PixiPrint alapú termékek, szolgáltatások és kalkulátor sablonok feltöltése
"""
import os
import sys
import django

# Django setup
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from apps.manufacturing.models import Service, CalculatorTemplate
from apps.warehouse.models import Material, MaterialType
from django.contrib.auth import get_user_model

User = get_user_model()

def create_material_types():
    """Alapanyag típusok létrehozása"""
    types_data = [
        ("Ponyva", "Nyomtatható ponyva anyagok - frontlit, kamion ponyva, épületháló"),
        ("Fólia", "Öntapadós és speciális fóliák"),
        ("Textil", "Textil alapanyagok nyomtatáshoz"),
        ("Plexi", "Plexiüveg lemezek"),
        ("Habosított PVC", "Habosított PVC táblák"),
        ("Fa rétegelt lemez", "Rétegelt fa lemezek"),
        ("Alumínium kompozit", "Alumínium kompozit táblák"),
        ("Polikarbonát", "Polikarbonát lemezek"),
        ("Mágnesfólia", "Mágneses alapanyagok"),
        ("Kültéri papír", "Kültéri papír anyagok"),
        ("Vinyl", "Vinyl fóliák"),
    ]
    
    created = []
    for name, desc in types_data:
        mat_type, is_new = MaterialType.objects.get_or_create(
            name=name,
            defaults={"description": desc}
        )
        if is_new:
            created.append(name)
            print(f"✓ Létrehozva: {name}")
        else:
            print(f"  Már létezik: {name}")
    
    return created

def create_materials():
    """Alapanyagok létrehozása pixiprint.hu alapján"""
    
    materials_data = [
        # PONYVA
        {
            "name": "510 gr Frontlit ponyva",
            "code": "PONYVA_510",
            "type": "Ponyva",
            "format": "roll",
            "roll_width": 320,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "670 gr Kamion ponyva",
            "code": "PONYVA_670",
            "type": "Ponyva",
            "format": "roll",
            "roll_width": 320,
            "yield": 93.0,
            "unit": "m",
        },
        {
            "name": "270 gr Épületháló",
            "code": "EPULETHALO_270",
            "type": "Ponyva",
            "format": "roll",
            "roll_width": 320,
            "yield": 90.0,
            "unit": "m",
        },
        {
            "name": "Átvilágítható ponyva (backlit)",
            "code": "PONYVA_BACKLIT",
            "type": "Ponyva",
            "format": "roll",
            "roll_width": 320,
            "yield": 95.0,
            "unit": "m",
        },
        
        # FÓLIA
        {
            "name": "2D vinyl fólia",
            "code": "VINYL_2D",
            "type": "Vinyl",
            "format": "roll",
            "roll_width": 137,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "3D vinyl fólia (karbon hatás)",
            "code": "VINYL_3D",
            "type": "Vinyl",
            "format": "roll",
            "roll_width": 137,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "Perforált ablakfólia",
            "code": "FOLIA_PERFORALT",
            "type": "Fólia",
            "format": "roll",
            "roll_width": 137,
            "yield": 92.0,
            "unit": "m",
        },
        {
            "name": "Padlómatrica fólia",
            "code": "FOLIA_PADLO",
            "type": "Fólia",
            "format": "roll",
            "roll_width": 137,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "Fehér mágnesfólia 0.6mm",
            "code": "MAGNES_06",
            "type": "Mágnesfólia",
            "format": "roll",
            "roll_width": 100,
            "yield": 95.0,
            "unit": "m",
        },
        
        # TEXTIL
        {
            "name": "Festővászon",
            "code": "TEXTIL_VASZON",
            "type": "Textil",
            "format": "roll",
            "roll_width": 160,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "Textil (standard)",
            "code": "TEXTIL_STD",
            "type": "Textil",
            "format": "roll",
            "roll_width": 160,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "Fényzáró textil",
            "code": "TEXTIL_FENYZARO",
            "type": "Textil",
            "format": "roll",
            "roll_width": 160,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "Átvilágítható textil",
            "code": "TEXTIL_BACKLIT",
            "type": "Textil",
            "format": "roll",
            "roll_width": 250,
            "yield": 95.0,
            "unit": "m",
        },
        
        # HABOSÍTOTT PVC - TÁBLÁS
        {
            "name": "Habosított PVC 3mm",
            "code": "PVC_HAB_3",
            "type": "Habosított PVC",
            "format": "sheet",
            "sheet_division": "full",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Habosított PVC 5mm",
            "code": "PVC_HAB_5",
            "type": "Habosított PVC",
            "format": "sheet",
            "sheet_division": "full",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Habosított PVC 10mm",
            "code": "PVC_HAB_10",
            "type": "Habosított PVC",
            "format": "sheet",
            "sheet_division": "half",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Habosított PVC 19mm",
            "code": "PVC_HAB_19",
            "type": "Habosított PVC",
            "format": "sheet",
            "sheet_division": "half",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        
        # PLEXI - TÁBLÁS
        {
            "name": "Plexi víztiszta 3mm",
            "code": "PLEXI_VT_3",
            "type": "Plexi",
            "format": "sheet",
            "sheet_division": "third",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Plexi víztiszta 5mm",
            "code": "PLEXI_VT_5",
            "type": "Plexi",
            "format": "sheet",
            "sheet_division": "third",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Plexi opál 3mm",
            "code": "PLEXI_OPAL_3",
            "type": "Plexi",
            "format": "sheet",
            "sheet_division": "third",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Plexi opál 5mm",
            "code": "PLEXI_OPAL_5",
            "type": "Plexi",
            "format": "sheet",
            "sheet_division": "third",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        
        # FA RÉTEGELT LEMEZ - TÁBLÁS
        {
            "name": "Fa rétegelt lemez 12mm",
            "code": "FA_12",
            "type": "Fa rétegelt lemez",
            "format": "sheet",
            "sheet_division": "half",
            "yield": 100.0,
            "unit": "m2",
            "width": 153,
            "length": 153,
        },
        {
            "name": "Fa rétegelt lemez 18mm",
            "code": "FA_18",
            "type": "Fa rétegelt lemez",
            "format": "sheet",
            "sheet_division": "half",
            "yield": 100.0,
            "unit": "m2",
            "width": 153,
            "length": 153,
        },
        
        # ALUMÍNIUM KOMPOZIT - TÁBLÁS
        {
            "name": "Alumínium kompozit 3mm (fehér-fehér)",
            "code": "ALU_KOMP_3",
            "type": "Alumínium kompozit",
            "format": "sheet",
            "sheet_division": "full",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        
        # POLIKARBONÁT - TÁBLÁS
        {
            "name": "Tömör polikarbonát 3mm víztiszta",
            "code": "POLIKARB_3",
            "type": "Polikarbonát",
            "format": "sheet",
            "sheet_division": "third",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        {
            "name": "Tömör polikarbonát 5mm víztiszta",
            "code": "POLIKARB_5",
            "type": "Polikarbonát",
            "format": "sheet",
            "sheet_division": "third",
            "yield": 100.0,
            "unit": "m2",
            "width": 205,
            "length": 305,
        },
        
        # PAPÍR
        {
            "name": "Blueback plakátpapír",
            "code": "PAPER_BLUEBACK",
            "type": "Kültéri papír",
            "format": "roll",
            "roll_width": 152,
            "yield": 95.0,
            "unit": "m",
        },
        {
            "name": "Citylight papír",
            "code": "PAPER_CITYLIGHT",
            "type": "Kültéri papír",
            "format": "roll",
            "roll_width": 152,
            "yield": 95.0,
            "unit": "m",
        },
    ]
    
    created_count = 0
    for mat_data in materials_data:
        mat_type = MaterialType.objects.get(name=mat_data["type"])
        
        defaults = {
            "name": mat_data["name"],
            "material_type": mat_type,
            "unit": mat_data["unit"],
            "material_format": mat_data["format"],
            "yield_percentage": mat_data["yield"],
        }
        
        if mat_data["format"] == "roll":
            defaults["roll_width"] = mat_data["roll_width"]
        elif mat_data["format"] == "sheet":
            defaults["sheet_division"] = mat_data["sheet_division"]
            defaults["width"] = mat_data["width"]
            defaults["length"] = mat_data["length"]
            defaults["dimension_unit"] = "cm"
        
        material, created = Material.objects.get_or_create(
            code=mat_data["code"],
            defaults=defaults
        )
        
        if created:
            created_count += 1
            print(f"✓ Létrehozva: {mat_data['name']}")
        else:
            print(f"  Már létezik: {mat_data['name']}")
    
    return created_count

def create_services():
    """Szolgáltatások létrehozása pixiprint.hu alapján"""
    
    services_data = [
        # NYOMTATÁS
        {
            "name": "UV nyomtatás CMYK (tekercses)",
            "code": "PRINT_CMYK_ROLL",
            "category": "Nyomtatás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 1500.00,
        },
        {
            "name": "UV nyomtatás CMYK+W fehér alappal (tekercses)",
            "code": "PRINT_CMYKW_ROLL",
            "category": "Nyomtatás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 2200.00,
        },
        {
            "name": "UV nyomtatás CMYK (táblás)",
            "code": "PRINT_CMYK_SHEET",
            "category": "Nyomtatás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 2500.00,
        },
        {
            "name": "UV nyomtatás CMYK+W fehér alappal (táblás)",
            "code": "PRINT_CMYKW_SHEET",
            "category": "Nyomtatás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 3200.00,
        },
        {
            "name": "Lakkozás (fényes védőlakk)",
            "code": "VARNISH",
            "category": "Nyomtatás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 800.00,
        },
        
        # VÁGÁS
        {
            "name": "Méretre vágás (egyenes)",
            "code": "CUT_STRAIGHT",
            "category": "Vágás",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 150.00,
        },
        {
            "name": "Formára vágás (lézervágás)",
            "code": "CUT_LASER",
            "category": "Vágás",
            "unit": "m",
            "calculation_basis": "perimeter",
            "unit_price": 500.00,
        },
        {
            "name": "Kontúrvágás (plotter)",
            "code": "CUT_CONTOUR",
            "category": "Vágás",
            "unit": "m",
            "calculation_basis": "perimeter",
            "unit_price": 300.00,
        },
        
        # KONFEKCIONÁLÁS - PONYVA
        {
            "name": "Visszaszegés (ponyva szegély)",
            "code": "SEWING_EDGE",
            "category": "Konfekcionálás",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 250.00,
        },
        {
            "name": "Ringlizés 25cm-ként",
            "code": "GROMMET_25",
            "category": "Konfekcionálás",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 220.00,
        },
        {
            "name": "Ringlizés 50cm-ként",
            "code": "GROMMET_50",
            "category": "Konfekcionálás",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 150.00,
        },
        {
            "name": "Ringlizés 100cm-ként",
            "code": "GROMMET_100",
            "category": "Konfekcionálás",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 100.00,
        },
        {
            "name": "Bújtató (hosszabb oldal)",
            "code": "POCKET_LONG",
            "category": "Konfekcionálás",
            "unit": "m",
            "calculation_basis": "length",
            "unit_price": 350.00,
        },
        {
            "name": "Bújtató (rövidebb oldal)",
            "code": "POCKET_SHORT",
            "category": "Konfekcionálás",
            "unit": "m",
            "calculation_basis": "length",
            "unit_price": 350.00,
        },
        {
            "name": "Hegesztés (sávok összekapcsolása)",
            "code": "WELDING",
            "category": "Konfekcionálás",
            "unit": "m",
            "calculation_basis": "length",
            "unit_price": 400.00,
        },
        
        # CSOMAGOLÁS
        {
            "name": "Tekercsben csomagolás",
            "code": "PACK_ROLL",
            "category": "Csomagolás",
            "unit": "db",
            "calculation_basis": "quantity",
            "unit_price": 500.00,
        },
        {
            "name": "Kartondobozos csomagolás",
            "code": "PACK_BOX",
            "category": "Csomagolás",
            "unit": "db",
            "calculation_basis": "quantity",
            "unit_price": 800.00,
        },
        
        # KERETEZÉS
        {
            "name": "Fakeretbe készítés",
            "code": "FRAME_WOOD",
            "category": "Keretezés",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 1200.00,
        },
        {
            "name": "Alumínium keretbe készítés",
            "code": "FRAME_ALU",
            "category": "Keretezés",
            "unit": "perimeter",
            "calculation_basis": "perimeter",
            "unit_price": 1800.00,
        },
        {
            "name": "Rögzítőléc (felső/alsó)",
            "code": "HANGING_RAIL",
            "category": "Keretezés",
            "unit": "m",
            "calculation_basis": "length",
            "unit_price": 600.00,
        },
        
        # RAGASZTÁS / KASÍROZÁS
        {
            "name": "Öntapadós fóliázás",
            "code": "LAMINATE_ADHESIVE",
            "category": "Kasírozás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 500.00,
        },
        {
            "name": "Hab ragasztás (3mm)",
            "code": "FOAM_MOUNT_3",
            "category": "Kasírozás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 800.00,
        },
        {
            "name": "Hab ragasztás (5mm)",
            "code": "FOAM_MOUNT_5",
            "category": "Kasírozás",
            "unit": "m2",
            "calculation_basis": "area",
            "unit_price": 1000.00,
        },
    ]
    
    created_count = 0
    for svc_data in services_data:
        service, created = Service.objects.get_or_create(
            code=svc_data["code"],
            defaults=svc_data
        )
        
        if created:
            created_count += 1
            print(f"✓ Létrehozva: {svc_data['name']}")
        else:
            print(f"  Már létezik: {svc_data['name']}")
    
    return created_count

def create_calculator_templates():
    """Kalkulátor sablonok létrehozása"""
    
    templates_data = [
        {
            "name": "Ponyva nyomtatás",
            "code": "CALC_PONYVA",
            "description": "Ponyva/molinó nyomtatás kalkulátor - frontlit, kamion ponyva, épületháló",
            "material_markup": 30.0,
            "service_markup": 40.0,
            "materials": ["PONYVA_510", "PONYVA_670", "EPULETHALO_270", "PONYVA_BACKLIT"],
            "services": [
                "PRINT_CMYK_ROLL", "PRINT_CMYKW_ROLL", "CUT_STRAIGHT",
                "SEWING_EDGE", "GROMMET_25", "GROMMET_50", "GROMMET_100",
                "POCKET_LONG", "POCKET_SHORT", "WELDING", "PACK_ROLL"
            ],
        },
        {
            "name": "Vinyl fólia",
            "code": "CALC_VINYL",
            "description": "Vinyl fólia nyomtatás és vágás - 2D/3D vinyl, perforált fólia",
            "material_markup": 35.0,
            "service_markup": 45.0,
            "materials": ["VINYL_2D", "VINYL_3D", "FOLIA_PERFORALT", "FOLIA_PADLO"],
            "services": [
                "PRINT_CMYK_ROLL", "PRINT_CMYKW_ROLL", "CUT_CONTOUR",
                "LAMINATE_ADHESIVE", "PACK_ROLL"
            ],
        },
        {
            "name": "Textil nyomtatás",
            "code": "CALC_TEXTIL",
            "description": "Textil alapú nyomatok - vászon, fényzáró, átvilágítható textil",
            "material_markup": 33.0,
            "service_markup": 43.0,
            "materials": ["TEXTIL_VASZON", "TEXTIL_STD", "TEXTIL_FENYZARO", "TEXTIL_BACKLIT"],
            "services": [
                "PRINT_CMYK_ROLL", "PRINT_CMYKW_ROLL", "CUT_STRAIGHT",
                "SEWING_EDGE", "POCKET_LONG", "POCKET_SHORT", "HANGING_RAIL",
                "PACK_ROLL"
            ],
        },
        {
            "name": "Habosított PVC tábla",
            "code": "CALC_PVC_HAB",
            "description": "Habosított PVC táblák nyomtatása - 3/5/10/19mm vastagságban",
            "material_markup": 37.0,
            "service_markup": 47.0,
            "materials": ["PVC_HAB_3", "PVC_HAB_5", "PVC_HAB_10", "PVC_HAB_19"],
            "services": [
                "PRINT_CMYK_SHEET", "PRINT_CMYKW_SHEET", "VARNISH",
                "CUT_STRAIGHT", "CUT_LASER", "FOAM_MOUNT_3", "FOAM_MOUNT_5",
                "PACK_BOX"
            ],
        },
        {
            "name": "Plexi tábla",
            "code": "CALC_PLEXI",
            "description": "Plexiüveg táblák nyomtatása - víztiszta és opál változatban",
            "material_markup": 40.0,
            "service_markup": 50.0,
            "materials": ["PLEXI_VT_3", "PLEXI_VT_5", "PLEXI_OPAL_3", "PLEXI_OPAL_5"],
            "services": [
                "PRINT_CMYK_SHEET", "PRINT_CMYKW_SHEET", "VARNISH",
                "CUT_LASER", "FOAM_MOUNT_3", "FRAME_ALU", "PACK_BOX"
            ],
        },
        {
            "name": "Fa rétegelt lemez",
            "code": "CALC_FA",
            "description": "Fa rétegelt lemezek nyomtatása - 12/18mm vastagságban",
            "material_markup": 38.0,
            "service_markup": 48.0,
            "materials": ["FA_12", "FA_18"],
            "services": [
                "PRINT_CMYK_SHEET", "PRINT_CMYKW_SHEET", "VARNISH",
                "CUT_LASER", "FRAME_WOOD", "PACK_BOX"
            ],
        },
        {
            "name": "Alumínium kompozit",
            "code": "CALC_ALU",
            "description": "Alumínium kompozit lemezek nyomtatása - 3mm",
            "material_markup": 39.0,
            "service_markup": 49.0,
            "materials": ["ALU_KOMP_3"],
            "services": [
                "PRINT_CMYK_SHEET", "PRINT_CMYKW_SHEET", "VARNISH",
                "CUT_STRAIGHT", "CUT_LASER", "FRAME_ALU", "PACK_BOX"
            ],
        },
        {
            "name": "Polikarbonát",
            "code": "CALC_POLIKARB",
            "description": "Polikarbonát lemezek nyomtatása - 3/5mm víztiszta",
            "material_markup": 41.0,
            "service_markup": 51.0,
            "materials": ["POLIKARB_3", "POLIKARB_5"],
            "services": [
                "PRINT_CMYK_SHEET", "PRINT_CMYKW_SHEET", "VARNISH",
                "CUT_LASER", "FOAM_MOUNT_3", "FRAME_ALU", "PACK_BOX"
            ],
        },
        {
            "name": "Kültéri papír (plakát)",
            "code": "CALC_PAPER",
            "description": "Kültéri papír plakátok - Blueback, Citylight",
            "material_markup": 27.0,
            "service_markup": 37.0,
            "materials": ["PAPER_BLUEBACK", "PAPER_CITYLIGHT"],
            "services": [
                "PRINT_CMYK_ROLL", "CUT_STRAIGHT", "LAMINATE_ADHESIVE",
                "PACK_ROLL"
            ],
        },
        {
            "name": "Mágnesfólia",
            "code": "CALC_MAGNES",
            "description": "Mágnesfólia nyomtatás - 0.6mm fehér mágneses alapanyag",
            "material_markup": 43.0,
            "service_markup": 53.0,
            "materials": ["MAGNES_06"],
            "services": [
                "PRINT_CMYK_ROLL", "PRINT_CMYKW_ROLL", "CUT_CONTOUR",
                "LAMINATE_ADHESIVE", "PACK_BOX"
            ],
        },
    ]
    
    created_count = 0
    for tmpl_data in templates_data:
        template, created = CalculatorTemplate.objects.get_or_create(
            code=tmpl_data["code"],
            defaults={
                "name": tmpl_data["name"],
                "description": tmpl_data["description"],
                "default_material_markup_percentage": tmpl_data["material_markup"],
                "default_service_markup_percentage": tmpl_data["service_markup"],
                "default_markup_percentage": (tmpl_data["material_markup"] + tmpl_data["service_markup"]) / 2,  # Átlag kompatibilitásért
            }
        )
        
        if created or True:  # Mindig frissítjük a kapcsolatokat
            # Alapanyagok hozzáadása
            materials = Material.objects.filter(code__in=tmpl_data["materials"])
            template.allowed_materials.set(materials)
            
            # Szolgáltatások hozzáadása
            services = Service.objects.filter(code__in=tmpl_data["services"])
            template.allowed_services.set(services)
            
            if created:
                created_count += 1
                print(f"✓ Létrehozva: {tmpl_data['name']} ({materials.count()} anyag, {services.count()} szolgáltatás)")
            else:
                print(f"  Frissítve: {tmpl_data['name']} ({materials.count()} anyag, {services.count()} szolgáltatás)")
    
    return created_count

def main():
    print("=" * 60)
    print("PixiPrint termékek importálása")
    print("=" * 60)
    
    print("\n1. Alapanyag típusok...")
    create_material_types()
    
    print("\n2. Alapanyagok...")
    mat_count = create_materials()
    
    print("\n3. Szolgáltatások...")
    svc_count = create_services()
    
    print("\n4. Kalkulátor sablonok...")
    tmpl_count = create_calculator_templates()
    
    print("\n" + "=" * 60)
    print("ÖSSZEGZÉS")
    print("=" * 60)
    print(f"Alapanyag típusok: {MaterialType.objects.count()} db")
    print(f"Alapanyagok: {Material.objects.count()} db (ebből {mat_count} új)")
    print(f"Szolgáltatások: {Service.objects.count()} db (ebből {svc_count} új)")
    print(f"Kalkulátor sablonok: {CalculatorTemplate.objects.count()} db")
    print("=" * 60)
    print("✓ KÉSZ!")

if __name__ == "__main__":
    main()
