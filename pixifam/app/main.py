import os
from decimal import Decimal, InvalidOperation
from typing import Optional
from urllib.parse import urljoin

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .schemas import (
    OpenCloseDayRequest,
    TelemetryHelloRequest,
    QueryTaxpayerRequest,
    EcrEventRequest,
    CurrencyPayload,
    PaymentMethodPayload,
    NavConfigPayload,
    DocumentSubmitPayload,
)
from .store import (
    ensure_system,
    ensure_nav_config,
    create_document_submission,
    list_documents,
    now_ms,
    save_state,
    touch,
    EVENTS,
    ERRORS,
    log_error,
    PREDEFINED_PAYMENT_METHODS,
)


load_dotenv()

app = FastAPI(title='PixiFAM', version='0.1.0')

origins = [item.strip() for item in os.getenv('ALLOW_ORIGINS', 'http://localhost:3000').split(',') if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

ERP_API_BASE = os.getenv('ERP_API_BASE', 'http://localhost:8003/api/v1').rstrip('/')


def result(code: str = 'SUCCESS', desc: Optional[str] = ''):
    return {'resultCode': code, 'resultDesc': desc}


def nav_config_to_dict(cfg):
    return {
        'mode': cfg.mode,
        'env': cfg.env,
        'connector': cfg.connector,
        'base_url': cfg.base_url,
        'api_key': cfg.api_key,
        'live_submit_path': cfg.live_submit_path,
        'live_taxpayer_path': cfg.live_taxpayer_path,
        'hepg_base_url': cfg.hepg_base_url,
        'hepg_submit_path': cfg.hepg_submit_path,
        'hepg_api_key': cfg.hepg_api_key,
        'hepg_device_id': cfg.hepg_device_id,
        'tech_user': cfg.tech_user,
        'tech_password': cfg.tech_password,
        'signing_key_ref': cfg.signing_key_ref,
        'exchange_key_ref': cfg.exchange_key_ref,
        'invoice_enabled': cfg.invoice_enabled,
        'ereceipt_enabled': cfg.ereceipt_enabled,
        'timeout_sec': cfg.timeout_sec,
        'retry_limit': cfg.retry_limit,
    }


def submission_to_dict(item):
    return {
        'id': item.id,
        'systemId': item.system_id,
        'documentType': item.document_type,
        'source': item.source,
        'externalId': item.external_id,
        'status': item.status,
        'navReference': item.nav_reference,
        'lastError': item.last_error,
        'retryCount': item.retry_count,
        'createdAt': item.created_at,
        'updatedAt': item.updated_at,
        'payload': item.payload,
    }


def _join_url(base_url: str, path: str) -> str:
    base = (base_url or '').strip()
    if not base:
        return ''
    if path.startswith('http://') or path.startswith('https://'):
        return path
    return urljoin(base.rstrip('/') + '/', path.lstrip('/'))


def _live_headers(cfg) -> dict:
    headers = {'Accept': 'application/json'}
    api_key = (cfg.api_key or '').strip()
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
        headers['X-API-Key'] = api_key
        headers['x-api-key'] = api_key
    return headers


def _hepg_headers(cfg) -> dict:
    headers = {'Accept': 'application/json'}
    api_key = (cfg.hepg_api_key or '').strip()
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
        headers['X-API-Key'] = api_key
        headers['x-api-key'] = api_key
    return headers


def _extract_reference_from_response(body: object) -> str:
    if isinstance(body, dict):
        for key in ('navReference', 'reference', 'transactionId', 'transaction_id', 'id'):
            value = body.get(key)
            if isinstance(value, (str, int)) and str(value).strip():
                return str(value).strip()
        for key in ('data', 'result', 'document', 'response'):
            child = body.get(key)
            ref = _extract_reference_from_response(child)
            if ref:
                return ref
    return ''


def _submit_live_document(item, cfg) -> tuple[bool, str, str]:
    submit_url = _join_url(cfg.base_url, cfg.live_submit_path)
    if not submit_url:
        return False, '', 'Hiányzó live submit URL'

    request_payload = {
        'system_id': item.system_id,
        'document_type': item.document_type,
        'source': item.source,
        'external_id': item.external_id,
        'payload': item.payload,
    }

    timeout = max(int(cfg.timeout_sec), 3)
    try:
        response = httpx.post(
            submit_url,
            json=request_payload,
            headers=_live_headers(cfg),
            timeout=timeout,
        )
    except Exception as ex:
        return False, '', f'Live connector hiba: {ex}'

    if response.status_code < 200 or response.status_code >= 300:
        reason = response.text.strip() or f'HTTP {response.status_code}'
        return False, '', f'Live submit sikertelen: {reason[:500]}'

    response_body = None
    try:
        response_body = response.json()
    except Exception:
        response_body = {'raw': response.text}

    nav_reference = _extract_reference_from_response(response_body)
    if not nav_reference:
        nav_reference = f'LIVE-{item.id:06d}'

    return True, nav_reference, ''


def _submit_hepg_document(item, cfg) -> tuple[bool, str, str]:
    submit_url = _join_url(cfg.hepg_base_url, cfg.hepg_submit_path)
    if not submit_url:
        return False, '', 'Hiányzó HePG submit URL'

    request_payload = {
        'deviceId': cfg.hepg_device_id or item.system_id,
        'documentType': item.document_type,
        'externalId': item.external_id,
        'source': item.source,
        'payload': item.payload,
    }

    timeout = max(int(cfg.timeout_sec), 3)
    try:
        response = httpx.post(
            submit_url,
            json=request_payload,
            headers=_hepg_headers(cfg),
            timeout=timeout,
        )
    except Exception as ex:
        return False, '', f'HePG connector hiba: {ex}'

    if response.status_code < 200 or response.status_code >= 300:
        reason = response.text.strip() or f'HTTP {response.status_code}'
        return False, '', f'HePG submit sikertelen: {reason[:500]}'

    response_body = None
    try:
        response_body = response.json()
    except Exception:
        response_body = {'raw': response.text}

    hepg_reference = _extract_reference_from_response(response_body)
    if not hepg_reference:
        hepg_reference = f'HEPG-{item.id:06d}'

    return True, hepg_reference, ''


def _process_submission(item):
    system = ensure_system(item.system_id)
    cfg = ensure_nav_config(item.system_id)

    if item.document_type == 'receipt' and not cfg.ereceipt_enabled:
        item.status = 'failed'
        item.last_error = 'E-nyugta beküldés nincs engedélyezve'
        item.updated_at = now_ms()
        log_error(item.system_id, 'ERECEIPT_DISABLED', item.last_error, f'docId={item.id}')
        return

    if item.document_type == 'invoice' and not cfg.invoice_enabled:
        item.status = 'failed'
        item.last_error = 'Számla beküldés nincs engedélyezve'
        item.updated_at = now_ms()
        log_error(item.system_id, 'INVOICE_DISABLED', item.last_error, f'docId={item.id}')
        return

    if cfg.mode == 'live':
        connector = (cfg.connector or 'cloud_fam').strip().lower()
        missing = []
        if connector == 'hepg':
            if not cfg.hepg_base_url:
                missing.append('hepg_base_url')
            if not cfg.hepg_submit_path:
                missing.append('hepg_submit_path')
        else:
            if not cfg.base_url:
                missing.append('base_url')
            if not cfg.api_key:
                missing.append('api_key')
            if not cfg.live_submit_path:
                missing.append('live_submit_path')
        if missing:
            item.status = 'failed'
            item.last_error = f'Hiányzó NAV konfiguráció: {", ".join(missing)}'
            item.updated_at = now_ms()
            log_error(item.system_id, 'NAV_CONFIG_INCOMPLETE', item.last_error, f'docId={item.id}')
            return

        if connector == 'hepg':
            ok, nav_ref, error_text = _submit_hepg_document(item, cfg)
        else:
            ok, nav_ref, error_text = _submit_live_document(item, cfg)
        if ok:
            item.status = 'sent'
            item.last_error = ''
            item.nav_reference = nav_ref
            item.updated_at = now_ms()
            return

        item.status = 'failed'
        item.last_error = error_text or 'Live NAV connector hiba'
        item.updated_at = now_ms()
        log_error(item.system_id, 'NAV_LIVE_SUBMIT_FAILED', item.last_error, f'docId={item.id}')
        return

    # Mock mód: sikeres beküldés szimuláció
    item.status = 'sent'
    item.last_error = ''
    item.nav_reference = f'MOCK-NAV-{item.id:06d}'
    item.updated_at = now_ms()


@app.get('/health')
def health():
    return {'ok': True, 'service': 'pixifam'}


@app.get('/api/v1/fam/config/nav/{system_id}')
def get_nav_config(system_id: str):
    ensure_system(system_id)
    cfg = ensure_nav_config(system_id)
    return {**result(), 'config': nav_config_to_dict(cfg)}


@app.put('/api/v1/fam/config/nav/{system_id}')
def put_nav_config(system_id: str, payload: NavConfigPayload):
    ensure_system(system_id)
    cfg = ensure_nav_config(system_id)
    cfg.mode = payload.mode
    cfg.env = payload.env
    cfg.connector = payload.connector.strip() if payload.connector else 'cloud_fam'
    cfg.base_url = payload.base_url.strip()
    cfg.api_key = payload.api_key
    cfg.live_submit_path = payload.live_submit_path.strip() or '/api/customers/submit_document/'
    cfg.live_taxpayer_path = payload.live_taxpayer_path.strip() or '/api/customers/lookup_taxpayer/'
    cfg.hepg_base_url = payload.hepg_base_url.strip()
    cfg.hepg_submit_path = payload.hepg_submit_path.strip() or '/api/v1/receipt'
    cfg.hepg_api_key = payload.hepg_api_key
    cfg.hepg_device_id = payload.hepg_device_id.strip()
    cfg.tech_user = payload.tech_user.strip()
    cfg.tech_password = payload.tech_password
    cfg.signing_key_ref = payload.signing_key_ref.strip()
    cfg.exchange_key_ref = payload.exchange_key_ref.strip()
    cfg.invoice_enabled = payload.invoice_enabled
    cfg.ereceipt_enabled = payload.ereceipt_enabled
    cfg.timeout_sec = int(payload.timeout_sec)
    cfg.retry_limit = int(payload.retry_limit)
    save_state()
    return {**result(), 'config': nav_config_to_dict(cfg)}


@app.get('/api/v1/fam/readiness/{system_id}')
def readiness(system_id: str):
    ensure_system(system_id)
    cfg = ensure_nav_config(system_id)

    checks = {
        'service_up': True,
        'system_registered': ensure_system(system_id).fcu_state == 'REGISTERED',
        'nav_mode_set': cfg.mode in {'mock', 'live'},
        'connector_set': cfg.connector in {'cloud_fam', 'hepg'},
        'receipt_flow_enabled': cfg.ereceipt_enabled,
        'invoice_flow_enabled': cfg.invoice_enabled,
        'nav_base_configured': bool(cfg.base_url),
        'nav_api_key_configured': bool(cfg.api_key),
        'nav_submit_path_configured': bool(cfg.live_submit_path),
        'hepg_base_configured': bool(cfg.hepg_base_url),
        'hepg_submit_path_configured': bool(cfg.hepg_submit_path),
    }

    if cfg.mode == 'mock':
        ready = checks['system_registered'] and (checks['receipt_flow_enabled'] or checks['invoice_flow_enabled'])
    else:
        connector = (cfg.connector or 'cloud_fam').strip().lower()
        base_live_checks = [
            checks['service_up'],
            checks['system_registered'],
            checks['nav_mode_set'],
            checks['connector_set'],
            checks['receipt_flow_enabled'] or checks['invoice_flow_enabled'],
        ]
        if connector == 'hepg':
            ready = all(base_live_checks + [checks['hepg_base_configured'], checks['hepg_submit_path_configured']])
        else:
            ready = all(base_live_checks + [checks['nav_base_configured'], checks['nav_api_key_configured'], checks['nav_submit_path_configured']])

    return {
        **result(),
        'systemId': system_id,
        'mode': cfg.mode,
        'ready': ready,
        'checks': checks,
    }


@app.post('/api/v1/fam/documents/submit')
def submit_document(payload: DocumentSubmitPayload):
    system = ensure_system(payload.systemId)
    doc_type = payload.documentType.strip().lower()
    if doc_type not in {'receipt', 'invoice'}:
        return JSONResponse({'resultCode': 'INVALID_DOCUMENT_TYPE', 'resultDesc': 'documentType: receipt|invoice'}, status_code=400)

    if not payload.externalId.strip():
        return JSONResponse({'resultCode': 'INVALID_EXTERNAL_ID', 'resultDesc': 'externalId kötelező'}, status_code=400)

    item = create_document_submission(
        system_id=payload.systemId,
        document_type=doc_type,
        source=payload.source.strip() or 'manual',
        external_id=payload.externalId.strip(),
        payload=payload.payload or {},
    )

    _process_submission(item)
    touch(system)

    return {
        **result(),
        'document': submission_to_dict(item),
    }


@app.get('/api/v1/fam/documents')
def documents(systemId: Optional[str] = None, status: Optional[str] = None, limit: int = 200):
    items = list_documents(system_id=systemId, status=status)
    items = items[:max(1, min(limit, 1000))]
    return {**result(), 'documents': [submission_to_dict(i) for i in items]}


@app.post('/api/v1/fam/documents/{document_id}/retry')
def retry_document(document_id: int):
    from .store import DOCUMENTS
    item = DOCUMENTS.get(document_id)
    if not item:
        return JSONResponse({'resultCode': 'DOCUMENT_NOT_FOUND', 'resultDesc': 'Ismeretlen dokumentum'}, status_code=404)

    item.retry_count += 1
    item.status = 'queued'
    _process_submission(item)
    touch(ensure_system(item.system_id))

    return {**result(), 'document': submission_to_dict(item)}


@app.get('/api/v1/fam/system/status/{system_id}')
def system_status(system_id: str):
    system = ensure_system(system_id)
    payment_methods = [
        {
            'id': pm.id,
            'systemId': system.system_id,
            'displayName': pm.displayName,
            'moneyCat': pm.moneyCat,
            'moneySubCat': pm.moneySubCat,
            'currency': pm.currency,
            'sortKey': pm.sortKey,
        }
        for pm in sorted(system.payment_methods.values(), key=lambda x: (x.sortKey, x.id))
        if pm.active
    ]
    currencies = [
        {
            'currencyCode': c.currencyCode,
            'conversionValue': str(c.conversionValue),
            'displayPrecision': c.displayPrecision,
            'native': c.native,
            'symbol': c.symbol,
        }
        for c in sorted(system.currencies.values(), key=lambda x: x.currencyCode)
    ]

    return {
        **result(),
        'systemId': system.system_id,
        'fcuState': system.fcu_state,
        'fcuMode': 'CLOUD',
        'fiscalDayOpen': system.fiscal_day_open,
        'openedFiscalDayNo': system.opened_fiscal_day_no,
        'lastReceiptNo': system.last_receipt_no,
        'online': system.online,
        'blocked': system.blocked,
        'blockReasons': [system.block_reason] if system.blocked and system.block_reason else [],
        'currencies': currencies,
        'paymentMethods': payment_methods,
        'stateVersion': system.state_version,
        'now': system.updated_at_ms,
    }


@app.get('/api/v1/fam/system/state-check/{system_id}/{timestamp}')
def system_state_check(system_id: str, timestamp: int):
    system = ensure_system(system_id)
    return {
        **result(),
        'changed': system.updated_at_ms > int(timestamp),
        'fiscalDayOpen': system.fiscal_day_open,
        'openedFiscalDayNo': system.opened_fiscal_day_no,
        'lastReceiptNo': system.last_receipt_no,
    }


@app.post('/api/v1/fam/fiscal/open-day')
def open_day(payload: OpenCloseDayRequest):
    system = ensure_system(payload.systemId)
    if system.fiscal_day_open:
        return JSONResponse({'resultCode': 'FISCAL_DAY_ALREADY_OPEN', 'resultDesc': 'Az adóügyi nap már nyitva van'}, status_code=400)

    system.fiscal_day_open = True
    system.opened_fiscal_day_no = 1 if system.opened_fiscal_day_no < 0 else system.opened_fiscal_day_no + 1
    touch(system)
    return {**result(), 'fiscalDayOpen': True, 'openedFiscalDayNo': system.opened_fiscal_day_no}


@app.post('/api/v1/fam/fiscal/close-day')
def close_day(payload: OpenCloseDayRequest):
    system = ensure_system(payload.systemId)
    if not system.fiscal_day_open:
        return JSONResponse({'resultCode': 'FISCAL_DAY_NOT_OPEN', 'resultDesc': 'Nincs nyitott adóügyi nap'}, status_code=400)

    system.fiscal_day_open = False
    touch(system)
    return {**result(), 'fiscalDayOpen': False, 'closedFiscalDayNo': system.opened_fiscal_day_no}


@app.post('/api/v1/fam/telemetry/hello')
def telemetry_hello(payload: TelemetryHelloRequest):
    system = ensure_system(payload.systemId)
    if system.fcu_state == 'REGISTERED':
        return JSONResponse({'resultCode': 'FCU_IS_REGISTERED_ALREADY', 'resultDesc': 'A hello már lefutott'}, status_code=400)

    if system.fcu_state not in {'PENDING', 'CREATED', 'WAITING_FOR_CERT'}:
        return JSONResponse({'resultCode': 'FCU_IS_NOT_PENDING', 'resultDesc': 'A példány nincs hello-kompatibilis állapotban'}, status_code=400)

    system.fcu_state = 'REGISTERED'
    system.online = True
    touch(system)
    system.last_hello_at_ms = system.updated_at_ms
    return result(desc=None)


@app.post('/api/v1/fam/telemetry/query-taxpayer')
def telemetry_query_taxpayer(payload: QueryTaxpayerRequest):
    ensure_system(payload.systemId)
    cfg = ensure_nav_config(payload.systemId)

    taxpayer_id = ''.join([char for char in str(payload.taxpayerId) if char.isdigit()])[:8]
    if len(taxpayer_id) != 8:
        return JSONResponse({'resultCode': 'INVALID_TAXPAYER_ID', 'resultDesc': '8 jegyű adótörzsszám kötelező'}, status_code=400)

    taxpayer_data = None

    if cfg.mode == 'live' and cfg.base_url and cfg.api_key:
        live_taxpayer_url = _join_url(cfg.base_url, cfg.live_taxpayer_path)
        if live_taxpayer_url:
            try:
                response = httpx.post(
                    live_taxpayer_url,
                    json={'tax_number': taxpayer_id},
                    headers=_live_headers(cfg),
                    timeout=max(int(cfg.timeout_sec), 3),
                )
                if response.status_code >= 200 and response.status_code < 300:
                    body = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                    live_data = body.get('data') if isinstance(body, dict) else None
                    if isinstance(live_data, dict):
                        detail = live_data.get('tax_number_detail') or live_data.get('taxNumber') or {}
                        address_list = live_data.get('taxpayer_address_list') or live_data.get('taxpayerAddressList') or []
                        address = address_list[0] if address_list else {}
                        taxpayer_data = {
                            'taxpayerName': live_data.get('taxpayer_name') or live_data.get('taxpayerName') or '',
                            'taxpayerShortName': live_data.get('taxpayer_short_name') or live_data.get('taxpayerShortName') or '',
                            'taxNumber': {
                                'taxpayerId': str(detail.get('taxpayerId') or taxpayer_id),
                                'vatCode': str(detail.get('vatCode') or ''),
                                'countyCode': str(detail.get('countyCode') or ''),
                            },
                            'taxpayerAddressList': [{
                                'taxpayerAddressClass': address.get('taxpayerAddressType') or 'HQ',
                                'taxpayerAddress': {
                                    'countryCode': address.get('countryCode') or 'HU',
                                    'postalCode': address.get('postalCode') or '',
                                    'city': address.get('city') or '',
                                    'streetName': address.get('streetName') or address.get('street') or '',
                                    'streetType': address.get('publicPlaceCategory') or address.get('streetType') or '',
                                    'number': address.get('number') or address.get('houseNumber') or '',
                                    'building': address.get('building'),
                                    'staircase': address.get('staircase'),
                                    'floor': address.get('floor'),
                                    'door': address.get('door'),
                                },
                            }],
                        }
            except Exception as live_ex:
                log_error(payload.systemId, 'QUERY_TAXPAYER_LIVE_FAILED', 'Live adószám lekérdezés sikertelen', str(live_ex))

    if taxpayer_data:
        return {
            **result(desc=None),
            'infoDate': ensure_system(payload.systemId).updated_at_ms,
            'taxpayerValidity': True,
            'taxpayerData': taxpayer_data,
        }

    try:
        response = httpx.post(
            f'{ERP_API_BASE}/finance/pixinvoice/lookup-taxpayer/',
            json={'tax_number': taxpayer_id},
            timeout=10,
        )
        response.raise_for_status()
        body = response.json() or {}
        nav_wrapped = body.get('data')
        nav_data = nav_wrapped.get('data') if isinstance(nav_wrapped, dict) else None
        if nav_data:
            number_detail = nav_data.get('tax_number_detail') or {}
            address_list = nav_data.get('taxpayer_address_list') or []
            address = address_list[0] if address_list else {}
            taxpayer_data = {
                'taxpayerName': nav_data.get('taxpayer_short_name') or nav_data.get('taxpayer_name') or '',
                'taxpayerShortName': nav_data.get('taxpayer_short_name') or nav_data.get('taxpayer_name') or '',
                'taxNumber': {
                    'taxpayerId': str(number_detail.get('taxpayerId') or taxpayer_id),
                    'vatCode': str(number_detail.get('vatCode') or ''),
                    'countyCode': str(number_detail.get('countyCode') or ''),
                },
                'taxpayerAddressList': [{
                    'taxpayerAddressClass': address.get('taxpayerAddressType') or 'HQ',
                    'taxpayerAddress': {
                        'countryCode': address.get('countryCode') or 'HU',
                        'postalCode': address.get('postalCode') or '',
                        'city': address.get('city') or '',
                        'streetName': address.get('streetName') or address.get('street') or '',
                        'streetType': address.get('publicPlaceCategory') or address.get('streetType') or '',
                        'number': address.get('number') or address.get('houseNumber') or '',
                        'building': address.get('building'),
                        'staircase': address.get('staircase'),
                        'floor': address.get('floor'),
                        'door': address.get('door'),
                    },
                }],
            }
    except Exception:
        log_error(payload.systemId, 'QUERY_TAXPAYER_FAILED', 'Adószám lekérdezés sikertelen', 'PixInvoice/NAV proxy hívás hiba')
        taxpayer_data = None

    return {
        **result(desc=None),
        'infoDate': ensure_system(payload.systemId).updated_at_ms,
        'taxpayerValidity': bool(taxpayer_data),
        'taxpayerData': taxpayer_data,
    }


@app.get('/api/v1/fam/logs/events')
def logs_events(systemId: Optional[str] = None, limit: int = 200):
    events = EVENTS
    if systemId:
        events = [item for item in events if item.get('systemId') == systemId]
    events = sorted(events, key=lambda x: x.get('createdAt', 0), reverse=True)[:max(1, min(limit, 1000))]
    return {**result(), 'events': events}


@app.get('/api/v1/fam/logs/errors')
def logs_errors(systemId: Optional[str] = None, limit: int = 200):
    errors = ERRORS
    if systemId:
        errors = [item for item in errors if item.get('systemId') == systemId]
    errors = sorted(errors, key=lambda x: x.get('createdAt', 0), reverse=True)[:max(1, min(limit, 1000))]
    return {**result(), 'errors': errors}


@app.post('/api/v1/fam/telemetry/ecr-event')
def telemetry_event(payload: EcrEventRequest):
    system = ensure_system(payload.systemId)

    EVENTS.append({
        'systemId': payload.systemId,
        'ecrEventType': payload.ecrEventType,
        'ecrEventValue': payload.ecrEventValue,
        'createdAt': system.updated_at_ms,
    })
    save_state()

    if payload.ecrEventType == 'BLOCK':
        system.blocked = True
        system.block_reason = 'NTCA'
        system.fcu_state = 'SUSPENDED'
        touch(system)
    elif payload.ecrEventType == 'UNBLOCK':
        system.blocked = False
        system.block_reason = ''
        if system.fcu_state == 'SUSPENDED':
            system.fcu_state = 'REGISTERED'
        touch(system)

    return result(desc=None)


@app.get('/api/v1/fam/currency/{system_id}')
def currency_all(system_id: str):
    system = ensure_system(system_id)
    currencies = [
        {
            'currencyCode': c.currencyCode,
            'conversionValue': str(c.conversionValue),
            'displayPrecision': c.displayPrecision,
            'native': c.native,
            'symbol': c.symbol,
        }
        for c in sorted(system.currencies.values(), key=lambda x: x.currencyCode)
    ]
    return {**result(), 'currencies': currencies}


@app.get('/api/v1/fam/currency/{system_id}/{currency_code}')
def currency_one(system_id: str, currency_code: str):
    system = ensure_system(system_id)
    code = currency_code.upper()
    currency = system.currencies.get(code)
    if not currency:
        return JSONResponse({'resultCode': 'CANNOT_GET_CURRENCY', 'resultDesc': 'Ismeretlen valuta'}, status_code=404)

    return {
        **result(),
        'currency': {
            'currencyCode': currency.currencyCode,
            'conversionValue': str(currency.conversionValue),
            'displayPrecision': currency.displayPrecision,
            'native': currency.native,
            'symbol': currency.symbol,
        },
    }


@app.post('/api/v1/fam/currency/{system_id}')
def currency_save(system_id: str, payload: CurrencyPayload):
    system = ensure_system(system_id)
    code = payload.currencyCode.upper().strip()
    if len(code) != 3:
        return JSONResponse({'resultCode': 'CANNOT_SAVE_CURRENCY', 'resultDesc': 'Érvénytelen devizakód'}, status_code=400)

    try:
        conversion_value = Decimal(str(payload.conversionValue))
    except (InvalidOperation, ValueError):
        return JSONResponse({'resultCode': 'CANNOT_SAVE_CURRENCY', 'resultDesc': 'Érvénytelen conversionValue'}, status_code=400)

    existing = system.currencies.get(code)
    if existing and existing.native and code == 'HUF':
        return JSONResponse({'resultCode': 'CANNOT_SAVE_CURRENCY', 'resultDesc': 'A honos valuta (HUF) nem módosítható'}, status_code=400)

    if payload.isNative:
        for item in system.currencies.values():
            item.native = False

    system.currencies[code] = type(next(iter(system.currencies.values()))) if False else system.currencies.get(code)  # no-op for type checker
    from .store import Currency
    system.currencies[code] = Currency(
        currencyCode=code,
        conversionValue=conversion_value,
        displayPrecision=payload.displayPrecision,
        native=payload.isNative,
        symbol=payload.symbol,
    )
    touch(system)
    return result(desc=None)


@app.delete('/api/v1/fam/currency/{system_id}/{currency_code}')
def currency_delete(system_id: str, currency_code: str):
    system = ensure_system(system_id)
    code = currency_code.upper()
    currency = system.currencies.get(code)
    if not currency:
        return JSONResponse({'resultCode': 'CANNOT_GET_CURRENCY', 'resultDesc': 'Ismeretlen valuta'}, status_code=404)
    if currency.native:
        return JSONResponse({'resultCode': 'CANNOT_DELETE_CURRENCY', 'resultDesc': 'A honos valuta nem törölhető'}, status_code=400)

    del system.currencies[code]
    touch(system)
    return result(desc=None)


@app.get('/api/v1/fam/payment-method/predefined')
def payment_method_predefined():
    return {**result(), 'paymentMethods': PREDEFINED_PAYMENT_METHODS}


@app.get('/api/v1/fam/payment-method/{system_id}')
def payment_method_all(system_id: str):
    system = ensure_system(system_id)
    methods = [
        {
            'id': pm.id,
            'systemId': system.system_id,
            'displayName': pm.displayName,
            'moneyCat': pm.moneyCat,
            'moneySubCat': pm.moneySubCat,
            'currency': pm.currency,
            'sortKey': pm.sortKey,
        }
        for pm in sorted(system.payment_methods.values(), key=lambda x: (x.sortKey, x.id))
        if pm.active
    ]
    return {**result(), 'paymentMethods': methods}


@app.get('/api/v1/fam/payment-method/{system_id}/{payment_method_id}')
def payment_method_one(system_id: str, payment_method_id: int):
    system = ensure_system(system_id)
    pm = system.payment_methods.get(payment_method_id)
    if not pm or not pm.active:
        return JSONResponse({'resultCode': 'CANNOT_GET_PAYMENT_METHOD', 'resultDesc': 'Ismeretlen fizetési mód'}, status_code=404)

    return {
        **result(),
        'paymentMethod': {
            'id': pm.id,
            'systemId': system.system_id,
            'displayName': pm.displayName,
            'moneyCat': pm.moneyCat,
            'moneySubCat': pm.moneySubCat,
            'currency': pm.currency,
            'sortKey': pm.sortKey,
        },
    }


@app.post('/api/v1/fam/payment-method/{system_id}')
def payment_method_save(system_id: str, payload: PaymentMethodPayload):
    system = ensure_system(system_id)

    if payload.systemId != system_id:
        return JSONResponse({'resultCode': 'INVALID_SYSTEM_ID', 'resultDesc': 'systemId eltérés'}, status_code=400)

    if payload.id:
        pm = system.payment_methods.get(payload.id)
        if not pm:
            return JSONResponse({'resultCode': 'CANNOT_SAVE_PAYMENT_METHOD', 'resultDesc': 'Ismeretlen fizetési mód'}, status_code=404)
        pm.displayName = payload.displayName
        pm.moneyCat = payload.moneyCat
        pm.moneySubCat = payload.moneySubCat
        pm.currency = payload.currency.upper()
        pm.sortKey = payload.sortKey
        pm.active = True
    else:
        pm_id = system.next_payment_method_id
        system.next_payment_method_id += 1
        from .store import PaymentMethod
        system.payment_methods[pm_id] = PaymentMethod(
            id=pm_id,
            displayName=payload.displayName,
            moneyCat=payload.moneyCat,
            moneySubCat=payload.moneySubCat,
            currency=payload.currency.upper(),
            sortKey=payload.sortKey,
            active=True,
        )

    touch(system)
    return result(desc=None)


@app.delete('/api/v1/fam/payment-method/{system_id}/{payment_method_id}')
def payment_method_delete(system_id: str, payment_method_id: int):
    system = ensure_system(system_id)
    pm = system.payment_methods.get(payment_method_id)
    if not pm or not pm.active:
        return JSONResponse({'resultCode': 'CANNOT_GET_PAYMENT_METHOD', 'resultDesc': 'Ismeretlen fizetési mód'}, status_code=404)

    if pm.moneyCat in {'CASH', 'CARD', 'AFR'} and pm.currency.upper() == 'HUF':
        return JSONResponse({'resultCode': 'CANNOT_DELETE_PAYMENT_METHOD', 'resultDesc': 'Alapértelmezett fizetési mód nem törölhető'}, status_code=400)

    pm.active = False
    touch(system)
    return result(desc=None)
