from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def now_dt() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Currency:
    currencyCode: str
    conversionValue: Decimal
    displayPrecision: int
    native: bool
    symbol: str


@dataclass
class PaymentMethod:
    id: int
    displayName: str
    moneyCat: str
    moneySubCat: Optional[str]
    currency: str
    sortKey: str
    active: bool = True


@dataclass
class FiscalSystem:
    system_id: str
    fcu_state: str = 'PENDING'
    fiscal_day_open: bool = False
    opened_fiscal_day_no: int = -1
    last_receipt_no: int = 0
    online: bool = True
    blocked: bool = False
    block_reason: str = ''
    state_version: int = 1
    updated_at_ms: int = field(default_factory=now_ms)
    last_hello_at_ms: Optional[int] = None
    currencies: Dict[str, Currency] = field(default_factory=dict)
    payment_methods: Dict[int, PaymentMethod] = field(default_factory=dict)
    next_payment_method_id: int = 1


@dataclass
class NavConfig:
    mode: str = 'mock'  # mock | live
    env: str = 'sandbox'  # sandbox | production
    connector: str = 'cloud_fam'  # cloud_fam | hepg
    base_url: str = ''
    api_key: str = ''
    live_submit_path: str = '/api/customers/submit_document/'
    live_taxpayer_path: str = '/api/customers/lookup_taxpayer/'
    hepg_base_url: str = ''
    hepg_submit_path: str = '/api/v1/receipt'
    hepg_api_key: str = ''
    hepg_device_id: str = ''
    tech_user: str = ''
    tech_password: str = ''
    signing_key_ref: str = ''
    exchange_key_ref: str = ''
    invoice_enabled: bool = False
    ereceipt_enabled: bool = False
    timeout_sec: int = 20
    retry_limit: int = 3


@dataclass
class DocumentSubmission:
    id: int
    system_id: str
    document_type: str  # receipt | invoice
    source: str  # pos | manual
    external_id: str
    payload: dict
    status: str = 'queued'  # queued | sent | failed
    nav_reference: str = ''
    last_error: str = ''
    retry_count: int = 0
    created_at: int = field(default_factory=now_ms)
    updated_at: int = field(default_factory=now_ms)


SYSTEMS: Dict[str, FiscalSystem] = {}
EVENTS: List[dict] = []
ERRORS: List[dict] = []
NAV_CONFIGS: Dict[str, NavConfig] = {}
DOCUMENTS: Dict[int, DocumentSubmission] = {}
NEXT_DOCUMENT_ID: int = 1


PREDEFINED_PAYMENT_METHODS = [
    {
        'displayName': 'Forint készpénz',
        'moneyCat': 'CASH',
        'moneySubCat': None,
        'currency': 'HUF',
        'sortKey': '0001',
    },
    {
        'displayName': 'Forint bankkártya',
        'moneyCat': 'CARD',
        'moneySubCat': None,
        'currency': 'HUF',
        'sortKey': '0002',
    },
    {
        'displayName': 'Forint AFR',
        'moneyCat': 'AFR',
        'moneySubCat': None,
        'currency': 'HUF',
        'sortKey': '0003',
    },
]


def _state_file_path() -> Path:
    env_path = os.getenv('FAM_STATE_FILE', '').strip()
    if env_path:
        return Path(env_path)
    return Path(__file__).resolve().parent.parent / 'data' / 'state.json'


def _json_default(value):
    if isinstance(value, Decimal):
        return str(value)
    return value


def _to_currency(data: dict) -> Currency:
    return Currency(
        currencyCode=str(data.get('currencyCode', 'HUF')).upper(),
        conversionValue=Decimal(str(data.get('conversionValue', '1'))),
        displayPrecision=int(data.get('displayPrecision', 0)),
        native=bool(data.get('native', False)),
        symbol=str(data.get('symbol', '')),
    )


def _to_payment_method(data: dict) -> PaymentMethod:
    return PaymentMethod(
        id=int(data.get('id', 0)),
        displayName=str(data.get('displayName', '')),
        moneyCat=str(data.get('moneyCat', 'OTHER')),
        moneySubCat=data.get('moneySubCat'),
        currency=str(data.get('currency', 'HUF')).upper(),
        sortKey=str(data.get('sortKey', '9999')),
        active=bool(data.get('active', True)),
    )


def save_state() -> None:
    path = _state_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        'next_document_id': NEXT_DOCUMENT_ID,
        'systems': {
            system_id: {
                'system_id': item.system_id,
                'fcu_state': item.fcu_state,
                'fiscal_day_open': item.fiscal_day_open,
                'opened_fiscal_day_no': item.opened_fiscal_day_no,
                'last_receipt_no': item.last_receipt_no,
                'online': item.online,
                'blocked': item.blocked,
                'block_reason': item.block_reason,
                'state_version': item.state_version,
                'updated_at_ms': item.updated_at_ms,
                'last_hello_at_ms': item.last_hello_at_ms,
                'next_payment_method_id': item.next_payment_method_id,
                'currencies': {
                    key: {
                        'currencyCode': c.currencyCode,
                        'conversionValue': str(c.conversionValue),
                        'displayPrecision': c.displayPrecision,
                        'native': c.native,
                        'symbol': c.symbol,
                    }
                    for key, c in item.currencies.items()
                },
                'payment_methods': {
                    str(key): {
                        'id': pm.id,
                        'displayName': pm.displayName,
                        'moneyCat': pm.moneyCat,
                        'moneySubCat': pm.moneySubCat,
                        'currency': pm.currency,
                        'sortKey': pm.sortKey,
                        'active': pm.active,
                    }
                    for key, pm in item.payment_methods.items()
                },
            }
            for system_id, item in SYSTEMS.items()
        },
        'nav_configs': {
            system_id: {
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
            for system_id, cfg in NAV_CONFIGS.items()
        },
        'documents': {
            str(doc_id): {
                'id': item.id,
                'system_id': item.system_id,
                'document_type': item.document_type,
                'source': item.source,
                'external_id': item.external_id,
                'payload': item.payload,
                'status': item.status,
                'nav_reference': item.nav_reference,
                'last_error': item.last_error,
                'retry_count': item.retry_count,
                'created_at': item.created_at,
                'updated_at': item.updated_at,
            }
            for doc_id, item in DOCUMENTS.items()
        },
        'events': EVENTS,
        'errors': ERRORS,
    }

    temp_path = path.with_suffix(path.suffix + '.tmp')
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding='utf-8')
    temp_path.replace(path)


def load_state() -> None:
    global NEXT_DOCUMENT_ID

    path = _state_file_path()
    if not path.exists():
        return

    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return

    SYSTEMS.clear()
    NAV_CONFIGS.clear()
    DOCUMENTS.clear()
    EVENTS.clear()
    ERRORS.clear()

    for system_id, data in (payload.get('systems') or {}).items():
        item = FiscalSystem(
            system_id=str(data.get('system_id') or system_id),
            fcu_state=str(data.get('fcu_state', 'PENDING')),
            fiscal_day_open=bool(data.get('fiscal_day_open', False)),
            opened_fiscal_day_no=int(data.get('opened_fiscal_day_no', -1)),
            last_receipt_no=int(data.get('last_receipt_no', 0)),
            online=bool(data.get('online', True)),
            blocked=bool(data.get('blocked', False)),
            block_reason=str(data.get('block_reason', '')),
            state_version=int(data.get('state_version', 1)),
            updated_at_ms=int(data.get('updated_at_ms', now_ms())),
            last_hello_at_ms=data.get('last_hello_at_ms'),
            next_payment_method_id=int(data.get('next_payment_method_id', 1)),
        )
        item.currencies = {
            str(code).upper(): _to_currency(currency_data)
            for code, currency_data in (data.get('currencies') or {}).items()
        }
        item.payment_methods = {
            int(key): _to_payment_method(pm_data)
            for key, pm_data in (data.get('payment_methods') or {}).items()
        }
        SYSTEMS[item.system_id] = item

    for system_id, cfg_data in (payload.get('nav_configs') or {}).items():
        NAV_CONFIGS[str(system_id)] = NavConfig(
            mode=str(cfg_data.get('mode', 'mock')),
            env=str(cfg_data.get('env', 'sandbox')),
            connector=str(cfg_data.get('connector', 'cloud_fam')),
            base_url=str(cfg_data.get('base_url', '')),
            api_key=str(cfg_data.get('api_key', '')),
            live_submit_path=str(cfg_data.get('live_submit_path', '/api/customers/submit_document/')),
            live_taxpayer_path=str(cfg_data.get('live_taxpayer_path', '/api/customers/lookup_taxpayer/')),
            hepg_base_url=str(cfg_data.get('hepg_base_url', '')),
            hepg_submit_path=str(cfg_data.get('hepg_submit_path', '/api/v1/receipt')),
            hepg_api_key=str(cfg_data.get('hepg_api_key', '')),
            hepg_device_id=str(cfg_data.get('hepg_device_id', '')),
            tech_user=str(cfg_data.get('tech_user', '')),
            tech_password=str(cfg_data.get('tech_password', '')),
            signing_key_ref=str(cfg_data.get('signing_key_ref', '')),
            exchange_key_ref=str(cfg_data.get('exchange_key_ref', '')),
            invoice_enabled=bool(cfg_data.get('invoice_enabled', False)),
            ereceipt_enabled=bool(cfg_data.get('ereceipt_enabled', False)),
            timeout_sec=int(cfg_data.get('timeout_sec', 20)),
            retry_limit=int(cfg_data.get('retry_limit', 3)),
        )

    for doc_id, doc_data in (payload.get('documents') or {}).items():
        document = DocumentSubmission(
            id=int(doc_data.get('id', doc_id)),
            system_id=str(doc_data.get('system_id', '')),
            document_type=str(doc_data.get('document_type', 'receipt')),
            source=str(doc_data.get('source', 'manual')),
            external_id=str(doc_data.get('external_id', '')),
            payload=doc_data.get('payload') or {},
            status=str(doc_data.get('status', 'queued')),
            nav_reference=str(doc_data.get('nav_reference', '')),
            last_error=str(doc_data.get('last_error', '')),
            retry_count=int(doc_data.get('retry_count', 0)),
            created_at=int(doc_data.get('created_at', now_ms())),
            updated_at=int(doc_data.get('updated_at', now_ms())),
        )
        DOCUMENTS[int(doc_id)] = document

    EVENTS.extend(payload.get('events') or [])
    ERRORS.extend(payload.get('errors') or [])
    NEXT_DOCUMENT_ID = int(payload.get('next_document_id', (max(DOCUMENTS.keys()) + 1) if DOCUMENTS else 1))


def touch(system: FiscalSystem):
    system.state_version += 1
    system.updated_at_ms = now_ms()
    save_state()


def ensure_system(system_id: str) -> FiscalSystem:
    if system_id not in SYSTEMS:
        system = FiscalSystem(system_id=system_id)
        system.currencies['HUF'] = Currency(
            currencyCode='HUF',
            conversionValue=Decimal('1'),
            displayPrecision=0,
            native=True,
            symbol='Ft',
        )
        for item in PREDEFINED_PAYMENT_METHODS:
            pm_id = system.next_payment_method_id
            system.next_payment_method_id += 1
            system.payment_methods[pm_id] = PaymentMethod(
                id=pm_id,
                displayName=item['displayName'],
                moneyCat=item['moneyCat'],
                moneySubCat=item['moneySubCat'],
                currency=item['currency'],
                sortKey=item['sortKey'],
            )
        SYSTEMS[system_id] = system
        save_state()
    return SYSTEMS[system_id]


def ensure_nav_config(system_id: str) -> NavConfig:
    if system_id not in NAV_CONFIGS:
        NAV_CONFIGS[system_id] = NavConfig()
        save_state()
    return NAV_CONFIGS[system_id]


def create_document_submission(system_id: str, document_type: str, source: str, external_id: str, payload: dict) -> DocumentSubmission:
    global NEXT_DOCUMENT_ID
    item = DocumentSubmission(
        id=NEXT_DOCUMENT_ID,
        system_id=system_id,
        document_type=document_type,
        source=source,
        external_id=external_id,
        payload=payload,
    )
    DOCUMENTS[NEXT_DOCUMENT_ID] = item
    NEXT_DOCUMENT_ID += 1
    save_state()
    return item


def list_documents(system_id: Optional[str] = None, status: Optional[str] = None) -> List[DocumentSubmission]:
    items = list(DOCUMENTS.values())
    if system_id:
        items = [i for i in items if i.system_id == system_id]
    if status:
        items = [i for i in items if i.status == status]
    return sorted(items, key=lambda x: x.created_at, reverse=True)


def log_error(system_id: str, code: str, message: str, details: Optional[str] = None):
    ERRORS.append({
        'systemId': system_id,
        'code': code,
        'message': message,
        'details': details,
        'createdAt': now_ms(),
    })
    save_state()


load_state()
