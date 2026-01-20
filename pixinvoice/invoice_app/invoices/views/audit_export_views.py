from django.http import HttpResponse, HttpResponseBadRequest
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from invoices.models import Invoice, Company
import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal

def format_date(d):
    """Formats date as YYYY-MM-DD"""
    if not d:
        return ""
    return d.strftime("%Y-%m-%d")

def format_decimal(d):
    """Formats decimal with 2 places"""
    if d is None:
        return "0.00"
    return "{:.2f}".format(d)

def create_address_element(parent, address_obj, prefix):
    """
    Helper to add address fields.
    address_obj can be a Company or Customer instance.
    prefix is 'vevo' or 'szlakibocsato' usually, but here we just append children to parent.
    According to schema we typically need: 
      <cim>
        <iranyitoszam>...</iranyitoszam>
        <telepules>...</telepules>
        <kerulet>...</kerulet>
        <kozterulet_neve>...</kozterulet_neve>
        <kozterulet_jellege>...</kozterulet_jellege>
        <hazszam>...</hazszam>
        <epulet>...</epulet>
        <lepcsohaz>...</lepcsohaz>
        <szint>...</szint>
        <ajto>...</ajto>
      </cim>
    """
    cim = ET.SubElement(parent, "cim")
    
    ET.SubElement(cim, "iranyitoszam").text = str(address_obj.postal_code or "")
    ET.SubElement(cim, "telepules").text = str(address_obj.city or "")
    # kerulet is optional/not explicitly in our simplified model often, skipping if missing
    ET.SubElement(cim, "kozterulet_neve").text = str(address_obj.street_name or "")
    ET.SubElement(cim, "kozterulet_jellege").text = str(address_obj.public_place_category or "utca")
    ET.SubElement(cim, "hazszam").text = str(address_obj.street_number or "")
    
    if address_obj.building:
        ET.SubElement(cim, "epulet").text = str(address_obj.building)
    if address_obj.staircase:
        ET.SubElement(cim, "lepcsohaz").text = str(address_obj.staircase)
    if address_obj.floor:
        ET.SubElement(cim, "szint").text = str(address_obj.floor)
    if address_obj.door:
        ET.SubElement(cim, "ajto").text = str(address_obj.door)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def nav_audit_export(request):
    """
    Generates the 'Adóhatósági ellenőrzési adatszolgáltatás' XML.
    Query params:
    - date_from, date_to (YYYY-MM-DD)
    - invoice_num_from, invoice_num_to (Optional by law if date used, but usually mutually exclusive logic)
    - company_id (To select which company issuer)
    """
    
    date_from_str = request.query_params.get('date_from')
    date_to_str = request.query_params.get('date_to')
    inv_from = request.query_params.get('invoice_num_from')
    inv_to = request.query_params.get('invoice_num_to')
    company_id = request.query_params.get('company_id')

    if not company_id:
        return HttpResponseBadRequest("Company ID is required")
        
    try:
        company = Company.objects.get(id=company_id)
    except Company.DoesNotExist:
        return HttpResponseBadRequest("Invalid Company ID")

    # Filter invoices
    qs = Invoice.objects.filter(company=company).order_by('invoice_number')
    
    # Range filtering Logic
    # The decree allows filtering by date range OR invoice number range.
    has_date_filter = date_from_str and date_to_str
    has_inv_filter = inv_from and inv_to
    
    if not (has_date_filter or has_inv_filter):
        return HttpResponseBadRequest("Must provide either date range or invoice number range.")

    if has_date_filter:
        try:
            d_start = datetime.strptime(date_from_str, '%Y-%m-%d').date()
            d_end = datetime.strptime(date_to_str, '%Y-%m-%d').date()
            qs = qs.filter(issue_date__range=[d_start, d_end])
        except ValueError:
            return HttpResponseBadRequest("Invalid date format, use YYYY-MM-DD")
            
    if has_inv_filter:
        # Dictionary sort filter is complex in SQL for all formats, 
        # but for simple alphanumeric strictly increasing we generally rely on string comparison 
        # OR we just filter carefully. 
        # For safety/simplicity in this implementation, we filter 'gte' and 'lte' on the string field.
        qs = qs.filter(invoice_number__gte=inv_from, invoice_number__lte=inv_to)

    invoices = list(qs)
    
    # Build XML
    root = ET.Element("szamlak")
    
    # Attributes for root (Audit requirements)
    root.set("export_datuma", timezone.now().strftime("%Y-%m-%dT%H:%M:%S"))
    root.set("export_szla_db", str(len(invoices)))
    
    if has_date_filter:
        root.set("kezdo_ido", date_from_str)
        root.set("zaro_ido", date_to_str)
    if has_inv_filter:
        root.set("kezdo_szla_szam", inv_from)
        root.set("zaro_szla_szam", inv_to)

    for inv in invoices:
        szamla_node = ET.SubElement(root, "szamla")
        
        # 1. Fejlec
        fejlec = ET.SubElement(szamla_node, "fejlec")
        ET.SubElement(fejlec, "szlasorszam").text = inv.invoice_number
        ET.SubElement(fejlec, "szlatipus").text = "N" # Simplified 'Normal'. Todo map corrections if needed.
        if inv.invoice_category == 'CORRECTION':
            fejlec.find("szlatipus").text = "M" # M for Modosito
        elif inv.invoice_category == 'AGGREGATE':
            fejlec.find("szlatipus").text = "gyujto" # Or similar code, but strict schema usually uses 1 char. 
            # Actually standard schema: 'N' (normal), 'S' (storno), 'M' (modosito), 'E' (eloleg), 'V' (veg) are loosely standard or handled via type.
            # Simplified map:
            if inv.invoice_category == 'CORRECTION': fejlec.find("szlatipus").text = "M" 
        
        ET.SubElement(fejlec, "szladatum").text = format_date(inv.issue_date)
        ET.SubElement(fejlec, "teljdatum").text = format_date(inv.delivery_date)
        
        # 2. Szamlakibocsato (Issuer)
        kibocsato = ET.SubElement(szamla_node, "szamlakibocsato")
        ET.SubElement(kibocsato, "adoszam").text = inv.company.tax_number
        ET.SubElement(kibocsato, "nev").text = inv.company.name
        create_address_element(kibocsato, inv.company, "kibocsato")
        
        # 3. Vevo (Customer)
        vevo = ET.SubElement(szamla_node, "vevo")
        # Only include tax number if it exists
        if inv.customer.tax_number:
            ET.SubElement(vevo, "adoszam").text = inv.customer.tax_number
        ET.SubElement(vevo, "nev").text = inv.customer.name
        create_address_element(vevo, inv.customer, "vevo")
        
        # 4. Tetelek (Items)
        tetelek_node = ET.SubElement(szamla_node, "termek_szolgaltatas_tetelek")
        
        for item in inv.items.all():
            item_node = ET.SubElement(tetelek_node, "termek_szolgaltatas_tetel")
            ET.SubElement(item_node, "termeknev").text = item.description
            ET.SubElement(item_node, "menny").text = format_decimal(item.quantity)
            # Mértékegység default
            ET.SubElement(item_node, "mertekegys").text = item.unit_of_measure 
            ET.SubElement(item_node, "nettoar").text = format_decimal(item.unit_price) # Unit Price
            ET.SubElement(item_node, "nettoertek").text = format_decimal(item.net_amount) # Line Net
            ET.SubElement(item_node, "adokulcs").text = format_decimal(item.vat_rate)
            ET.SubElement(item_node, "adoertek").text = format_decimal(item.vat_amount)
            ET.SubElement(item_node, "bruttoertek").text = format_decimal(item.gross_amount)
            
        # 5. Osszesites (Summary)
        # We need to group by VAT rate
        osszesites_node = ET.SubElement(szamla_node, "szamla_osszesites")
        
        # Helper to group items by tax rate
        tax_groups = {}
        for item in inv.items.all():
            rate = str(item.vat_rate)
            if rate not in tax_groups:
                tax_groups[rate] = {'net': Decimal(0), 'vat': Decimal(0), 'gross': Decimal(0)}
            tax_groups[rate]['net'] += item.net_amount
            tax_groups[rate]['vat'] += item.vat_amount
            tax_groups[rate]['gross'] += item.gross_amount

        total_gross = Decimal(0)
        
        for rate, vals in tax_groups.items():
            vat_summary = ET.SubElement(osszesites_node, "afa_osszesito")
            ET.SubElement(vat_summary, "afarovat").text = rate
            ET.SubElement(vat_summary, "nettoar").text = format_decimal(vals['net'])
            ET.SubElement(vat_summary, "adoertek").text = format_decimal(vals['vat'])
            ET.SubElement(vat_summary, "bruttoar").text = format_decimal(vals['gross'])
            total_gross += vals['gross']

        ET.SubElement(osszesites_node, "szamla_brutto").text = format_decimal(total_gross)

    # Return XML response
    response_xml = ET.tostring(root, encoding='utf-8', method='xml')
    filename = f"nav_audit_export_{company.tax_number}_{timezone.now().strftime('%Y%m%d_%H%M')}.xml"
    
    response = HttpResponse(response_xml, content_type='application/xml')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
