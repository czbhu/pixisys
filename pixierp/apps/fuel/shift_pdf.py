"""Műszakátadási jegyzőkönyv PDF generálás (reportlab)."""

import os
from decimal import Decimal

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

FONT_REGISTERED = False


def _register_fonts():
    global FONT_REGISTERED
    if FONT_REGISTERED:
        return
    regular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if os.path.exists(regular) and os.path.exists(bold):
        pdfmetrics.registerFont(TTFont('DejaVu', regular))
        pdfmetrics.registerFont(TTFont('DejaVu-Bold', bold))
    else:  # fallback – ő/ű karakterek nélkül
        pdfmetrics.registerFont(TTFont('DejaVu', 'Helvetica'))
        pdfmetrics.registerFont(TTFont('DejaVu-Bold', 'Helvetica-Bold'))
    FONT_REGISTERED = True


PAYMENT_LABELS = {
    'cash': 'Készpénz',
    'card': 'Bankkártya',
    'customer_card': 'Ügyfélkártya',
}

THIN_GREY = colors.HexColor('#999999')
HEADER_BG = colors.HexColor('#e8f1fa')
TOTAL_BG = colors.HexColor('#f2f2f2')


def _f(value, places=2):
    """Decimal/string formázás ezres szóközzel, magyar tizedesvesszővel."""
    if value is None:
        return '–'
    if isinstance(value, (int,)):
        text = f'{value:,}'.replace(',', ' ')
    elif isinstance(value, (float, Decimal)):
        text = f'{value:,.{places}f}'.replace(',', ' ').replace('.', ',')
    else:
        return str(value)
    return text


def _liters(value):
    return _f(value, 3 if isinstance(value, Decimal) and value.as_tuple().exponent < -2 else 2)


def _styles():
    base = ParagraphStyle(
        'base', fontName='DejaVu', fontSize=8.5, leading=11, alignment=0,
    )
    return {
        'base': base,
        'cell': ParagraphStyle('cell', parent=base),
        'cell_r': ParagraphStyle('cell_r', parent=base, alignment=2),
        'cell_b': ParagraphStyle('cell_b', parent=base, fontName='DejaVu-Bold'),
        'cell_br': ParagraphStyle('cell_br', parent=base, fontName='DejaVu-Bold', alignment=2),
        'head_cell': ParagraphStyle('head_cell', parent=base, fontName='DejaVu-Bold', fontSize=8),
        'title': ParagraphStyle(
            'title', parent=base, fontName='DejaVu-Bold', fontSize=14, alignment=1, spaceAfter=2,
        ),
        'subtitle': ParagraphStyle('subtitle', parent=base, fontSize=9, alignment=1, textColor=THIN_GREY),
        'section': ParagraphStyle(
            'section', parent=base, fontName='DejaVu-Bold', fontSize=10.5,
            spaceBefore=10, spaceAfter=4,
        ),
        'small': ParagraphStyle('small', parent=base, fontSize=7.5, textColor=THIN_GREY),
        'note': ParagraphStyle('note', parent=base, fontSize=8.5),
    }


def _cell(text, style='cell'):
    return Paragraph(str(text), _styles()[style])


def _table_base(data, column_widths, align_right_from=None):
    table = Table(data, colWidths=column_widths, repeatRows=1)
    style = [
        ('FONTNAME', (0, 0), (-1, -1), 'DejaVu'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bbbbbb')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]
    if align_right_from is not None:
        style.append(('ALIGN', (align_right_from, 0), (-1, -1), 'RIGHT'))
    table.setStyle(TableStyle(style))
    return table


def _company_header():
    name = address = tax = ''
    try:
        from apps.core.models import Company
        company = Company.objects.first()
        if company:
            name, address, tax = company.name, company.address, company.tax_number
    except Exception:
        pass
    return [Paragraph(line, _styles()['base']) for line in [name, address, f'Adószám: {tax}'] if line]


def _user_name(user):
    if not user:
        return ''
    return user.get_full_name() or user.username


def build_shift_pdf(shift):
    """Összeállítja a műszakátadási jegyzőkönyv PDF-et és visszaadja a tartalmát (bytes)."""
    _register_fonts()
    import io

    from django.utils import timezone as dj_tz

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=12 * mm, rightMargin=12 * mm, topMargin=10 * mm, bottomMargin=12 * mm,
        title=f'Műszakátadási jegyzőkönyv – {shift.number}. műszak',
    )
    story = []
    S = _styles()

    fmt_dt = lambda dt: dj_tz.localtime(dt).strftime('%Y.%m.%d. %H:%M') if dt else '–'
    period = f'{fmt_dt(shift.opened_at)} – {fmt_dt(shift.closed_at) or "nyitott"}'

    # ------------------------------------------------------------ fejléc
    head = Table(
        [[_company_header(), Paragraph('MŰSZAKÁTADÁSI JELENTÉS<br/>ÜZEMANYAGTÖLTŐ ÁLLOMÁS', S['title'])]],
        colWidths=[95 * mm, 91 * mm],
    )
    head.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(head)
    story.append(HRFlowable(width='100%', thickness=1, color=colors.black, spaceAfter=6))

    info = Table([[
        _cell(f'<b>{shift.number}. műszak</b>'),
        _cell(f'Időszak: <b>{period}</b>'),
        _cell(f'Nyitotta: <b>{_user_name(shift.opened_by) or "–"}</b>'),
        _cell(f'Zárta: <b>{_user_name(shift.closed_by) or "–"}</b>'),
    ]], colWidths=[34 * mm, 62 * mm, 45 * mm, 45 * mm])
    info.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, colors.black),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, THIN_GREY),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(info)
    story.append(Spacer(1, 4))

    # ------------------------------------------------------ 1. kútórák
    story.append(Paragraph('1. Kútfejek regisztrációs órái', S['section']))
    data = [[_cell(h, 'head_cell') for h in
             ['Kút', 'Pisztoly', 'Üzemanyag', 'Nyitó óraállás (l)', 'Záró óraállás (l)', 'Elmozdulás (l)']]]
    grade_totals = {}
    for nr in shift.nozzle_readings.select_related('pump', 'fuel_grade'):
        movement = nr.movement
        data.append([
            _cell(nr.pump.name or f'{nr.pump.pump_id}. kút'),
            _cell(f'{nr.nozzle_number}.'),
            _cell(nr.fuel_grade.name),
            _cell(_liters(nr.opening_total), 'cell_r'),
            _cell(_liters(nr.closing_total), 'cell_r'),
            _cell(_liters(movement) if movement is not None else '–', 'cell_r'),
        ])
        if movement is not None:
            grade_totals[nr.fuel_grade.name] = grade_totals.get(nr.fuel_grade.name, Decimal('0')) + movement
    for grade_name, total in sorted(grade_totals.items()):
        data.append([
            _cell(''), _cell(''), _cell(f'{grade_name} – összesen', 'cell_b'),
            _cell(''), _cell(''), _cell(_liters(total), 'cell_br'),
        ])
    t = _table_base(data, [30 * mm, 18 * mm, 44 * mm, 32 * mm, 32 * mm, 30 * mm], align_right_from=3)
    extra = [('BACKGROUND', (0, len(data) - len(grade_totals)), (-1, -1), TOTAL_BG)] if grade_totals else []
    if extra:
        t.setStyle(TableStyle(extra))
    story.append(t)

    # ------------------------------------------- 2. tartály elszámolás
    story.append(Paragraph('2. Tartálykészlet-elszámolás', S['section']))
    data = [[_cell(h, 'head_cell') for h in
             ['Üzemanyag', 'Nyitó készlet (l)', 'Bevételezés (l)', 'Készletcsökkenés – kútóra (l)',
              'Számított záró készlet (l)', 'Mért záró készlet (l)', 'Eltérés (l)']]]
    for tr in shift.tank_readings.select_related('fuel_grade', 'material'):
        diff = tr.difference
        data.append([
            _cell(tr.fuel_grade.name),
            _cell(_liters(tr.opening_stock), 'cell_r'),
            _cell(_liters(tr.received), 'cell_r'),
            _cell(_liters(tr.dispensed), 'cell_r'),
            _cell(_liters(tr.calculated_closing), 'cell_r'),
            _cell(_liters(tr.measured_closing), 'cell_r'),
            _cell(_liters(diff) if diff is not None else '–', 'cell_br'),
        ])
    story.append(_table_base(
        data, [26 * mm, 24 * mm, 22 * mm, 28 * mm, 28 * mm, 24 * mm, 34 * mm], align_right_from=1,
    ))
    story.append(Paragraph(
        'Eltérés = mért záró készlet – számított záró készlet. '
        'Számított záró készlet = nyitó készlet + bevételezés – kútóra elmozdulás.',
        S['small'],
    ))

    # --------------------------------------- 3. értékesítési összesítés
    story.append(Paragraph('3. Értékesítési összesítés', S['section']))
    summary = shift.summary or {}
    sales = summary.get('sales') or {}
    payments = sales.get('payment_methods') or []
    pay_cols = [p for p in payments] or ['cash', 'card']
    head3 = ['Kategória', 'Mennyiség (l)'] + [PAYMENT_LABELS.get(p, p) + ' (Ft)' for p in pay_cols] + ['Összesen (Ft)']
    data = [[_cell(h, 'head_cell') for h in head3]]
    for cat in sales.get('categories') or []:
        by_pay = cat.get('by_payment') or {}
        row = [_cell(cat.get('category') or ''), _cell(_liters(cat.get('volume')) if cat.get('volume') else '–', 'cell_r')]
        row += [_cell(_f(by_pay.get(p, {}).get('amount', 0)), 'cell_r') for p in pay_cols]
        row.append(_cell(_f(cat.get('total_amount', 0)), 'cell_br'))
        data.append(row)
    storno = sales.get('storno') or {}
    if any((storno.get(p) or {}).get('amount') for p in pay_cols):
        row = [_cell('Sztornó', 'cell_b'), _cell('–', 'cell_r')]
        row += [_cell(_f(-(storno.get(p) or {}).get('amount', 0)), 'cell_r') for p in pay_cols]
        row.append(_cell(_f(-sum((storno.get(p) or {}).get('amount', 0) for p in pay_cols)), 'cell_br'))
        data.append(row)
    by_pay_total = sales.get('by_payment') or {}
    row = [_cell('Összesen sztornóval csökkentve', 'cell_b'), _cell('', 'cell_r')]
    row += [_cell(_f((by_pay_total.get(p) or {}).get('net', 0)), 'cell_br') for p in pay_cols]
    row.append(_cell(_f(sales.get('net_total', 0)), 'cell_br'))
    data.append(row)
    widths = [40 * mm, 22 * mm] + [27 * mm] * len(pay_cols) + [26 * mm]
    t = _table_base(data, widths, align_right_from=1)
    t.setStyle(TableStyle([('BACKGROUND', (0, len(data) - 1), (-1, -1), TOTAL_BG)]))
    story.append(t)

    # ------------------------------------------- 4. pénzforgalom
    story.append(Paragraph('4. Pénzforgalom', S['section']))
    cash = summary.get('cash') or {}

    def cash_line(label, value, bold=False):
        st = 'cell_br' if bold else 'cell_r'
        lst = 'cell_b' if bold else 'cell'
        return [_cell(label, lst), _cell(_f(value), st)]

    data = [
        [_cell('Tétel', 'head_cell'), _cell('Összeg (Ft)', 'head_cell')],
        cash_line('Nyitó készpénz', cash.get('opening_balance')),
        cash_line('Készpénzes értékesítés', cash.get('cash_sales')),
        cash_line('Sztornó (készpénz visszaadás)', -(cash.get('cash_storno') or 0)),
        cash_line('Pénz befizetések (betétek)', cash.get('deposits_total')),
        cash_line('Pénz kifizetések', -(cash.get('withdrawals_total') or 0)),
        cash_line('Számított záró készpénz', cash.get('calculated_closing'), bold=True),
        cash_line('Számolt záró készpénz', cash.get('counted_cash'), bold=True),
        cash_line('Eltérés', cash.get('cash_difference'), bold=True),
    ]
    story.append(_table_base(data, [120 * mm, 66 * mm], align_right_from=1))

    movements = cash.get('movements') or []
    if movements:
        data = [[_cell(h, 'head_cell') for h in ['Időpont', 'Mozgás', 'Összeg (Ft)', 'Megjegyzés']]]
        for mv in movements:
            data.append([
                _cell(mv.get('at', '')),
                _cell('Befizetés' if mv.get('is_deposit') else 'Kifizetés'),
                _cell(_f(mv.get('amount')), 'cell_r'),
                _cell(mv.get('note') or ''),
            ])
        story.append(Spacer(1, 4))
        story.append(_table_base(data, [28 * mm, 24 * mm, 28 * mm, 106 * mm], align_right_from=2))

    if shift.notes:
        story.append(Spacer(1, 6))
        story.append(Paragraph(f'Megjegyzés: {shift.notes}', S['note']))

    # ------------------------------------------------------- aláírások
    story.append(Spacer(1, 26))
    sign = Table([
        [Paragraph('Átadta:', S['base']), Paragraph('Átvette:', S['base'])],
        [Spacer(1, 26), Spacer(1, 26)],
        [HRFlowable(width='80%'), HRFlowable(width='80%')],
    ], colWidths=[93 * mm, 93 * mm])
    story.append(KeepTogether(sign))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        f'Készült: {dj_tz.localtime(shift.closed_at or dj_tz.now()).strftime("%Y.%m.%d. %H:%M")} – '
        'pixiERP benzinkút modul', S['small'],
    ))

    doc.build(story)
    return buf.getvalue()
