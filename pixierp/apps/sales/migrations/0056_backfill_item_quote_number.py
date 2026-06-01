from django.db import migrations


def backfill_quote_numbers(apps, schema_editor):
    QuoteRequestItem = apps.get_model('sales', 'QuoteRequestItem')
    QuoteRequest = apps.get_model('sales', 'QuoteRequest')

    # Meglévő foglalt számok összegyűjtése (prefix -> max sorszám)
    used = set()
    for val in QuoteRequest.objects.values_list('number', flat=True):
        if val:
            used.add(val)
    for val in QuoteRequestItem.objects.exclude(quote_number__isnull=True).values_list('quote_number', flat=True):
        if val:
            used.add(val)

    def next_number(prefix, used_set):
        # A napi prefixre nézve a következő szabad sorszám
        max_seq = 0
        for v in used_set:
            if v and v.startswith(prefix) and len(v) > len(prefix):
                try:
                    s = int(v[len(prefix):])
                    if s > max_seq:
                        max_seq = s
                except (ValueError, TypeError):
                    pass
        seq = max_seq + 1
        candidate = f"{prefix}{seq:02d}"
        while candidate in used_set:
            seq += 1
            candidate = f"{prefix}{seq:02d}"
        return candidate

    items = QuoteRequestItem.objects.select_related('quote_request').filter(quote_number__isnull=True).order_by('quote_request_id', 'sort_order', 'id')
    # Csoportosítás ajánlat szerint: az első tétel örökli az ajánlat számát, a többi újat kap
    seen_qr_number = set()
    for item in items:
        qr = item.quote_request
        qr_number = (qr.number or qr.request_number) if qr else None
        if qr_number and qr_number not in seen_qr_number and qr_number not in (
            QuoteRequestItem.objects.exclude(pk=item.pk).filter(quote_number=qr_number).values_list('quote_number', flat=True)
        ):
            # Az ajánlat első tétele: örökölje az ajánlatszámot
            item.quote_number = qr_number
            seen_qr_number.add(qr_number)
            used.add(qr_number)
        else:
            # Prefix az ajánlat számából (első 8 karakter ha dátum), különben mai dátum
            base = qr_number or ''
            prefix = base[:8] if len(base) >= 8 and base[:8].isdigit() else (qr.issue_date.strftime('%Y%m%d') if qr and qr.issue_date else '20260101')
            num = next_number(prefix, used)
            item.quote_number = num
            used.add(num)
        item.save(update_fields=['quote_number'])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0055_quoterequestitem_quote_number'),
    ]

    operations = [
        migrations.RunPython(backfill_quote_numbers, reverse_noop),
    ]
