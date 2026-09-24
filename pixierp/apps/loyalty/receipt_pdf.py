"""POS bizonylat (nyugta/számla egyszerű) PDF a portál letöltéséhez."""
import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_OK = False


def _register_fonts():
    global FONT_OK
    if FONT_OK:
        return
    regular = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if os.path.exists(regular) and os.path.exists(bold):
        pdfmetrics.registerFont(TTFont('DejaVu', regular))
        pdfmetrics.registerFont(TTFont('DejaVu-Bold', bold))
    else:
        pdfmetrics.registerFont(TTFont('DejaVu', 'Helvetica'))
        pdfmetrics.registerFont(TTFont('DejaVu-Bold', 'Helvetica-Bold'))
    FONT_OK = True


def _f(value, places=2):
    if value is None:
        return '–'
    return f'{float(value):,.{places}f}'.replace(',', ' ').replace('.', ',')


def build_receipt_pdf(tx):
    _register_fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=12 * mm, bottomMargin=14 * mm, title=f'Bizonylat {tx.transaction_number}',
    )
    base = ParagraphStyle('base', fontName='DejaVu', fontSize=9, leading=12)
    title = ParagraphStyle('title', parent=base, fontName='DejaVu-Bold', fontSize=15, alignment=1)
    head = ParagraphStyle('head', parent=base, fontName='DejaVu-Bold', fontSize=8)
    small = ParagraphStyle('small', parent=base, fontSize=8, textColor=colors.HexColor('#777777'))

    story = [Paragraph('BIZONYLAT', title), Spacer(1, 4)]
    tx_type = tx.get_transaction_type_display() if hasattr(tx, 'get_transaction_type_display') else tx.transaction_type
    story.append(Paragraph(
        f'{tx.transaction_number} · {tx_type} · {tx.created_at:%Y.%m.%d. %H:%M}', 
        ParagraphStyle('sub', parent=base, alignment=1),
    ))
    story.append(Spacer(1, 8))

    info = Table([
        [Paragraph('<b>Ügyfél</b>', base), Paragraph(tx.customer_name or tx.shopper_name or 'Vendég', base)],
        [Paragraph('<b>Fizetési mód</b>', base),
         Paragraph(str(tx.get_payment_method_display()) if hasattr(tx, 'get_payment_method_display') else tx.payment_method, base)],
        [Paragraph('<b>Pénztáros</b>', base),
         Paragraph((tx.cashier.get_full_name() if tx.cashier and tx.cashier.get_full_name() else (tx.cashier.username if tx.cashier else '–')), base)],
    ], colWidths=[35 * mm, 140 * mm])
    info.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cccccc')),
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f2f2f2')),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(info)
    story.append(Spacer(1, 10))

    data = [[Paragraph(h, head) for h in ['Megnevezés', 'Db', 'Egységár', 'Összeg']]]
    for item in tx.items.all():
        data.append([
            Paragraph(item.product_name or '', base),
            Paragraph(_f(item.quantity, 2), ParagraphStyle('r', parent=base, alignment=2)),
            Paragraph(_f(item.gross_unit_price) + ' Ft', ParagraphStyle('r2', parent=base, alignment=2)),
            Paragraph(_f(item.gross_total) + ' Ft', ParagraphStyle('r3', parent=base, alignment=2)),
        ])
    data.append([
        Paragraph('<b>Bruttó összesen</b>', ParagraphStyle('b', parent=base, fontName='DejaVu-Bold')), '', '',
        Paragraph(f'<b>{_f(tx.total_gross)} Ft</b>', ParagraphStyle('b2', parent=base, fontName='DejaVu-Bold', alignment=2)),
    ])
    t = Table(data, colWidths=[95 * mm, 20 * mm, 30 * mm, 30 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8f1fa')),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#bbbbbb')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, len(data) - 1), (-1, len(data) - 1), colors.HexColor('#f2f2f2')),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))
    if tx.amount_received is not None:
        story.append(Paragraph(f'Átvett összeg: {_f(tx.amount_received)} Ft, visszajáró: {_f(tx.amount_change)} Ft', small))
    doc.build(story)
    return buf.getvalue()
