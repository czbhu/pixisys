"""
NAV/PixiInvoice számla lekérdező szolgáltatás
Beszállítói számlák automatikus importálása
"""

import logging
import requests
from typing import List, Dict, Optional, Any
from datetime import datetime, date
from apps.core.models import PixinvoiceConfig

logger = logging.getLogger(__name__)


class NavInvoiceService:
    """NAV számla lekérdező szolgáltatás PixiInvoice API-n keresztül"""
    
    def __init__(self):
        self.config = self._get_active_config()
        self.mock_mode = True  # Teszt mód DEMO adatokkal
    
    def _get_active_config(self) -> Optional[PixinvoiceConfig]:
        """Aktív PixiInvoice konfiguráció lekérése"""
        try:
            return PixinvoiceConfig.objects.filter(is_active=True).first()
        except Exception as e:
            logger.error(f"PixiInvoice konfiguráció lekérési hiba: {e}")
            return None
    
    def _get_headers(self) -> Dict[str, str]:
        """API fejlécek összeállítása"""
        if not self.config or not self.config.api_key:
            raise ValueError("PixiInvoice API kulcs nincs beállítva")
        
        return {
            'X-API-Key': self.config.api_key,
            'Content-Type': 'application/json'
        }
    
    def search_invoices(
        self,
        invoice_number: Optional[str] = None,
        supplier_name: Optional[str] = None,
        supplier_tax_number: Optional[str] = None,
        amount_min: Optional[float] = None,
        amount_max: Optional[float] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Számlák keresése a NAV adatbázisban
        """
        # DEMO/MOCK mód - teszt adatok visszaadása
        if self.mock_mode:
            return self._get_mock_invoices(
                invoice_number, supplier_name, amount_min, amount_max
            )
        
        if not self.config:
            raise ValueError("PixiInvoice nincs konfigurálva")
        
        # Keresési paraméterek összeállítása
        params = {
            'direction': 'INBOUND',
            'limit': limit
        }
        
        if invoice_number:
            params['invoice_number'] = invoice_number
        
        if supplier_name:
            params['supplier_name'] = supplier_name
        
        if supplier_tax_number:
            params['supplier_tax_number'] = supplier_tax_number
        
        if amount_min is not None:
            params['amount_min'] = amount_min
        
        if amount_max is not None:
            params['amount_max'] = amount_max
        
        if date_from:
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            params['date_to'] = date_to.isoformat()
        
        try:
            # Pixinvoice API endpoint: /invoices/incoming/
            # Assuming base_url ends with /api/ or similar
            url = f"{self.config.base_url.rstrip('/')}/invoices/incoming/"
            
            # Paraméterek átnevezése Pixinvoice API-hoz
            api_params = {
                'company_id': self.config.company_id,
                'search': invoice_number or supplier_name or supplier_tax_number or '',
            }
            
            if date_from:
                api_params['date_from'] = date_from.isoformat()
            if date_to:
                api_params['date_to'] = date_to.isoformat()
                
            response = requests.get(
                url,
                headers=self._get_headers(),
                params=api_params,
                timeout=30
            )
            
            response.raise_for_status()
            data = response.json()
            
            # Pixinvoice returns pagination wrapper or list
            results = data.get('results', data) if isinstance(data, dict) else data
            return results
            
        except requests.exceptions.RequestException as e:
            logger.error(f"NAV számla keresési hiba: {e}")
            raise
    
    def _get_mock_invoices(
        self,
        invoice_number: Optional[str],
        supplier_name: Optional[str],
        amount_min: Optional[float],
        amount_max: Optional[float]
    ) -> List[Dict[str, Any]]:
        """DEMO teszt számlák"""
        mock_data = [
            {
                'invoiceNumber': 'DEMO-2026-001',
                'invoiceIssueDate': '2026-01-02',
                'supplierName': 'Beszállító 1',
                'supplierTaxNumber': '12345678-1-23',
                'invoiceNetAmount': 150000,
                'invoiceCurrency': 'HUF'
            },
            {
                'invoiceNumber': 'DEMO-2026-002',
                'invoiceIssueDate': '2026-01-03',
                'supplierName': 'Papír Nagyker Kft',
                'supplierTaxNumber': '87654321-2-34',
                'invoiceNetAmount': 85000,
                'invoiceCurrency': 'HUF'
            },
            {
                'invoiceNumber': 'DEMO-2026-003',
                'invoiceIssueDate': '2026-01-03',
                'supplierName': 'Műanyag Bolt Bt',
                'supplierTaxNumber': '98765432-1-45',
                'invoiceNetAmount': 220000,
                'invoiceCurrency': 'HUF'
            }
        ]
        
        # Szűrés
        results = mock_data
        
        if invoice_number:
            results = [i for i in results if invoice_number.upper() in i['invoiceNumber'].upper()]
        
        if supplier_name:
            results = [i for i in results if supplier_name.lower() in i['supplierName'].lower()]
        
        if amount_min is not None:
            results = [i for i in results if i['invoiceNetAmount'] >= amount_min]
        
        if amount_max is not None:
            results = [i for i in results if i['invoiceNetAmount'] <= amount_max]
        
        return results
    
    def get_invoice_details(self, invoice_number: str, supplier_tax_number: str) -> Optional[Dict[str, Any]]:
        """
        Számla részletes adatainak lekérése
        """
        # DEMO/MOCK mód
        if self.mock_mode:
            return self._get_mock_invoice_details(invoice_number)
        
        if not self.config:
            raise ValueError("PixiInvoice nincs konfigurálva")
        
        try:
            # Pixinvoice API endpoint: /invoices/incoming/details/
            url = f"{self.config.base_url.rstrip('/')}/invoices/incoming/details/"
            
            response = requests.get(
                url,
                headers=self._get_headers(),
                params={
                    'company_id': self.config.company_id,
                    'invoice_number': invoice_number
                },
                timeout=30
            )
            
            response.raise_for_status()
            data = response.json()
            
            if 'xml_text' in data:
                return self.parse_xml_to_erp_format(data['xml_text'], data)
            
            return data.get('invoice')
            
        except requests.exceptions.RequestException as e:
            logger.error(f"NAV számla részletek lekérési hiba: {e}")
            raise

    def parse_xml_to_erp_format(self, xml_text: str, meta_data: Dict[str, Any]) -> Dict[str, Any]:
        """NAV XML parse-olása ERP formátumba"""
        import xml.etree.ElementTree as ET
        
        try:
            root = ET.fromstring(xml_text)
            ns = {'base': 'http://schemas.nav.gov.hu/OSA/3.0/data'}
            # Note: namespace usually depends on version. trying to be generic or find one.
            # NAV 3.0 uses http://schemas.nav.gov.hu/OSA/3.0/data
            # We can strip namespaces for easier parsing
            
            items = []
            
            # Helper to find without namespace
            def find_all_recursive(node, tag):
                return [e for e in node.iter() if e.tag.endswith(tag) or e.tag.endswith(f"}}{tag}")]
                
            def find_text(node, tag):
                el = next((e for e in node.iter() if e.tag.endswith(tag) or e.tag.endswith(f"}}{tag}")), None)
                return el.text if el is not None else None

            # Extract basic info if not in meta
            invoice_lines = find_all_recursive(root, 'Line')
            
            for line in invoice_lines:
                desc = find_text(line, 'LineDescription')
                qty = float(find_text(line, 'Quantity') or 0)
                unit_price = float(find_text(line, 'UnitPrice') or 0)
                line_amount = float(find_text(line, 'LineNetAmount') or 0)
                unit = find_text(line, 'UnitOfMeasure')
                product_code = find_text(line, 'ProductCode') # Sometimes specific tags
                
                items.append({
                    'product_name': desc,
                    'product_code': product_code or '',
                    'quantity': qty,
                    'unit_price': unit_price,
                    'total_price': line_amount,
                    'unit': unit or 'db'
                })
                
            return {
                'invoiceNumber': meta_data.get('invoice_number'),
                'invoiceIssueDate': meta_data.get('invoice_issue_date') or find_text(root, 'InvoiceIssueDate'),
                'supplierInfo': {
                    'taxNumber': meta_data.get('supplier_tax_number') or find_text(root, 'SupplierTaxNumber'),
                    'taxNumberName': find_text(root, 'SupplierName') # This might be deep
                },
                'items': items,
                'invoice_xml': xml_text  # Keep raw just in case
            }
            
        except ET.ParseError as e:
            logger.error(f"XML parsing error: {e}")
            return {}

    
    def _get_mock_invoice_details(self, invoice_number: str) -> Dict[str, Any]:
        """DEMO teszt számla részletek"""
        mock_details = {
            'DEMO-2026-001': {
                'invoiceNumber': 'DEMO-2026-001',
                'invoiceIssueDate': '2026-01-02',
                'paymentDate': '2026-01-16',
                'paymentMethod': 'TRANSFER',
                'invoiceCurrency': 'HUF',
                'invoiceNetAmount': 150000,
                'supplierInfo': {
                    'taxNumber': '12345678-1-23',
                    'taxNumberName': 'Beszállító 1'
                },
                'invoiceLines': [
                    {
                        'lineDescription': 'Épületháló 270gr',
                        'productCode': 'EPULETHALO_270',
                        'quantity': 100,
                        'unitPrice': 750,
                        'lineNetAmount': 75000,
                        'unitOfMeasure': 'm'
                    },
                    {
                        'lineDescription': 'Műanyag fólia',
                        'productCode': 'FOLIA_PE',
                        'quantity': 50,
                        'unitPrice': 1500,
                        'lineNetAmount': 75000,
                        'unitOfMeasure': 'm'
                    }
                ]
            },
            'DEMO-2026-002': {
                'invoiceNumber': 'DEMO-2026-002',
                'invoiceIssueDate': '2026-01-03',
                'paymentDate': '2026-01-17',
                'paymentMethod': 'TRANSFER',
                'invoiceCurrency': 'HUF',
                'invoiceNetAmount': 85000,
                'supplierInfo': {
                    'taxNumber': '87654321-2-34',
                    'taxNumberName': 'Papír Nagyker Kft'
                },
                'invoiceLines': [
                    {
                        'lineDescription': 'A4 papír 80g',
                        'productCode': 'PAPER_A4_80',
                        'quantity': 50,
                        'unitPrice': 1700,
                        'lineNetAmount': 85000,
                        'unitOfMeasure': 'csomag'
                    }
                ]
            },
            'DEMO-2026-003': {
                'invoiceNumber': 'DEMO-2026-003',
                'invoiceIssueDate': '2026-01-03',
                'paymentDate': '2026-01-20',
                'paymentMethod': 'CREDIT',
                'invoiceCurrency': 'HUF',
                'invoiceNetAmount': 220000,
                'supplierInfo': {
                    'taxNumber': '98765432-1-45',
                    'taxNumberName': 'Műanyag Bolt Bt'
                },
                'invoiceLines': [
                    {
                        'lineDescription': 'PVC lemez 3mm',
                        'productCode': 'PVC_3MM',
                        'quantity': 20,
                        'unitPrice': 11000,
                        'lineNetAmount': 220000,
                        'unitOfMeasure': 'm2'
                    }
                ]
            }
        }
        
        return mock_details.get(invoice_number, {})
    
    def parse_invoice_to_erp_format(self, nav_invoice: Dict[str, Any]) -> Dict[str, Any]:
        """
        NAV számla konvertálása ERP formátumra
        
        Args:
            nav_invoice: NAV számla adatok
        
        Returns:
            ERP számla formátum
        """
        try:
            # Alapadatok kinyerése
            invoice_data = {
                'invoice_number': nav_invoice.get('invoiceNumber'),
                'invoice_date': nav_invoice.get('invoiceIssueDate'),
                'due_date': nav_invoice.get('paymentDate'),
                'payment_method': self._map_payment_method(nav_invoice.get('paymentMethod')),
                'currency': nav_invoice.get('invoiceCurrency', 'HUF'),
                'total_amount': self._parse_amount(nav_invoice.get('invoiceNetAmount', 0)),
                'notes': f"NAV importálás: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            }
            
            # Beszállító adatok
            supplier_data = nav_invoice.get('supplierInfo', {})
            invoice_data['supplier_tax_number'] = supplier_data.get('taxNumber')
            invoice_data['supplier_name'] = supplier_data.get('taxNumberName')
            
            # Tételek feldolgozása
            items = []
            nav_lines = nav_invoice.get('invoiceLines', [])
            
            for line in nav_lines:
                item = {
                    'product_name': line.get('lineDescription', ''),
                    'product_code': line.get('productCode', ''),
                    'quantity': self._parse_amount(line.get('quantity', 0)),
                    'unit_price': self._parse_amount(line.get('unitPrice', 0)),
                    'total_price': self._parse_amount(line.get('lineNetAmount', 0)),
                    'unit': line.get('unitOfMeasure', ''),
                }
                items.append(item)
            
            invoice_data['items'] = items
            
            return invoice_data
            
        except Exception as e:
            logger.error(f"NAV számla parsing hiba: {e}")
            raise
    
    def _map_payment_method(self, nav_payment_method: Optional[str]) -> str:
        """NAV fizetési mód leképezése ERP fizetési módra"""
        mapping = {
            'TRANSFER': 'transfer',
            'CASH': 'cash',
            'CARD': 'card',
            'OTHER': 'transfer'
        }
        return mapping.get(nav_payment_method, 'transfer')
    
    def _parse_amount(self, amount: Any) -> float:
        """Összeg parsing"""
        try:
            return float(amount)
        except (TypeError, ValueError):
            return 0.0
