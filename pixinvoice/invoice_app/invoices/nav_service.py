import requests
import logging
import os
import re  # Added for string sanitization
import xml.etree.ElementTree as ET
from xml.dom import minidom
import hashlib
import base64
import json
from datetime import datetime
from typing import Dict, Any, Optional
from invoices.models import AdvanceAllocation
from .models import Invoice, NAVConfiguration


class NAVService:
    """Service for integrating with NAV Online Invoice API"""
    
    def __init__(self, config: NAVConfiguration):
        self.config = config
        self.api_url = config.api_url
        self.user_data = {
            "login": config.login,
            "password": config.password,
            "taxNumber": config.tax_number,
            "signKey": config.sign_key,
            "exchangeKey": config.exchange_key,
        }
        self.software_data = {
            "softwareId": config.software_id,
            "softwareName": config.software_name,
            "softwareOperation": config.software_operation,
            "softwareMainVersion": config.software_main_version,
            "softwareDevName": config.software_dev_name,
            "softwareDevContact": config.software_dev_contact,
            "softwareDevCountryCode": config.software_dev_country_code,
            "softwareDevTaxNumber": config.software_dev_tax_number,
        }
        self.token = None
        self._encoded_token = None
        # Hash-ek a manageInvoice aláíráshoz (SHA3-512(operation + invoiceDataBase64))
        self._invoice_hashes = []
        self.logger = logging.getLogger('invoices.nav')

    def _pkcs7_unpad(self, data: bytes) -> bytes:
        if not data:
            return data
        pad_len = data[-1]
        # guard against invalid padding
        if pad_len < 1 or pad_len > 16:
            return data
        return data[:-pad_len]

    def _decode_exchange_token(self, token_b64: str) -> str:
        """Decode NAV exchange token using AES-128-ECB with the exchangeKey.
        The token value in response is base64-encoded AES-128-ECB encrypted string (PKCS#7 padded).
        """
        try:
            from Crypto.Cipher import AES  # pycryptodome
        except Exception:
            # If crypto not available, return original (will fail with INVALID_EXCHANGE_TOKEN)
            return token_b64

        try:
            cipher_bytes = base64.b64decode(token_b64)
        except Exception:
            return token_b64

        key = (self.user_data.get('exchangeKey') or '').encode('utf-8')
        # Ensure valid AES key length (16/24/32). exchangeKey in NAV is 16 chars.
        if len(key) not in (16, 24, 32):
            # pad/truncate to 16
            if len(key) < 16:
                key = (key + b'0' * 16)[:16]
            else:
                key = key[:16]

        try:
            cipher = AES.new(key, AES.MODE_ECB)
            plain = cipher.decrypt(cipher_bytes)
            plain = self._pkcs7_unpad(plain)
            return plain.decode('utf-8', errors='ignore').strip()
        except Exception:
            return token_b64

    def _generate_request_id(self) -> str:
        """Generate unique request ID following NAV pattern: [+a-zA-Z0-9_]{1,30}"""
        import random
        import time
        # Generate unique request ID with timestamp and random
        timestamp = str(int(time.time() * 1000))  # milliseconds
        random_suffix = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=8))
        request_id = f"RID{timestamp}{random_suffix}"
        # Keep only uppercase letters and numbers, max 30 chars
        request_id = ''.join(c for c in request_id if c.isalnum() and c.isupper() or c.isdigit())
        return request_id[:30]
    
    def _get_timestamp(self) -> str:
        """Get UTC timestamp in NAV format (with milliseconds)"""
        # NAV expects UTC time in the header (with ms) e.g. 2025-09-10T19:41:27.835Z
        now = datetime.utcnow()
        milliseconds = int(now.microsecond / 1000)
        return now.strftime('%Y-%m-%dT%H:%M:%S') + f'.{milliseconds:03d}Z'
    
    def _get_request_signature(self, request_id: str, timestamp: str, operation: Optional[str] = None) -> str:
        """Get request signature hash using UTC timestamp without milliseconds.
        NAV v3: manageInvoice esetén a string = requestId + tisztított timestamp + signKey +
        minden számlára: SHA3-512(invoiceOperation + invoiceDataBase64)
        """
        import re
        # NAV spec: signature over requestId + timestamp(yyyyMMddHHmmss, UTC, no ms) + signKey (+ invoice hash-ek)
        # Strip milliseconds first, then remove all non-digits to get yyyyMMddHHmmss
        ts_no_ms = timestamp.split('.', 1)[0]  # e.g. 2025-09-10T19:41:27
        timestamp_clean = re.sub(r"\D+", "", ts_no_ms)  # -> 20250910194127

        # Alap komponensek
        signature_string = request_id + timestamp_clean + self.user_data['signKey']

        # manageInvoice esetén: számlahash(ek) hozzáfűzése
        if operation == 'manageInvoice' and getattr(self, '_invoice_hashes', None):
            for h in self._invoice_hashes:
                signature_string += h

        # Debug log to console + file
        try:
            self.logger.debug("ALÁÍRÁS GENERÁLÁS DEBUG →")
            self.logger.debug(f"op={operation} reqId={request_id} ts={timestamp} clean={timestamp_clean}")
            if operation == 'manageInvoice':
                self.logger.debug(f"invoice_hash_count={len(getattr(self, '_invoice_hashes', []))}")
        except Exception:
            pass

        # Optional raw logging for manual verification (enable with NAV_LOG_SIGNATURE_RAW=1)
        try:
            if os.environ.get('NAV_LOG_SIGNATURE_RAW') == '1':
                self.logger.warning('[NAV RAW] op=%s reqId=%s tsClean=%s encodedExchangeToken=%s signKey=%s',
                                    operation, request_id, timestamp_clean, (self._encoded_token or ''), self.user_data.get('signKey',''))
                self.logger.warning('[NAV RAW] signature_input=%s', signature_string)
        except Exception:
            pass

        signature_hash = self._hash_sha3_512(signature_string)
        try:
            self.logger.debug(f"signature_hash={signature_hash}")
        except Exception:
            pass

        return signature_hash

    def _create_envelope(self, request_data: str, operation: str) -> str:
        """Create XML request for NAV API (not SOAP)"""
        request_id = self._generate_request_id()
        timestamp = self._get_timestamp()
        
        # Determine root element based on operation (NAV v3)
        root_map = {
            'queryTaxpayer': 'QueryTaxpayerRequest',
            'tokenExchange': 'TokenExchangeRequest',
            'manageInvoice': 'ManageInvoiceRequest',
            'queryTransactionStatus': 'QueryTransactionStatusRequest',
            'queryInvoiceDigest': 'QueryInvoiceDigestRequest',
            'queryInvoiceData': 'QueryInvoiceDataRequest',
        }
        root_element = root_map.get(operation, 'QueryTaxpayerRequest')
        
        # Create the main XML structure
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<{root_element} xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common" xmlns="http://schemas.nav.gov.hu/OSA/3.0/api">
    <common:header>
        <common:requestId>{request_id}</common:requestId>
        <common:timestamp>{timestamp}</common:timestamp>
        <common:requestVersion>3.0</common:requestVersion>
        <common:headerVersion>1.0</common:headerVersion>
    </common:header>
    <common:user>
        <common:login>{self.user_data['login']}</common:login>
               <common:passwordHash cryptoType="SHA-512">{self._hash_password(self.user_data['password'])}</common:passwordHash>
        <common:taxNumber>{self.user_data['taxNumber']}</common:taxNumber>
        <common:requestSignature cryptoType="SHA3-512">{self._get_request_signature(request_id, timestamp, operation)}</common:requestSignature>
    </common:user>
    <software>
        <softwareId>{self.software_data['softwareId']}</softwareId>
        <softwareName>{self.software_data['softwareName']}</softwareName>
        <softwareOperation>{self.software_data['softwareOperation']}</softwareOperation>
        <softwareMainVersion>{self.software_data['softwareMainVersion']}</softwareMainVersion>
        <softwareDevName>{self.software_data['softwareDevName']}</softwareDevName>
        <softwareDevContact>{self.software_data['softwareDevContact']}</softwareDevContact>
        <softwareDevCountryCode>{self.software_data['softwareDevCountryCode']}</softwareDevCountryCode>
        <softwareDevTaxNumber>{self.software_data['softwareDevTaxNumber']}</softwareDevTaxNumber>
    </software>
    {request_data}
</{root_element}>"""
        return xml

    def query_invoice_digest(self, direction: str, date_from: str, date_to: str, page: int = 1) -> Dict[str, Any]:
        """Query invoice digest for a date range.
        - direction: 'INBOUND' for incoming invoices; 'OUTBOUND' for outgoing
        - If date_from/date_to are date-only (YYYY-MM-DD), use invoiceIssueDate (dateFrom/dateTo)
        - If they include time (contain 'T'), use insDate (dateTimeFrom/dateTimeTo) and ensure 'Z' suffix per schema
        """
        df_raw = (date_from or '').strip()
        dt_raw = (date_to or '').strip()

        use_datetime = ('T' in df_raw) or ('T' in dt_raw)
        if use_datetime:
            df = df_raw
            dt = dt_raw
            if not df.endswith('Z'):
                df = df + 'Z'
            if not dt.endswith('Z'):
                dt = dt + 'Z'
            request_data = f"""
    <page>{page}</page>
    <invoiceDirection>{direction}</invoiceDirection>
    <invoiceQueryParams>
        <mandatoryQueryParams>
            <insDate>
                <dateTimeFrom>{df}</dateTimeFrom>
                <dateTimeTo>{dt}</dateTimeTo>
            </insDate>
        </mandatoryQueryParams>
    </invoiceQueryParams>
            """
        else:
            request_data = f"""
    <page>{page}</page>
    <invoiceDirection>{direction}</invoiceDirection>
    <invoiceQueryParams>
        <mandatoryQueryParams>
            <invoiceIssueDate>
                <dateFrom>{df_raw}</dateFrom>
                <dateTo>{dt_raw}</dateTo>
            </invoiceIssueDate>
        </mandatoryQueryParams>
    </invoiceQueryParams>
            """
        return self._make_request('queryInvoiceDigest', request_data)

    def query_invoice_data(self, direction: str, invoice_number: str, supplier_tax_number: Optional[str] = None, batch_index: Optional[int] = None) -> Dict[str, Any]:
        """Query full invoice data XML for given invoice number and direction.
        NAV v3 schema: invoiceDirection and optional batchIndex/supplierTaxNumber are children of invoiceNumberQuery.
        """
        # Build inner XML with ElementTree to ensure correct nesting
        query_el = ET.Element('invoiceNumberQuery')
        inv_no_el = ET.SubElement(query_el, 'invoiceNumber')
        inv_no_el.text = invoice_number
        inv_dir_el = ET.SubElement(query_el, 'invoiceDirection')
        inv_dir_el.text = direction
        if batch_index is not None:
            bi_el = ET.SubElement(query_el, 'batchIndex')
            bi_el.text = str(batch_index)
        if supplier_tax_number:
            stn_el = ET.SubElement(query_el, 'supplierTaxNumber')
            stn_el.text = supplier_tax_number

        fragment = ET.tostring(query_el, encoding='unicode')
        request_data = f"\n    {fragment}\n        "
        return self._make_request('queryInvoiceData', request_data)

    def _determine_operation(self, invoice: Invoice) -> str:
        """Decide NAV manageInvoice operation based on invoice context."""
        try:
            # Explicit correction
            if getattr(invoice, 'invoice_category', '') == 'CORRECTION':
                return 'MODIFY'
            # Storno by note hint
            notes = (getattr(invoice, 'notes', '') or '').lower()
            if 'sztornó' in notes or 'storno' in notes:
                # NAV minták alapján a sztornó is módosító (MODIFY) okirat sorhivatkozással
                return 'MODIFY'
        except Exception:
            pass
        return 'CREATE'

    def _make_request(self, operation: str, request_data: str) -> Dict[str, Any]:
        """Make XML request to NAV API"""
        xml_request = self._create_envelope(request_data, operation)
        
        # Log a NAV-nak küldött XML-ről (első 500 karakter)
        try:
            self.logger.info(f"NAV request URL: {self.api_url}/{operation}")
            self.logger.debug(f"NAV request XML (first 500): {xml_request[:500]}...")
        except Exception:
            pass
        
        # XML mentése fájlba (ha engedélyezett a cégben)
        import os
        from datetime import datetime
        try:
            company_enabled = True
            try:
                # NAVConfiguration -> company kapcsolaton keresztül olvassuk a kapcsolót
                company_enabled = bool(self.config.company.xml_logging_enabled)
            except Exception:
                company_enabled = True
            if company_enabled:
                xml_dir = "/wb2/pixinvoice/xml_logs"
                os.makedirs(xml_dir, exist_ok=True)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                filename = f"{operation}_{timestamp}.xml"
                filepath = os.path.join(xml_dir, filename)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(xml_request)
                print(f"XML mentve: {filepath}")
        except Exception:
            pass
        
        headers = {
            'Content-Type': 'application/xml; charset=utf-8',
        }
        
        try:
            # Add the operation endpoint to the API URL
            url = f"{self.api_url}/{operation}"
            response = requests.post(
                url,
                data=xml_request,
                headers=headers,
                timeout=70
            )
            
            # Válasz XML mentése (ha engedélyezett)
            try:
                company_enabled = True
                try:
                    company_enabled = bool(self.config.company.xml_logging_enabled)
                except Exception:
                    company_enabled = True
                if company_enabled:
                    xml_dir = "/wb2/pixinvoice/xml_logs"
                    response_filename = f"{operation}_response_{timestamp}.xml"
                    response_filepath = os.path.join(xml_dir, response_filename)
                    with open(response_filepath, 'w', encoding='utf-8') as f:
                        f.write(response.text)
                    print(f"Válasz XML mentve: {response_filepath}")
            except Exception:
                pass
            
            # Check if response is successful
            if response.status_code == 200:
                # Parse XML response
                root = ET.fromstring(response.content)

                # Default result
                result = {
                    'success': True,
                    'response': response.text,
                    'status_code': response.status_code
                }

                # funcCode ellenőrzése (common namespace-ben)
                NS_COMMON = '{http://schemas.nav.gov.hu/NTCA/1.0/common}'
                func = root.find(f'.//{NS_COMMON}funcCode')
                if func is not None:
                    result['func_code'] = func.text
                    if func.text != 'OK':
                        # Részletes hiba kiolvasás
                        err_code = root.find(f'.//{NS_COMMON}errorCode')
                        err_msg = root.find(f'.//{NS_COMMON}message')
                        result['success'] = False
                        result['error'] = (err_code.text if err_code is not None else 'NAV_ERROR')
                        if err_msg is not None and err_msg.text:
                            result['error_message'] = err_msg.text

                # manageInvoice esetén a transactionId az API namespace-ben
                if operation == 'manageInvoice':
                    NS_API = '{http://schemas.nav.gov.hu/OSA/3.0/api}'
                    tx = root.find(f'.//{NS_API}transactionId')
                    if tx is not None and tx.text:
                        result['transaction_id'] = tx.text

                # Warnings/messages kigyűjtése (technikai és üzleti)
                try:
                    ns_api = '{http://schemas.nav.gov.hu/OSA/3.0/api}'
                    tech_msgs = []
                    for m in root.findall(f'.//{ns_api}technicalValidationMessages'):
                        code = (m.find(f'{ns_api}validationErrorCode') or m.find('validationErrorCode'))
                        msg = (m.find(f'{ns_api}message') or m.find('message'))
                        if (code is not None and code.text) or (msg is not None and msg.text):
                            tech_msgs.append({'code': code.text if code is not None else None, 'message': msg.text if msg is not None else None})
                    bus_msgs = []
                    for m in root.findall(f'.//{ns_api}businessValidationMessages'):
                        code = (m.find(f'{ns_api}validationErrorCode') or m.find('validationErrorCode'))
                        msg = (m.find(f'{ns_api}message') or m.find('message'))
                        if (code is not None and code.text) or (msg is not None and msg.text):
                            bus_msgs.append({'code': code.text if code is not None else None, 'message': msg.text if msg is not None else None})
                    if tech_msgs or bus_msgs:
                        result['warnings'] = {'technical': tech_msgs, 'business': bus_msgs}
                except Exception:
                    pass

                return result
            else:
                # Handle non-200 status codes
                return {
                    'success': False,
                    'error': f'HTTP {response.status_code}: {response.text}',
                    'status_code': response.status_code,
                    'response': response.text
                }
            
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': str(e),
                'status_code': getattr(e.response, 'status_code', None) if hasattr(e, 'response') else None
            }

    def get_token(self) -> Dict[str, Any]:
        """Get authentication token from NAV (TokenExchange). Body not required beyond header/user/software."""
        result = self._make_request('tokenExchange', "")
        
        if result['success']:
            # Parse and decode token from response
            try:
                root = ET.fromstring(result['response'])
                ns_api = '{http://schemas.nav.gov.hu/OSA/3.0/api}'
                # NAV v3 uses encodedExchangeToken
                token_element = root.find(f'.//{ns_api}encodedExchangeToken')
                if token_element is None:
                    # fallback for any alternative naming
                    token_element = root.find(f'.//{ns_api}token')
                if token_element is not None and token_element.text:
                    self._encoded_token = token_element.text
                    decoded = self._decode_exchange_token(token_element.text)
                    self.token = decoded
                    result['token'] = self.token
                else:
                    result['success'] = False
                    result['error'] = 'encodedExchangeToken not found in response'
            except ET.ParseError:
                result['success'] = False
                result['error'] = 'Failed to parse token from response'
        
        return result

    def _hash_password(self, password: str) -> str:
        """Hash password using SHA-512"""
        return hashlib.sha512(password.encode('utf-8')).hexdigest().upper()
    
    def _hash_sha3_512(self, text: str) -> str:
        """Hash text with SHA3-512"""
        try:
            # Try to use hashlib SHA3-512 (Python 3.6+)
            return hashlib.sha3_512(text.encode('utf-8')).hexdigest().upper()
        except AttributeError:
            # Fallback to SHA-512 if SHA3-512 is not available
            return hashlib.sha512(text.encode('utf-8')).hexdigest().upper()

    def create_invoice_xml(self, invoice: Invoice) -> str:
        """Create NAV-compliant invoice XML (OSA 3.0/data namespace)."""
        from decimal import Decimal, ROUND_HALF_UP

        def q2(v) -> str:
            try:
                d = Decimal(v)
            except Exception:
                d = Decimal('0')
            return f"{d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"

        def q4(v) -> str:
            try:
                d = Decimal(v)
            except Exception:
                d = Decimal('0')
            return f"{d.quantize(Decimal('0.0000'), rounding=ROUND_HALF_UP)}"

        NS_DATA = "http://schemas.nav.gov.hu/OSA/3.0/data"
        NS_BASE = "http://schemas.nav.gov.hu/OSA/3.0/base"
        NS_COMMON = "http://schemas.nav.gov.hu/NTCA/1.0/common"

        ET.register_namespace('', NS_DATA)
        ET.register_namespace('base', NS_BASE)
        ET.register_namespace('common', NS_COMMON)

        root = ET.Element('{%s}InvoiceData' % NS_DATA)

        # Basic header
        ET.SubElement(root, '{%s}invoiceNumber' % NS_DATA).text = str(invoice.invoice_number)
        ET.SubElement(root, '{%s}invoiceIssueDate' % NS_DATA).text = invoice.issue_date.strftime('%Y-%m-%d')
        # Biztonságosabb default: completenessIndicator=false (nem elektronikus számla hash)
        ET.SubElement(root, '{%s}completenessIndicator' % NS_DATA).text = 'false'

        invoiceMain = ET.SubElement(root, '{%s}invoiceMain' % NS_DATA)
        invoiceElem = ET.SubElement(invoiceMain, '{%s}invoice' % NS_DATA)

        # Determine op for conditional sections
        op_kind = self._determine_operation(invoice)

        # invoiceReference (számlalánc) – csak MODIFY/STORNO esetén
        # Formátum amit beállítottunk: "Sztornó számla az alábbi számlára: {orig_no}"
        try:
            notes = getattr(invoice, 'notes', '') or ''
            orig_no = None
            marker = 'Sztornó számla az alábbi számlára:'
            if marker in notes:
                orig_no = notes.split(marker, 1)[1].strip().split()[0]
            if not orig_no and getattr(invoice, 'order_reference', None):
                orig_no = invoice.order_reference
            if orig_no and op_kind in ('MODIFY', 'STORNO'):
                invRef = ET.SubElement(invoiceElem, '{%s}invoiceReference' % NS_DATA)
                ET.SubElement(invRef, '{%s}originalInvoiceNumber' % NS_DATA).text = orig_no
                ET.SubElement(invRef, '{%s}modifyWithoutMaster' % NS_DATA).text = 'false'
                ET.SubElement(invRef, '{%s}modificationIndex' % NS_DATA).text = '1'
        except Exception:
            pass

        # invoiceHead
        invoiceHead = ET.SubElement(invoiceElem, '{%s}invoiceHead' % NS_DATA)

        # supplierInfo
        supplierInfo = ET.SubElement(invoiceHead, '{%s}supplierInfo' % NS_DATA)
        supplierTaxNumber = ET.SubElement(supplierInfo, '{%s}supplierTaxNumber' % NS_DATA)
        baseTaxpayerId = ET.SubElement(supplierTaxNumber, '{%s}taxpayerId' % NS_BASE)
        # Eladó: a számla kiállító cég adószáma (8 számjegy)
        supplier_tax_id = getattr(invoice.company, 'tax_number', None) or self.user_data.get('taxNumber', '')
        baseTaxpayerId.text = (supplier_tax_id or '')[:8]
        baseVatCode = ET.SubElement(supplierTaxNumber, '{%s}vatCode' % NS_BASE)
        baseVatCode.text = (getattr(invoice.company, 'vat_code', None) or '2')
        baseCounty = ET.SubElement(supplierTaxNumber, '{%s}countyCode' % NS_BASE)
        baseCounty.text = (getattr(invoice.company, 'county_code', None) or '02')

        ET.SubElement(supplierInfo, '{%s}supplierName' % NS_DATA).text = getattr(invoice.company, 'name', '')

        supplierAddress = ET.SubElement(supplierInfo, '{%s}supplierAddress' % NS_DATA)
        detailed = ET.SubElement(supplierAddress, '{%s}detailedAddress' % NS_BASE)
        ET.SubElement(detailed, '{%s}countryCode' % NS_BASE).text = 'HU'
        ET.SubElement(detailed, '{%s}postalCode' % NS_BASE).text = getattr(invoice.company, 'postal_code', '') or '0000'
        ET.SubElement(detailed, '{%s}city' % NS_BASE).text = getattr(invoice.company, 'city', '') or 'Budapest'
        ET.SubElement(detailed, '{%s}streetName' % NS_BASE).text = getattr(invoice.company, 'street_name', '') or 'Ismeretlen utca'
        ET.SubElement(detailed, '{%s}publicPlaceCategory' % NS_BASE).text = getattr(invoice.company, 'public_place_category', '') or 'utca'
        ET.SubElement(detailed, '{%s}number' % NS_BASE).text = getattr(invoice.company, 'street_number', '') or '1'

        # customerInfo
        customerInfo = ET.SubElement(invoiceHead, '{%s}customerInfo' % NS_DATA)
        ET.SubElement(customerInfo, '{%s}customerVatStatus' % NS_DATA).text = getattr(invoice.customer, 'vat_status', 'DOMESTIC')
        customerVatData = ET.SubElement(customerInfo, '{%s}customerVatData' % NS_DATA)
        
        # Adószám meghatározása (belföldi, EU-s vagy harmadik országbeli)
        cust = invoice.customer
        is_hungarian = getattr(cust, 'is_hungarian_taxpayer', True)
        if is_hungarian:
            customerTaxNumber = ET.SubElement(customerVatData, '{%s}customerTaxNumber' % NS_DATA)
            try:
                taxpayer_id_src = (getattr(cust, 'vat_group_id', None) or '').strip() or (getattr(cust, 'tax_number', None) or '').strip()
            except Exception:
                taxpayer_id_src = (invoice.customer.tax_number or '')
            ET.SubElement(customerTaxNumber, '{%s}taxpayerId' % NS_BASE).text = taxpayer_id_src[:8]
            ET.SubElement(customerTaxNumber, '{%s}vatCode' % NS_BASE).text = getattr(invoice.customer, 'vat_code', None) or '2'
            ET.SubElement(customerTaxNumber, '{%s}countyCode' % NS_BASE).text = getattr(invoice.customer, 'county_code', None) or '02'
        elif getattr(cust, 'eu_tax_number', None):
             ET.SubElement(customerVatData, '{%s}communityVatNumber' % NS_DATA).text = cust.eu_tax_number
        else:
             # Harmadik ország
             tax_id_val = (getattr(cust, 'tax_number', None) or 'UNKNOWN')
             ET.SubElement(customerVatData, '{%s}thirdStateTaxId' % NS_DATA).text = tax_id_val

        ET.SubElement(customerInfo, '{%s}customerName' % NS_DATA).text = invoice.customer.name
        custAddr = ET.SubElement(customerInfo, '{%s}customerAddress' % NS_DATA)
        custDet = ET.SubElement(custAddr, '{%s}detailedAddress' % NS_BASE)
        
        # Determine country code
        country_code = 'HU'
        if invoice.customer.country:
            c_upper = invoice.customer.country.upper()
            if c_upper in ['MAGYARORSZÁG', 'HUNGARY', 'HU']:
                country_code = 'HU'
            elif c_upper in ['FRANCIAORSZÁG', 'FRANCE', 'FR']:
                country_code = 'FR'
            elif c_upper in ['NÉMETORSZÁG', 'GERMANY', 'DE']:
                country_code = 'DE'
            elif c_upper in ['AUSZTRIA', 'AUSTRIA', 'AT']:
                country_code = 'AT'
            elif len(c_upper) == 2:
                country_code = c_upper

        ET.SubElement(custDet, '{%s}countryCode' % NS_BASE).text = country_code
        ET.SubElement(custDet, '{%s}postalCode' % NS_BASE).text = invoice.customer.postal_code or '0000'
        ET.SubElement(custDet, '{%s}city' % NS_BASE).text = invoice.customer.city or 'Unknown'
        
        street_val = (invoice.customer.street_name or invoice.customer.address or '').strip()
        # Sanitize street value (remove newlines, collapse spaces)
        street_val = re.sub(r'\s+', ' ', street_val)
        ET.SubElement(custDet, '{%s}streetName' % NS_BASE).text = street_val if street_val else 'Unknown Street'
        
        ET.SubElement(custDet, '{%s}publicPlaceCategory' % NS_BASE).text = (invoice.customer.public_place_category or 'utca')
        ET.SubElement(custDet, '{%s}number' % NS_BASE).text = (invoice.customer.street_number or '1')

        # invoiceDetail (fejléc részletei)
        invoiceDetail = ET.SubElement(invoiceHead, '{%s}invoiceDetail' % NS_DATA)
        # A beküldés mindig NORMAL kategóriával történik a NAV felé,
        # akkor is, ha a UI-ban egyszerűsítettként jelenik meg.
        category_value = 'NORMAL'
        ET.SubElement(invoiceDetail, '{%s}invoiceCategory' % NS_DATA).text = category_value
        ET.SubElement(invoiceDetail, '{%s}invoiceDeliveryDate' % NS_DATA).text = (
            (invoice.delivery_date or invoice.issue_date).strftime('%Y-%m-%d')
        )
        ET.SubElement(invoiceDetail, '{%s}currencyCode' % NS_DATA).text = invoice.currency
        ET.SubElement(invoiceDetail, '{%s}exchangeRate' % NS_DATA).text = q4(invoice.exchange_rate)

        pay_method_map = {
            'transfer': 'TRANSFER',
            'cash': 'CASH',
            'card': 'CARD',
            'voucher': 'VOUCHER',
            'cod': 'OTHER',
            'other': 'OTHER'
        }
        ET.SubElement(invoiceDetail, '{%s}paymentMethod' % NS_DATA).text = pay_method_map.get(invoice.payment_method, 'TRANSFER')
        if getattr(invoice, 'due_date', None):
            ET.SubElement(invoiceDetail, '{%s}paymentDate' % NS_DATA).text = invoice.due_date.strftime('%Y-%m-%d')
        ET.SubElement(invoiceDetail, '{%s}invoiceAppearance' % NS_DATA).text = invoice.invoice_appearance

        # invoiceLines
        invoiceLines = ET.SubElement(invoiceElem, '{%s}invoiceLines' % NS_DATA)
        ET.SubElement(invoiceLines, '{%s}mergedItemIndicator' % NS_DATA).text = 'false'

        # Egység-átalakítás a NAV által elfogadott enumokra
        def map_uom(uom_raw: Optional[str]):
            allowed = {
                'PIECE', 'KILOGRAM', 'TON', 'KWH', 'DAY', 'HOUR', 'MINUTE', 'MONTH', 'LITER',
                'KILOMETER', 'CUBIC_METER', 'METER', 'LINEAR_METER', 'CARTON', 'PACK', 'OWN'
            }
            if not uom_raw:
                return 'PIECE', None
            u = str(uom_raw).strip()
            u_upper = u.upper()
            if u_upper in allowed:
                # Már NAV enum
                return u_upper, None
            u_l = u.lower()
            mapping = {
                'db': 'PIECE', 'darab': 'PIECE', 'pcs': 'PIECE',
                'kg': 'KILOGRAM', 'kilogram': 'KILOGRAM',
                't': 'TON', 'tonna': 'TON',
                'kwh': 'KWH',
                'nap': 'DAY', 'day': 'DAY',
                'óra': 'HOUR', 'ora': 'HOUR', 'h': 'HOUR', 'hour': 'HOUR',
                'perc': 'MINUTE', 'minute': 'MINUTE', 'min': 'MINUTE',
                'hónap': 'MONTH', 'honap': 'MONTH', 'month': 'MONTH',
                'l': 'LITER', 'liter': 'LITER',
                'km': 'KILOMETER', 'kilometer': 'KILOMETER',
                'm3': 'CUBIC_METER', 'köbméter': 'CUBIC_METER', 'kobmeter': 'CUBIC_METER', 'cubic_meter': 'CUBIC_METER',
                'm': 'METER', 'méter': 'METER', 'meter': 'METER',
                'fm': 'LINEAR_METER', 'folyóméter': 'LINEAR_METER', 'folyometer': 'LINEAR_METER', 'linear_meter': 'LINEAR_METER',
                'karton': 'CARTON', 'carton': 'CARTON',
                'csomag': 'PACK', 'pack': 'PACK', 'pkg': 'PACK',
            }
            if u_l in mapping:
                return mapping[u_l], None
            # Ismeretlen: OWN + saját megnevezés
            return 'OWN', u

        # Tételsorok
        total_net = Decimal('0')
        total_vat = Decimal('0')
        rate_buckets = {}
        line_no = 1
        huf_rate = Decimal(str(invoice.exchange_rate or '1'))
        
        # Feltöltésben minden számla normál szerkezetű
        is_simplified = False
        for item in invoice.items.all():
            try:
                if (getattr(invoice, 'invoice_category', None) == 'FINAL'):
                    desc = (getattr(item, 'description', '') or '').strip().lower()
                    # Skip client/backend negative advance deduction items; allocations add correct lines later
                    if desc.startswith('előleg beszámítás') or desc.startswith('eloleg beszamitas'):
                        continue
            except Exception:
                pass
            line = ET.SubElement(invoiceLines, '{%s}line' % NS_DATA)
            ET.SubElement(line, '{%s}lineNumber' % NS_DATA).text = str(line_no)

            # lineModificationReference csak MODIFY esetén és a sor elején
            if op_kind == 'MODIFY':
                try:
                    lmr = ET.SubElement(line, '{%s}lineModificationReference' % NS_DATA)
                    # CREATE esetén a lineNumberReference nem ütközhet a számlalánc meglévő sorszámaival.
                    # Mivel az eredeti sorok sorszámait nem ismerjük, konzervatív nagy offsetet alkalmazunk (8000+index),
                    # ami biztosan nem volt használatban az alapszámlában.
                    base_ref = 8000
                    orig_ln = getattr(item, 'original_line_number', None)
                    if orig_ln:
                        ref_no = base_ref + int(orig_ln)
                    else:
                        ref_no = base_ref + int(line_no)
                    ET.SubElement(lmr, '{%s}lineNumberReference' % NS_DATA).text = str(ref_no)
                    ET.SubElement(lmr, '{%s}lineOperation' % NS_DATA).text = (getattr(item, 'line_operation', None) or 'CREATE')
                except Exception:
                    pass

            line_no += 1

            # alap adatok
            ET.SubElement(line, '{%s}lineExpressionIndicator' % NS_DATA).text = 'true'
            ET.SubElement(line, '{%s}lineNatureIndicator' % NS_DATA).text = (item.nature_indicator or 'PRODUCT')
            ET.SubElement(line, '{%s}lineDescription' % NS_DATA).text = item.description
            ET.SubElement(line, '{%s}quantity' % NS_DATA).text = q2(item.quantity)
            u_code, u_own = map_uom(getattr(item, 'unit_of_measure', None))
            ET.SubElement(line, '{%s}unitOfMeasure' % NS_DATA).text = u_code
            if u_code == 'OWN':
                # Saját mértékegység megnevezése kötelező OWN esetén
                ET.SubElement(line, '{%s}unitOfMeasureOwn' % NS_DATA).text = (u_own or 'OWN')
            ET.SubElement(line, '{%s}unitPrice' % NS_DATA).text = q2(item.unit_price)

            net = Decimal(str(item.net_amount))
            vat_pct = (Decimal(str(item.vat_rate or 0)) / Decimal('100')).quantize(Decimal('0.0000'), rounding=ROUND_HALF_UP)
            vat_amount = (net * vat_pct)
            gross = net + vat_amount
            total_net += net
            total_vat += vat_amount
            # Kulcs és megjelenítés: 4 tizedesjegy, hogy következetes legyen a line és summary között
            rate_key = q4(vat_pct)
            rb = rate_buckets.get(rate_key, {'net': Decimal('0'), 'vat': Decimal('0'), 'gross': Decimal('0')})
            rb['net'] += net
            rb['vat'] += vat_amount
            rb['gross'] += gross
            rate_buckets[rate_key] = rb

            # (LMR korábban került beillesztésre)

            if is_simplified:
                lineAmountsSimpl = ET.SubElement(line, '{%s}lineAmountsSimplified' % NS_DATA)
                vatRate = ET.SubElement(lineAmountsSimpl, '{%s}lineVatRate' % NS_DATA)
                ET.SubElement(vatRate, '{%s}vatPercentage' % NS_DATA).text = q4(vat_pct)
                ET.SubElement(lineAmountsSimpl, '{%s}lineGrossAmountSimplified' % NS_DATA).text = q2(gross)
                if invoice.currency == 'HUF':
                    ET.SubElement(lineAmountsSimpl, '{%s}lineGrossAmountSimplifiedHUF' % NS_DATA).text = q2(gross)
            else:
                lineAmountsNormal = ET.SubElement(line, '{%s}lineAmountsNormal' % NS_DATA)
                netData = ET.SubElement(lineAmountsNormal, '{%s}lineNetAmountData' % NS_DATA)
                ET.SubElement(netData, '{%s}lineNetAmount' % NS_DATA).text = q2(net)
                ET.SubElement(netData, '{%s}lineNetAmountHUF' % NS_DATA).text = q2(net * huf_rate)

                vatRate = ET.SubElement(lineAmountsNormal, '{%s}lineVatRate' % NS_DATA)
                ET.SubElement(vatRate, '{%s}vatPercentage' % NS_DATA).text = q4(vat_pct)

                vatData = ET.SubElement(lineAmountsNormal, '{%s}lineVatData' % NS_DATA)
                ET.SubElement(vatData, '{%s}lineVatAmount' % NS_DATA).text = q2(vat_amount)
                ET.SubElement(vatData, '{%s}lineVatAmountHUF' % NS_DATA).text = q2(vat_amount * huf_rate)

                grossData = ET.SubElement(lineAmountsNormal, '{%s}lineGrossAmountData' % NS_DATA)
                ET.SubElement(grossData, '{%s}lineGrossAmountNormal' % NS_DATA).text = q2(gross)
                ET.SubElement(grossData, '{%s}lineGrossAmountNormalHUF' % NS_DATA).text = q2(gross * huf_rate)

        # Add advance deduction lines for FINAL invoices based on allocations
        try:
            allocs = AdvanceAllocation.objects.filter(final_invoice=invoice)
            if allocs.exists():
                from decimal import Decimal
                for alloc in allocs:
                    adv = alloc.advance_invoice
                    # Build VAT composition of advance invoice
                    adv_total_gross = Decimal('0')
                    adv_rate_gross = {}
                    for it in adv.items.all():
                        rate = Decimal(str(it.vat_rate or 0))
                        net = Decimal(str(it.quantity * it.unit_price))
                        gross = net * (Decimal('1') + (rate/Decimal('100')))
                        adv_total_gross += gross
                        adv_rate_gross[rate] = adv_rate_gross.get(rate, Decimal('0')) + gross
                    if adv_total_gross <= 0:
                        continue
                    # Split allocated gross by advance VAT composition
                    remaining_alloc = Decimal(str(alloc.amount))
                    for rate, g in adv_rate_gross.items():
                        portion_gross = (Decimal(str(alloc.amount)) * (g / adv_total_gross)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        # Last rate adjust for rounding
                        # Negative deduction line
                        portion_gross = -portion_gross
                        vat_pct = (rate / Decimal('100')).quantize(Decimal('0.0000'), rounding=ROUND_HALF_UP)
                        net = (portion_gross / (Decimal('1') + vat_pct)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        vat_amount = portion_gross - net

                        # Append line
                        line = ET.SubElement(invoiceLines, '{%s}line' % NS_DATA)
                        ET.SubElement(line, '{%s}lineNumber' % NS_DATA).text = str(line_no)
                        line_no += 1
                        ET.SubElement(line, '{%s}lineExpressionIndicator' % NS_DATA).text = 'true'
                        ET.SubElement(line, '{%s}lineNatureIndicator' % NS_DATA).text = 'OTHER'
                        ET.SubElement(line, '{%s}lineDescription' % NS_DATA).text = f"Előleg beszámítása ({adv.invoice_number})"
                        ET.SubElement(line, '{%s}quantity' % NS_DATA).text = q2(Decimal('1'))
                        ET.SubElement(line, '{%s}unitOfMeasure' % NS_DATA).text = 'PIECE'
                        ET.SubElement(line, '{%s}unitPrice' % NS_DATA).text = q2(net)

                        total_net += net
                        total_vat += vat_amount
                        rate_key = q4(vat_pct)
                        rb = rate_buckets.get(rate_key, {'net': Decimal('0'), 'vat': Decimal('0'), 'gross': Decimal('0')})
                        rb['net'] += net
                        rb['vat'] += vat_amount
                        rb['gross'] += portion_gross
                        rate_buckets[rate_key] = rb

                        lineAmountsNormal = ET.SubElement(line, '{%s}lineAmountsNormal' % NS_DATA)
                        netData = ET.SubElement(lineAmountsNormal, '{%s}lineNetAmountData' % NS_DATA)
                        ET.SubElement(netData, '{%s}lineNetAmount' % NS_DATA).text = q2(net)
                        ET.SubElement(netData, '{%s}lineNetAmountHUF' % NS_DATA).text = q2(net * huf_rate)
                        
                        vatRate = ET.SubElement(lineAmountsNormal, '{%s}lineVatRate' % NS_DATA)
                        ET.SubElement(vatRate, '{%s}vatPercentage' % NS_DATA).text = q4(vat_pct)
                        
                        vatData = ET.SubElement(lineAmountsNormal, '{%s}lineVatData' % NS_DATA)
                        ET.SubElement(vatData, '{%s}lineVatAmount' % NS_DATA).text = q2(vat_amount)
                        ET.SubElement(vatData, '{%s}lineVatAmountHUF' % NS_DATA).text = q2(vat_amount * huf_rate)
                        
                        grossData = ET.SubElement(lineAmountsNormal, '{%s}lineGrossAmountData' % NS_DATA)
                        ET.SubElement(grossData, '{%s}lineGrossAmountNormal' % NS_DATA).text = q2(portion_gross)
                        ET.SubElement(grossData, '{%s}lineGrossAmountNormalHUF' % NS_DATA).text = q2(portion_gross * huf_rate)
        except Exception:
            pass

        # invoiceSummary
        invoiceSummary = ET.SubElement(invoiceElem, '{%s}invoiceSummary' % NS_DATA)
        if is_simplified:
            # summarySimplified bejegyzések ÁFA-kulcsonként
            for rate_key, vals in rate_buckets.items():
                s = ET.SubElement(invoiceSummary, '{%s}summarySimplified' % NS_DATA)
                vr = ET.SubElement(s, '{%s}vatRate' % NS_DATA)
                ET.SubElement(vr, '{%s}vatPercentage' % NS_DATA).text = rate_key
                ET.SubElement(s, '{%s}vatContentGrossAmount' % NS_DATA).text = q2(vals['gross'])
                ET.SubElement(s, '{%s}vatContentGrossAmountHUF' % NS_DATA).text = q2(vals['gross'] * huf_rate)
        else:
            summaryNormal = ET.SubElement(invoiceSummary, '{%s}summaryNormal' % NS_DATA)

            # summaryByVatRate entries
            for rate_key, vals in rate_buckets.items():
                s = ET.SubElement(summaryNormal, '{%s}summaryByVatRate' % NS_DATA)
                vr = ET.SubElement(s, '{%s}vatRate' % NS_DATA)
                ET.SubElement(vr, '{%s}vatPercentage' % NS_DATA).text = rate_key

                netData = ET.SubElement(s, '{%s}vatRateNetData' % NS_DATA)
                ET.SubElement(netData, '{%s}vatRateNetAmount' % NS_DATA).text = q2(vals['net'])
                ET.SubElement(netData, '{%s}vatRateNetAmountHUF' % NS_DATA).text = q2(vals['net'] * huf_rate)

                vatData = ET.SubElement(s, '{%s}vatRateVatData' % NS_DATA)
                ET.SubElement(vatData, '{%s}vatRateVatAmount' % NS_DATA).text = q2(vals['vat'])
                ET.SubElement(vatData, '{%s}vatRateVatAmountHUF' % NS_DATA).text = q2(vals['vat'] * huf_rate)

                grossData = ET.SubElement(s, '{%s}vatRateGrossData' % NS_DATA)
                ET.SubElement(grossData, '{%s}vatRateGrossAmount' % NS_DATA).text = q2(vals['gross'])
                ET.SubElement(grossData, '{%s}vatRateGrossAmountHUF' % NS_DATA).text = q2(vals['gross'] * huf_rate)

            ET.SubElement(summaryNormal, '{%s}invoiceNetAmount' % NS_DATA).text = q2(total_net)
            ET.SubElement(summaryNormal, '{%s}invoiceNetAmountHUF' % NS_DATA).text = q2(total_net * huf_rate)
            ET.SubElement(summaryNormal, '{%s}invoiceVatAmount' % NS_DATA).text = q2(total_vat)
            ET.SubElement(summaryNormal, '{%s}invoiceVatAmountHUF' % NS_DATA).text = q2(total_vat * huf_rate)

        summaryGross = ET.SubElement(invoiceSummary, '{%s}summaryGrossData' % NS_DATA)
        total_gross = total_net + total_vat
        ET.SubElement(summaryGross, '{%s}invoiceGrossAmount' % NS_DATA).text = q2(total_gross)
        ET.SubElement(summaryGross, '{%s}invoiceGrossAmountHUF' % NS_DATA).text = q2(total_gross * huf_rate)

        return ET.tostring(root, encoding='utf-8', xml_declaration=True).decode('utf-8')

    def _create_invoice_lines_xml(self, invoice: Invoice) -> str:
        """Create invoice lines XML"""
        lines_xml = ""
        for item in invoice.items.all():
            lines_xml += f"""
                <line>
                    <lineNumber>{item.id}</lineNumber>
                    <lineDescription>{item.description}</lineDescription>
                    <quantity>{item.quantity}</quantity>
                    <unitOfMeasure>PIECE</unitOfMeasure>
                    <unitPrice>{item.unit_price}</unitPrice>
                    <lineNetAmount>{item.net_amount}</lineNetAmount>
                    <vatPercentage>{item.vat_rate}</vatPercentage>
                    <lineVatAmount>{item.vat_amount}</lineVatAmount>
                    <lineGrossAmount>{item.gross_amount}</lineGrossAmount>
                </line>"""
        return lines_xml

    def submit_invoice(self, invoice: Invoice) -> Dict[str, Any]:
        """Submit invoice to NAV"""
        if not self.token:
            token_result = self.get_token()
            if not token_result['success']:
                return token_result

        invoice_xml = self.create_invoice_xml(invoice)
        
        b64 = base64.b64encode(invoice_xml.encode('utf-8')).decode('utf-8')
        # Döntsük el az op-t (CREATE/MODIFY/STORNO)
        op = self._determine_operation(invoice)
        # Előre számoljuk a manageInvoice aláíráshoz szükséges hash(eke)t
        try:
            self._invoice_hashes = [self._hash_sha3_512(op + b64)]
        except Exception:
            self._invoice_hashes = []
        request_data = f"""
            <exchangeToken>{self.token}</exchangeToken>
            <invoiceOperations>
                <compressedContent>false</compressedContent>
                <invoiceOperation>
                    <index>1</index>
                    <invoiceOperation>{op}</invoiceOperation>
                    <invoiceData>{b64}</invoiceData>
                </invoiceOperation>
            </invoiceOperations>
        """
        
        result = self._make_request('manageInvoice', request_data)
        
        if result['success']:
            # Parse transaction ID from response
            try:
                root = ET.fromstring(result['response'])
                transaction_id_element = root.find('.//{http://schemas.nav.gov.hu/OSA/3.0/api}transactionId')
                if transaction_id_element is not None:
                    result['transaction_id'] = transaction_id_element.text
            except ET.ParseError:
                pass
        
        return result

    def query_transaction_status(self, transaction_id: str) -> Dict[str, Any]:
        """Query transaction status"""
        # Body elem az API namespace-ben van (alapértelmezett az envelope-ban)
        request_data = f"""
            <transactionId>{transaction_id}</transactionId>
        """
        result = self._make_request('queryTransactionStatus', request_data)
        # Próbáljuk kiolvasni a feldolgozási és számla státuszt
        if result.get('success') and result.get('response'):
            try:
                ns_api = '{http://schemas.nav.gov.hu/OSA/3.0/api}'
                root = ET.fromstring(result['response'])
                ps = root.find(f'.//{ns_api}processingStatus')
                inv_status = root.find(f'.//{ns_api}invoiceStatus')
                if ps is not None and ps.text:
                    result['processing_status'] = ps.text
                if inv_status is not None and inv_status.text:
                    result['invoice_status'] = inv_status.text
                    # kompatibilitás: ha nincs processing_status, használjuk az invoice_status-t
                    if not result.get('processing_status'):
                        result['processing_status'] = inv_status.text
            except ET.ParseError:
                pass
        return result

    def query_taxpayer(self, tax_number: str) -> Dict[str, Any]:
        """Query taxpayer information from NAV server"""
        request_data = f"""
    <taxNumber>{tax_number}</taxNumber>
        """
        
        return self._make_request('queryTaxpayer', request_data)
    
    def token_exchange(self) -> Dict[str, Any]:
        """Exchange token with NAV"""
        request_data = ""  # TokenExchangeRequest has no additional data
        return self._make_request('tokenExchange', request_data)
