from django.core.management.base import BaseCommand
from apps.manufacturing.models import ProductClass, ProductTemplate, ServiceGroup, Service


PROTECTED_SERVICES = [
    {
        'code': 'DIGIPR_CMYK',
        'name': 'Színes nyomtatás',
        'description': 'Klikkdíjas színes digitális nyomtatás (CMYK)',
        'unit': 'db',
        'is_active': True,
        'is_protected': True,
    },
    {
        'code': 'DIGIPR_K',
        'name': 'Fekete-Fehér nyomtatás',
        'description': 'Klikkdíjas fekete-fehér digitális nyomtatás',
        'unit': 'db',
        'is_active': True,
        'is_protected': True,
    },
]

PROTECTED_TEMPLATES_PER_CATEGORY = {
    'Íves nyomtatás': {
        'name': 'Alap íves nyomtatás',
        'code': 'SYS_IVES_ALAP',
        'description': 'Rendszer alap terméksablon - Íves nyomtatás',
        'calculator_type': 'sheet_print',
        'is_active': True,
        'is_protected': True,
    },
    'Táblás nyomtatás': {
        'name': 'Alap táblás nyomtatás',
        'code': 'SYS_TABLAS_ALAP',
        'description': 'Rendszer alap terméksablon - Táblás nyomtatás',
        'calculator_type': 'sheet_print',
        'is_active': True,
        'is_protected': True,
    },
    'Tekercses nyomtatás': {
        'name': 'Alap tekercses nyomtatás',
        'code': 'SYS_TEKERCS_ALAP',
        'description': 'Rendszer alap terméksablon - Tekercses nyomtatás',
        'calculator_type': 'roll_print',
        'is_active': True,
        'is_protected': True,
    },
    'Egyszerű nyomtatás': {
        'name': 'Alap egyszerű nyomtatás',
        'code': 'SYS_EGYSZERU_ALAP',
        'description': 'Rendszer alap terméksablon - Egyszerű nyomtatás',
        'calculator_type': 'generic',
        'is_active': True,
        'is_protected': True,
    },
}


class Command(BaseCommand):
    help = 'Biztosítja, hogy a védett rendszer-elemek (Service, ProductTemplate) léteznek az adatbázisban.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--verbose', action='store_true', help='Részletes kimenet'
        )

    def handle(self, *args, **options):
        verbose = options.get('verbose', False)
        created_count = 0
        updated_count = 0

        # 1. Védett ServiceGroup biztosítása
        sg, sg_created = ServiceGroup.objects.get_or_create(
            name='Védett szolgáltatások',
            defaults={'is_protected': True, 'is_active': True},
        )
        if sg_created:
            created_count += 1
            if verbose:
                self.stdout.write(f'  Létrehozva: ServiceGroup "{sg.name}"')
        elif not sg.is_protected:
            sg.is_protected = True
            sg.save(update_fields=['is_protected'])
            updated_count += 1
            if verbose:
                self.stdout.write(f'  Frissítve: ServiceGroup "{sg.name}" → is_protected=True')

        # 2. Védett Service-ek biztosítása
        for svc_data in PROTECTED_SERVICES:
            code = svc_data['code']
            defaults = {k: v for k, v in svc_data.items() if k != 'code'}
            svc, svc_created = Service.objects.get_or_create(
                code=code,
                defaults=defaults,
            )
            if svc_created:
                svc.groups.add(sg)
                created_count += 1
                if verbose:
                    self.stdout.write(f'  Létrehozva: Service "{svc.name}" ({code})')
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
                    updated_count += 1
                    if verbose:
                        self.stdout.write(f'  Frissítve: Service "{svc.name}" ({code})')
                if not svc.groups.filter(pk=sg.pk).exists():
                    svc.groups.add(sg)

        # 3. Védett ProductTemplate-ek kategóriánként
        for category_name, tpl_data in PROTECTED_TEMPLATES_PER_CATEGORY.items():
            try:
                category = ProductClass.objects.get(name=category_name)
            except ProductClass.DoesNotExist:
                if verbose:
                    self.stdout.write(
                        self.style.WARNING(f'  Kategória nem található: "{category_name}" - kihagyva')
                    )
                continue

            code = tpl_data.get('code')
            # Ellenőrizzük: van-e már védett sablon ebben a kategóriában?
            existing = ProductTemplate.objects.filter(
                category=category, is_protected=True
            ).first()

            if existing:
                # Ha van, de nincs code vagy code eltér, frissítjük
                if existing.code != code:
                    if verbose:
                        self.stdout.write(
                            f'  Meglévő védett sablon: "{existing.name}" (id={existing.id}) - {category_name}'
                        )
                # is_protected biztosítása
                if not existing.is_protected:
                    existing.is_protected = True
                    existing.save(update_fields=['is_protected'])
                    updated_count += 1
            else:
                # Nincs védett sablon → létrehozás
                defaults = {k: v for k, v in tpl_data.items() if k != 'code'}
                defaults['category'] = category
                tpl = ProductTemplate.objects.create(code=code, **defaults)
                created_count += 1
                if verbose:
                    self.stdout.write(f'  Létrehozva: ProductTemplate "{tpl.name}" → {category_name}')

        self.stdout.write(
            self.style.SUCCESS(
                f'seed_protected_items kész: {created_count} létrehozva, {updated_count} frissítve.'
            )
        )
