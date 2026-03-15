"""
Nyomdakész PDF generálás a Fabric.js design JSON-ból.
SVG közbenső formátumon keresztül, 3mm bleed + vágójelek.
"""
import io
from decimal import Decimal
from django.core.files.base import ContentFile

BLEED_MM = 3
MM_TO_PX_96DPI = 3.7795275591  # 1mm = 3.7795... px (96 DPI)


def generate_print_pdf(item):
    """
    Generál egy nyomdakész PDF-et az order item design JSON-jából.
    A PDF 3mm bleed-del és vágójelekkel kerül elkészítésre.
    Visszaadja a fájl URL-jét.
    """
    try:
        import cairosvg
    except ImportError:
        raise RuntimeError(
            "A cairosvg csomag nem található. Telepítsd: pip install cairosvg"
        )

    w_mm = float(item.width_mm)
    h_mm = float(item.height_mm)
    pdf_pages = []

    for side_num, design_json in [
        ('1', item.design_json_side1),
        ('2', item.design_json_side2 if item.sides == '2' else None),
    ]:
        if not design_json:
            if side_num == '1':
                # Üres 1. oldal → fehér lap
                svg = _blank_svg(w_mm, h_mm)
            else:
                break
        else:
            svg = _fabric_json_to_svg(design_json, w_mm, h_mm)

        svg_final = _add_bleed_and_cut_marks(svg, w_mm, h_mm)
        pdf_bytes = cairosvg.svg2pdf(bytestring=svg_final.encode('utf-8'))
        pdf_pages.append(pdf_bytes)

    if not pdf_pages:
        raise RuntimeError('Nincs tervezési adat')

    final_pdf = _merge_pdfs(pdf_pages) if len(pdf_pages) > 1 else pdf_pages[0]

    filename = f"print_order_{item.order_id}_item_{item.pk}.pdf"
    item.generated_pdf.save(filename, ContentFile(final_pdf), save=True)
    return item.generated_pdf.url


def _blank_svg(w_mm, h_mm):
    w = w_mm * MM_TO_PX_96DPI
    h = h_mm * MM_TO_PX_96DPI
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{w}px" height="{h}px" viewBox="0 0 {w} {h}">'
        f'<rect width="{w}" height="{h}" fill="#ffffff"/>'
        f'</svg>'
    )


def _fabric_json_to_svg(fabric_json, w_mm, h_mm):
    """Fabric.js canvas JSON → SVG string."""
    w_px = w_mm * MM_TO_PX_96DPI
    h_px = h_mm * MM_TO_PX_96DPI

    objects = fabric_json.get('objects', [])
    canvas_w = fabric_json.get('width', 800) or 800
    canvas_h = fabric_json.get('height', 600) or 600
    scale_x = w_px / canvas_w
    scale_y = h_px / canvas_h
    bg = fabric_json.get('background', '#ffffff') or '#ffffff'

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{w_px}px" height="{h_px}px" viewBox="0 0 {w_px} {h_px}">',
        f'<rect width="{w_px}" height="{h_px}" fill="{bg}"/>',
        f'<g transform="scale({scale_x},{scale_y})">',
    ]
    for obj in objects:
        parts.append(_obj_to_svg(obj))
    parts.append('</g>')
    parts.append('</svg>')
    return ''.join(parts)


def _esc(text):
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;'))


def _obj_to_svg(obj):
    t = obj.get('type', '')
    x = obj.get('left', 0)
    y = obj.get('top', 0)
    angle = obj.get('angle', 0)
    opacity = obj.get('opacity', 1)
    fill = obj.get('fill', '#000000') or '#000000'
    transform = f'translate({x},{y}) rotate({angle})'

    if t in ('i-text', 'text', 'textbox'):
        font_size = obj.get('fontSize', 16)
        font_family = _esc(obj.get('fontFamily', 'Arial'))
        font_weight = obj.get('fontWeight', 'normal')
        font_style = obj.get('fontStyle', 'normal')
        lines = str(obj.get('text', '')).split('\n')
        tspans = ''.join(
            f'<tspan x="0" dy="{font_size * 1.2 * i if i else 0}">{_esc(line)}</tspan>'
            for i, line in enumerate(lines)
        )
        return (
            f'<text transform="{transform}" font-size="{font_size}" '
            f'font-family="{font_family}" font-weight="{font_weight}" '
            f'font-style="{font_style}" fill="{fill}" opacity="{opacity}">'
            f'{tspans}</text>'
        )

    if t == 'rect':
        w = obj.get('width', 100) * obj.get('scaleX', 1)
        h = obj.get('height', 100) * obj.get('scaleY', 1)
        stroke = obj.get('stroke', 'none') or 'none'
        sw = obj.get('strokeWidth', 0)
        rx = obj.get('rx', 0)
        return (
            f'<rect transform="{transform}" width="{w}" height="{h}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'rx="{rx}" opacity="{opacity}"/>'
        )

    if t == 'circle':
        r = obj.get('radius', 50) * obj.get('scaleX', 1)
        return (
            f'<circle transform="{transform}" r="{r}" '
            f'fill="{fill}" opacity="{opacity}"/>'
        )

    if t == 'image':
        w = obj.get('width', 100) * obj.get('scaleX', 1)
        h = obj.get('height', 100) * obj.get('scaleY', 1)
        src = _esc(obj.get('src', ''))
        return (
            f'<image transform="{transform}" width="{w}" height="{h}" '
            f'xlink:href="{src}" opacity="{opacity}" preserveAspectRatio="none"/>'
        )

    return ''


def _add_bleed_and_cut_marks(svg_content, w_mm, h_mm):
    """3mm bleed + vágójelek hozzáadása az SVG-hez."""
    bleed = BLEED_MM
    total_w = (w_mm + 2 * bleed) * MM_TO_PX_96DPI
    total_h = (h_mm + 2 * bleed) * MM_TO_PX_96DPI
    bleed_px = bleed * MM_TO_PX_96DPI
    w_px = w_mm * MM_TO_PX_96DPI
    h_px = h_mm * MM_TO_PX_96DPI

    mark_len = 5 * MM_TO_PX_96DPI   # 5mm hosszú vágójel
    mark_gap = 2 * MM_TO_PX_96DPI   # 2mm rés a szél és a jel között
    ms = 'stroke="#000000" stroke-width="0.5" fill="none"'

    marks = []
    for cx, cy in [
        (bleed_px, bleed_px),
        (bleed_px + w_px, bleed_px),
        (bleed_px, bleed_px + h_px),
        (bleed_px + w_px, bleed_px + h_px),
    ]:
        # Vízszintes jel
        direction = 1 if cx <= bleed_px else -1
        marks.append(
            f'<line x1="{cx + direction * mark_gap}" y1="{cy}" '
            f'x2="{cx + direction * (mark_gap + mark_len)}" y2="{cy}" {ms}/>'
        )
        # Függőleges jel
        direction2 = 1 if cy <= bleed_px else -1
        marks.append(
            f'<line x1="{cx}" y1="{cy + direction2 * mark_gap}" '
            f'x2="{cx}" y2="{cy + direction2 * (mark_gap + mark_len)}" {ms}/>'
        )

    # Belső SVG tartalom kinyerése
    start = svg_content.index('>') + 1
    end = svg_content.rfind('</svg>')
    inner = svg_content[start:end]

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{total_w}px" height="{total_h}px" viewBox="0 0 {total_w} {total_h}">'
        f'<rect width="{total_w}" height="{total_h}" fill="white"/>'
        f'<g transform="translate({bleed_px},{bleed_px})">{inner}</g>'
        + ''.join(marks)
        + '</svg>'
    )


def _merge_pdfs(pdf_bytes_list):
    """Több PDF összefűzése egy fájlba."""
    try:
        from pypdf import PdfWriter, PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfWriter, PdfReader
        except ImportError:
            return pdf_bytes_list[0]

    writer = PdfWriter()
    for pdf_bytes in pdf_bytes_list:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
