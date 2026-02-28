from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from invoices.models import CronJobConfiguration


RANGES = [
    (0, 59),   # minute
    (0, 23),   # hour
    (1, 31),   # day of month
    (1, 12),   # month
    (0, 6),    # weekday (monday=0)
]


def _parse_token(token, minimum, maximum):
    token = (token or '').strip()
    if token == '*':
        return set(range(minimum, maximum + 1))

    allowed = set()
    for piece in token.split(','):
        piece = piece.strip()
        if not piece:
            raise ValueError('Üres cron rész')

        step = 1
        base = piece
        if '/' in piece:
            base, step_raw = piece.split('/', 1)
            if not step_raw.isdigit() or int(step_raw) <= 0:
                raise ValueError(f'Hibás lépésérték: {piece}')
            step = int(step_raw)

        if base in ('', '*'):
            start, end = minimum, maximum
        elif '-' in base:
            start_raw, end_raw = base.split('-', 1)
            if not start_raw.isdigit() or not end_raw.isdigit():
                raise ValueError(f'Hibás tartomány: {piece}')
            start, end = int(start_raw), int(end_raw)
        else:
            if not base.isdigit():
                raise ValueError(f'Hibás mező: {piece}')
            start = end = int(base)

        if start < minimum or end > maximum or start > end:
            raise ValueError(f'Mező határon kívül: {piece}')

        for number in range(start, end + 1, step):
            allowed.add(number)

    return allowed


def cron_matches(expr, dt):
    parts = str(expr or '').split()
    if len(parts) != 5:
        raise ValueError('A cron kifejezésnek 5 mezőből kell állnia.')

    values = [dt.minute, dt.hour, dt.day, dt.month, dt.weekday()]
    for idx, token in enumerate(parts):
        minimum, maximum = RANGES[idx]
        allowed = _parse_token(token, minimum, maximum)
        if values[idx] not in allowed:
            return False
    return True


class Command(BaseCommand):
    help = 'A CronJobConfiguration táblában tárolt ütemezések alapján futtatja a management parancsokat.'

    def add_arguments(self, parser):
        parser.add_argument('--job-key', dest='job_key', default=None, help='Csak egy konkrét job futtatása')
        parser.add_argument('--force', action='store_true', help='Ütemezéstől függetlenül futtat')

    def handle(self, *args, **options):
        now = timezone.localtime()
        job_key = options.get('job_key')
        force = bool(options.get('force'))

        qs = CronJobConfiguration.objects.filter(is_active=True)
        if job_key:
            qs = qs.filter(job_key=job_key)

        jobs = list(qs.order_by('name'))
        if not jobs:
            self.stdout.write(self.style.WARNING('Nincs aktív futtatható cron job konfiguráció.'))
            return

        executed = 0
        skipped = 0
        failed = 0

        for job in jobs:
            try:
                if not force and not cron_matches(job.cron_expression, now):
                    skipped += 1
                    continue

                self.stdout.write(f"Futtatás: {job.name} ({job.command_name})")
                call_command(job.command_name)

                job.last_run_at = timezone.now()
                job.last_status = CronJobConfiguration.STATUS_OK
                job.last_message = f"Sikeres futás: {timezone.localtime(job.last_run_at).isoformat()}"
                job.save(update_fields=['last_run_at', 'last_status', 'last_message', 'updated_at'])
                executed += 1
            except Exception as exc:
                failed += 1
                job.last_run_at = timezone.now()
                job.last_status = CronJobConfiguration.STATUS_ERROR
                job.last_message = str(exc)
                job.save(update_fields=['last_run_at', 'last_status', 'last_message', 'updated_at'])
                self.stderr.write(self.style.ERROR(f"Hiba: {job.name}: {exc}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Kész. Futtatva: {executed}, kihagyva: {skipped}, hibás: {failed}"
            )
        )
