from django.core.management.base import BaseCommand
from apps.manufacturing.models import ProductClass, ProductTemplate, ServiceGroup, Service


# ── Nyomtatási szolgáltatás-csoportok és alkategóriáik ──
# Minden nyomtatási mód egy SZÜLŐ csoport, amelyen belül 4 alkategória (gyermek csoport):
#   - Nyomtatás                        (kód-utótag: _PRINT,     'services' kulcs)
#   - Kötelező kapcsolódó szolgáltatás (kód-utótag: _REQUIRED,  'required' kulcs)
#   - Utómunka                         (kód-utótag: _FINISHING, 'finishing' kulcs)
#   - Kész termékre vonatkozó          (kód-utótag: _PRODUCT,   'product' kulcs)
# Minden csoport és szolgáltatás védett (is_protected=True), placeholder 0 Ft árral.
SUBCATEGORIES = [
    ('PRINT', 'Nyomtatás', 'services'),
    ('REQUIRED', 'Kötelező kapcsolódó szolgáltatás', 'required'),
    ('FINISHING', 'Utómunka', 'finishing'),
    ('PRODUCT', 'Kész termékre vonatkozó', 'product'),
]

# ── Újrahasznosítható Utómunka (finishing) szolgáltatás-definíciók ──
# Több nyomtatási mód is hivatkozhat ugyanarra a szolgáltatásra (M2M tagság).
SVC_LAM_MATT      = {'code': 'LAM_MATT',      'name': 'Fóliázás - matt',       'description': 'Matt fóliázás'}
SVC_LAM_GLOSSY    = {'code': 'LAM_GLOSSY',    'name': 'Fóliázás - fényes',     'description': 'Fényes fóliázás'}
SVC_LAM_SILK      = {'code': 'LAM_SILK',      'name': 'Fóliázás - selyem matt', 'description': 'Selyem matt (soft touch) fóliázás'}
SVC_CUT_STACK     = {'code': 'CUT_STACK',     'name': 'Méretre vágás',         'description': 'Kész nyomat méretre vágása'}
SVC_VARNISH_MATT  = {'code': 'VARNISH_MATT',  'name': 'Lakkozás - matt',       'description': 'Matt lakkozás'}
SVC_VARNISH_GLOSSY = {'code': 'VARNISH_GLOSSY', 'name': 'Lakkozás - fényes',   'description': 'Fényes lakkozás'}
SVC_CONTOUR_CUT   = {'code': 'CONTOUR_CUT',   'name': 'Kontúrvágás',           'description': 'Kontúr (alakra) vágás'}
SVC_EYELET        = {'code': 'EYELET',        'name': 'Gyűrűzés',              'description': 'Ringli (gyűrű) behelyezése'}
SVC_HEMMING       = {'code': 'HEMMING',       'name': 'Szegés',                'description': 'Szélek szegése'}
SVC_STRETCH_FRAME = {'code': 'STRETCH_FRAME', 'name': 'Vakrámázás',            'description': 'Vakrámára feszítés'}

PRINT_SERVICE_GROUPS = [
    {
        'code': 'PRINT_DIGIPRINT_CLICK',
        'name': 'Íves klikkdíjas nyomtatás',
        'description': 'Klikkdíjas íves digitális nyomtatás szolgáltatásai',
        # Nyomtatás alkategória
        'services': [
            {'code': 'DIGIPR_K', 'name': 'Fekete-fehér nyomtatás',
             'description': 'Klikkdíjas fekete-fehér digitális nyomtatás'},
            {'code': 'DIGIPR_CMYK', 'name': 'Színes nyomtatás',
             'description': 'Klikkdíjas színes digitális nyomtatás (CMYK)'},
        ],
        # Kötelező kapcsolódó szolgáltatás alkategória
        'required': [
            {'code': 'CUT_STACK', 'name': 'Méretre vágás',
             'description': 'Kész nyomat méretre vágása'},
            {'code': 'NO_CUT', 'name': 'Ívben',
             'description': 'Vágás nélkül, ívben szállítva'},
        ],
        # Utómunka alkategória
        'finishing': [
            SVC_LAM_MATT,
            SVC_LAM_GLOSSY,
            SVC_LAM_SILK,
            SVC_CUT_STACK,
        ],
        # Kész termékre vonatkozó alkategória
        'product': [
            {'code': 'SHIPPING', 'name': 'Házhozszállítás',
             'description': 'Kész termék házhozszállítása'},
        ],
    },
    {
        'code': 'PRINT_UV_BOARD',
        'name': 'Táblás (UV) nyomtatás',
        'description': 'Táblás UV nyomtatás szolgáltatásai',
        'services': [
            {'code': 'UVPR_BOARD_PROD_CMYK', 'name': 'Színes nyomtatás',
             'description': 'Táblás UV színes nyomtatás (CMYK)'},
            {'code': 'UVPR_BOARD_HR_CMYK', 'name': 'Színes nyomtatás - nagyfelbontás',
             'description': 'Táblás UV színes nyomtatás nagyfelbontásban (CMYK)'},
            {'code': 'UVPR_BOARD_BACKLIT_CMYK', 'name': 'Színes nyomtatás - backlit',
             'description': 'Táblás UV színes backlit nyomtatás (CMYK)'},
            {'code': 'UVPR_BOARD_W', 'name': 'Fehér nyomtatás',
             'description': 'Táblás UV fehér nyomtatás'},
            {'code': 'UVPR_BOARD_CMYK_W', 'name': 'Színes és fehér nyomtatás',
             'description': 'Táblás UV színes és fehér nyomtatás (CMYK + W)'},
        ],
        # Utómunka alkategória
        'finishing': [
            SVC_LAM_MATT,
            SVC_LAM_GLOSSY,
            SVC_VARNISH_MATT,
            SVC_VARNISH_GLOSSY,
            SVC_CUT_STACK,
            SVC_CONTOUR_CUT,
        ],
    },
    {
        'code': 'PRINT_UV_ROLL',
        'name': 'Tekercses (UV) nyomtatás',
        'description': 'Tekercses UV nyomtatás szolgáltatásai',
        'services': [
            {'code': 'UVPR_ROLL_PROD_CMYK', 'name': 'Színes nyomtatás',
             'description': 'Tekercses UV színes nyomtatás (CMYK)'},
            {'code': 'UVPR_ROLL_HR_CMYK', 'name': 'Színes nyomtatás - nagyfelbontás',
             'description': 'Tekercses UV színes nyomtatás nagyfelbontásban (CMYK)'},
            {'code': 'UVPR_ROLL_BACKLIT_CMYK', 'name': 'Színes nyomtatás - backlit',
             'description': 'Tekercses UV színes backlit nyomtatás (CMYK)'},
            {'code': 'UVPR_ROLL_W', 'name': 'Fehér nyomtatás',
             'description': 'Tekercses UV fehér nyomtatás'},
            {'code': 'UVPR_ROLL_CMYK_W', 'name': 'Színes és fehér nyomtatás',
             'description': 'Tekercses UV színes és fehér nyomtatás (CMYK + W)'},
        ],
        # Utómunka alkategória
        'finishing': [
            SVC_LAM_MATT,
            SVC_LAM_GLOSSY,
            SVC_CUT_STACK,
            SVC_CONTOUR_CUT,
            SVC_EYELET,
            SVC_HEMMING,
            SVC_STRETCH_FRAME,
        ],
    },
    {
        'code': 'SCREEN_PRINT',
        'name': 'Szitanyomás',
        'description': 'Szitanyomási szolgáltatások (1-6 szín)',
        'services': [
            {'code': 'SCR_1C', 'name': 'Szitanyomás - 1 szín', 'description': 'Szitanyomás 1 színnel'},
            {'code': 'SCR_2C', 'name': 'Szitanyomás - 2 szín', 'description': 'Szitanyomás 2 színnel'},
            {'code': 'SCR_3C', 'name': 'Szitanyomás - 3 szín', 'description': 'Szitanyomás 3 színnel'},
            {'code': 'SCR_4C', 'name': 'Szitanyomás - 4 szín', 'description': 'Szitanyomás 4 színnel'},
            {'code': 'SCR_5C', 'name': 'Szitanyomás - 5 szín', 'description': 'Szitanyomás 5 színnel'},
            {'code': 'SCR_6C', 'name': 'Szitanyomás - 6 szín', 'description': 'Szitanyomás 6 színnel'},
        ],
    },
    {
        'code': 'PD_PRINT',
        'name': 'Tamponnyomás',
        'description': 'Tamponnyomási szolgáltatások (1-2 szín)',
        'services': [
            {'code': 'PAD_1C', 'name': 'Tamponnyomás - 1 szín', 'description': 'Tamponnyomás 1 színnel'},
            {'code': 'PAD_2C', 'name': 'Tamponnyomás - 2 szín', 'description': 'Tamponnyomás 2 színnel'},
        ],
    },
]


# ── Védett alaptermékek (nyomtatási módonként) ──
# group_code: a termék service_group FK-ja erre a SZÜLŐ csoportra mutat; a
# print_service_options M2M a csoport _PRINT alkategóriájának szolgáltatásaival töltődik fel.
BASE_PRODUCTS = [
    {
        'code': 'SYS_PRINT_CLICK',
        'name': 'Alap íves klikkdíjas nyomtatás',
        'description': 'Rendszer alaptermék - íves klikkdíjas nyomtatás',
        'calculator_type': 'click_sheet_print',
        'category': 'Íves nyomtatás',
        'group_code': 'PRINT_DIGIPRINT_CLICK',
    },
    {
        'code': 'SYS_PRINT_UV_BOARD',
        'name': 'Alap táblás nyomtatás',
        'description': 'Rendszer alaptermék - táblás (UV) nyomtatás',
        'calculator_type': 'sheet_print',
        'category': 'Táblás nyomtatás',
        'group_code': 'PRINT_UV_BOARD',
    },
    {
        'code': 'SYS_PRINT_UV_ROLL',
        'name': 'Alap tekercses nyomtatás',
        'description': 'Rendszer alaptermék - tekercses (UV) nyomtatás',
        'calculator_type': 'roll_print',
        'category': 'Tekercses nyomtatás',
        'group_code': 'PRINT_UV_ROLL',
    },
    {
        'code': 'SYS_PRINT_SCREEN',
        'name': 'Alap szitanyomtatás',
        'description': 'Rendszer alaptermék - szitanyomás',
        'calculator_type': 'screen_print',
        'category': 'Szitanyomás',
        'group_code': 'SCREEN_PRINT',
    },
    {
        'code': 'SYS_PRINT_PAD',
        'name': 'Alap tamponnyomtatás',
        'description': 'Rendszer alaptermék - tamponnyomás',
        'calculator_type': 'pad_print',
        'category': 'Tamponnyomás',
        'group_code': 'PD_PRINT',
    },
]


class Command(BaseCommand):
    help = 'Biztosítja, hogy a védett rendszer-elemek (ServiceGroup, Service, ProductTemplate) léteznek az adatbázisban.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--verbose', action='store_true', help='Részletes kimenet'
        )

    def handle(self, *args, **options):
        self.verbose = options.get('verbose', False)
        self.created_count = 0
        self.updated_count = 0

        # code -> objektum gyorsítótár
        self.groups_by_code = {}            # szülő csoport kódja -> ServiceGroup
        self.print_subgroup_by_parent = {}  # szülő kód -> _PRINT alkategória ServiceGroup
        self.services_by_code = {}

        self._seed_groups_and_services()
        self._seed_base_products()

        self.stdout.write(
            self.style.SUCCESS(
                f'seed_protected_items kész: {self.created_count} létrehozva, {self.updated_count} frissítve.'
            )
        )

    # ── Segéd: védett ServiceGroup biztosítása ──
    def _ensure_group(self, code, name, description='', parent=None):
        sg, created = ServiceGroup.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'description': description,
                'is_protected': True,
                'is_active': True,
                'parent': parent,
            },
        )
        if created:
            self.created_count += 1
            self._log(f'Létrehozva: ServiceGroup "{sg.name}" ({code})')
        else:
            changed = False
            if not sg.is_protected:
                sg.is_protected = True
                changed = True
            if not sg.is_active:
                sg.is_active = True
                changed = True
            if sg.name != name:
                sg.name = name
                changed = True
            if parent is not None and sg.parent_id != parent.id:
                sg.parent = parent
                changed = True
            if changed:
                sg.save()
                self.updated_count += 1
                self._log(f'Frissítve: ServiceGroup "{sg.name}" ({code})')
        return sg

    # ── Segéd: védett Service biztosítása, és kizárólag a megadott csoportba helyezése ──
    def _ensure_service(self, svc_data, group, drop_from=None):
        code = svc_data['code']
        svc, created = Service.objects.get_or_create(
            code=code,
            defaults={
                'name': svc_data['name'],
                'description': svc_data.get('description', ''),
                'unit': 'db',
                'unit_cost_price': 0,
                'unit_selling_price': 0,
                'is_active': True,
                'is_protected': True,
            },
        )
        if created:
            self.created_count += 1
            self._log(f'  Létrehozva: Service "{svc.name}" ({code})')
        else:
            changed = False
            if not svc.is_protected:
                svc.is_protected = True
                changed = True
            if not svc.is_active:
                svc.is_active = True
                changed = True
            if changed:
                svc.save(update_fields=['is_protected', 'is_active'])
                self.updated_count += 1
                self._log(f'  Frissítve: Service "{svc.name}" ({code})')

        if not svc.groups.filter(pk=group.pk).exists():
            svc.groups.add(group)
        # Régi szülő-csoport tagság megszüntetése (átkerült az alkategóriába)
        if drop_from is not None and svc.groups.filter(pk=drop_from.pk).exists():
            svc.groups.remove(drop_from)

        self.services_by_code[code] = svc
        return svc

    # ── 1-2. Szülő csoportok, alkategóriák és szolgáltatások ──
    def _seed_groups_and_services(self):
        for grp in PRINT_SERVICE_GROUPS:
            parent = self._ensure_group(
                grp['code'], grp['name'], grp.get('description', ''), parent=None
            )
            self.groups_by_code[grp['code']] = parent

            for suffix, sub_name, data_key in SUBCATEGORIES:
                sub_code = f"{grp['code']}_{suffix}"
                services = grp.get(data_key, [])
                # A Nyomtatás alkategória mindig létrejön; a többi csak ha van benne szolgáltatás.
                if not services and suffix != 'PRINT':
                    continue
                # A ServiceGroup.name egyedi, ezért a szülő nevével prefixeljük.
                display_name = f"{grp['name']} – {sub_name}"
                sub = self._ensure_group(sub_code, display_name, parent=parent)
                if suffix == 'PRINT':
                    self.print_subgroup_by_parent[grp['code']] = sub
                for svc_data in services:
                    self._ensure_service(svc_data, sub, drop_from=parent)

    # ── 3. Védett alaptermékek ──
    def _seed_base_products(self):
        for prod in BASE_PRODUCTS:
            category = None
            category_name = prod.get('category')
            if category_name:
                category = ProductClass.objects.filter(name=category_name).first()
                if category is None:
                    category = ProductClass.objects.create(name=category_name)
                    self.created_count += 1
                    self._log(f'Létrehozva: ProductClass "{category_name}"')

            parent_group = self.groups_by_code.get(prod['group_code'])

            tpl, tpl_created = ProductTemplate.objects.get_or_create(
                code=prod['code'],
                defaults={
                    'name': prod['name'],
                    'description': prod.get('description', ''),
                    'calculator_type': prod['calculator_type'],
                    'is_active': True,
                    'is_protected': True,
                    'category': category,
                    'service_group': parent_group,
                },
            )
            if tpl_created:
                self.created_count += 1
                self._log(f'Létrehozva: ProductTemplate "{tpl.name}" ({prod["code"]})')
            else:
                changed = False
                if not tpl.is_protected:
                    tpl.is_protected = True
                    changed = True
                if not tpl.is_active:
                    tpl.is_active = True
                    changed = True
                if tpl.calculator_type != prod['calculator_type']:
                    tpl.calculator_type = prod['calculator_type']
                    changed = True
                if category and tpl.category_id != category.id:
                    tpl.category = category
                    changed = True
                if parent_group and tpl.service_group_id != parent_group.id:
                    tpl.service_group = parent_group
                    changed = True
                if changed:
                    tpl.save(update_fields=[
                        'is_protected', 'is_active', 'calculator_type',
                        'category_id', 'service_group_id',
                    ])
                    self.updated_count += 1
                    self._log(f'Frissítve: ProductTemplate "{tpl.name}" ({prod["code"]})')

            # print_service_options feltöltése a _PRINT alkategória szolgáltatásaival
            print_subgroup = self.print_subgroup_by_parent.get(prod['group_code'])
            grp_services = list(print_subgroup.services.all()) if print_subgroup else []
            if grp_services:
                tpl.print_service_options.set(grp_services)
                tpl.allowed_services.add(*grp_services)
                tpl.print_service_options_order = [s.id for s in grp_services]
                tpl.save(update_fields=['print_service_options_order'])

    def _log(self, msg):
        if self.verbose:
            self.stdout.write(f'  {msg}')
