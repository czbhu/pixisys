from django.core.management.base import BaseCommand
from apps.warehouse.models import MaterialGroupApiSync
from django.utils import timezone
from datetime import timedelta


class Command(BaseCommand):
    help = 'Run all active MaterialGroupApiSync entries that are due.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Run all active syncs regardless of interval')
        parser.add_argument('--id', type=int, help='Run a specific sync by ID')

    def handle(self, *args, **options):
        from apps.warehouse.views import _do_sync

        qs = MaterialGroupApiSync.objects.filter(is_active=True)
        if options.get('id'):
            qs = qs.filter(id=options['id'])

        ran = errors = skipped = 0
        for sync in qs:
            if not options.get('force') and not options.get('id'):
                # Check if it's due
                if sync.last_synced_at:
                    due_at = sync.last_synced_at + timedelta(minutes=sync.sync_interval_minutes)
                    if timezone.now() < due_at:
                        skipped += 1
                        continue
            self.stdout.write(f'  Syncing: {sync.material_group.name} — {sync.name} ...')
            try:
                _do_sync(sync)
                self.stdout.write(self.style.SUCCESS(f'    ✓ {sync.last_sync_message}'))
                ran += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'    ✗ {e}'))
                errors += 1

        self.stdout.write(f'\nDone. Ran: {ran}, Errors: {errors}, Skipped (not due): {skipped}')
